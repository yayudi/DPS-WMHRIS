package usecase

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"time"

	catalog_port "github.com/dps-wmhris/backend/internal/modules/catalog/port"
	inventory_dto "github.com/dps-wmhris/backend/internal/modules/inventory/application/dto"
	"github.com/dps-wmhris/backend/internal/modules/inventory/domain"
	"github.com/dps-wmhris/backend/internal/modules/inventory/port"
	"github.com/dps-wmhris/backend/internal/shared/database"
	"github.com/dps-wmhris/backend/internal/shared/eventbus"
)

type stockTransactionService struct {
	txManager   database.TransactionManager
	trxRepo     port.StockTransactionRepository
	locRepo     port.LocationRepository
	outboxRepo  port.OutboxRepository
	keljaClient port.KeljaClient
	productRepo catalog_port.ProductRepository
	eventBus    eventbus.EventBus
}

func NewStockTransactionService(
	txManager database.TransactionManager,
	trxRepo port.StockTransactionRepository,
	locRepo port.LocationRepository,
	outboxRepo port.OutboxRepository,
	keljaClient port.KeljaClient,
	productRepo catalog_port.ProductRepository,
	eventBus eventbus.EventBus,
) port.StockTransactionUseCase {
	return &stockTransactionService{
		txManager:   txManager,
		trxRepo:     trxRepo,
		locRepo:     locRepo,
		outboxRepo:  outboxRepo,
		keljaClient: keljaClient,
		productRepo: productRepo,
		eventBus:    eventBus,
	}
}

type itemAllocation struct {
	productID int
	allocs    []struct {
		locID int
		qty   int
	}
}

func (s *stockTransactionService) CreateTransaction(ctx context.Context, req inventory_dto.CreateTransactionRequest) (*domain.StockTransaction, error) {
	trx := &domain.StockTransaction{
		TransactionNo:    fmt.Sprintf("TRX-%d", time.Now().UnixNano()),
		ReferenceType:    req.ReferenceType,
		ReferenceID:      req.ReferenceID,
		AssignedBuilding: req.AssignedBuilding,
		Status:           domain.TransactionStatusPending,
		Notes:            req.Notes,
		CreatedAt:        time.Now(),
		UpdatedAt:        time.Now(),
	}

	for _, item := range req.Items {
		if err := trx.AddDemand(item.ProductID, item.TargetQuantity); err != nil {
			return nil, err
		}
	}

	err := s.txManager.WithTransaction(ctx, func(ctx context.Context) error {
		var deficits []domain.ReplenishmentDeficit
		isOutOfStock := false
		var readyAllocations []itemAllocation

		for _, item := range req.Items {
			// 1. Check fulfillment source availability (across all buildings)
			displayLocs, err := s.locRepo.FindFulfillmentSourceStock(ctx, int(item.ProductID))
			if err != nil {
				return err
			}

			totalDisplayAvail := 0
			for _, loc := range displayLocs {
				totalDisplayAvail += loc.AvailableQuantity
			}

			if totalDisplayAvail < item.TargetQuantity {
				// Deficit in fulfillment sources! Query candidate replenishment stock across warehouses
				deficitQty := item.TargetQuantity - totalDisplayAvail
				storageLocs, err := s.locRepo.FindReplenishmentCandidateStock(ctx, int(item.ProductID))
				if err != nil {
					return err
				}

				totalStorageAvail := 0
				var suggestedSources []domain.SuggestedReplenishmentSource
				for _, sloc := range storageLocs {
					totalStorageAvail += sloc.AvailableQuantity
					source := domain.SuggestedReplenishmentSource{
						LocationID:        sloc.LocationID,
						AvailableQuantity: sloc.AvailableQuantity,
						Purpose:           "STORAGE",
						Building:          req.AssignedBuilding,
					}
					if locDetail, err := s.locRepo.FindByID(ctx, sloc.LocationID); err == nil && locDetail != nil {
						source.LocationCode = locDetail.Code
						source.Building = locDetail.Building
						source.Purpose = locDetail.Purpose
					}
					suggestedSources = append(suggestedSources, source)
				}

				if (totalDisplayAvail + totalStorageAvail) < item.TargetQuantity {
					isOutOfStock = true
				}

				sku := ""
				productName := ""
				if s.productRepo != nil {
					if prod, err := s.productRepo.FindByID(ctx, int(item.ProductID)); err == nil && prod != nil {
						sku = prod.SKU
						productName = prod.Name
					}
				}

				deficits = append(deficits, domain.ReplenishmentDeficit{
					ProductID:                item.ProductID,
					SKU:                      sku,
					ProductName:              productName,
					TargetQuantity:           item.TargetQuantity,
					DisplayAvailableQuantity: totalDisplayAvail,
					DeficitQuantity:          deficitQty,
					SuggestedSources:         suggestedSources,
				})
			} else {
				// Plan greedy allocation for DISPLAY
				alloc := itemAllocation{productID: int(item.ProductID)}
				remainingNeeded := item.TargetQuantity
				for _, loc := range displayLocs {
					if remainingNeeded <= 0 {
						break
					}
					allocQty := loc.AvailableQuantity
					if allocQty > remainingNeeded {
						allocQty = remainingNeeded
					}
					alloc.allocs = append(alloc.allocs, struct {
						locID int
						qty   int
					}{locID: loc.LocationID, qty: allocQty})
					remainingNeeded -= allocQty
				}
				readyAllocations = append(readyAllocations, alloc)
			}
		}

		// 2. Evaluate state
		if isOutOfStock {
			_ = trx.MarkOnHoldForReplenishment(deficits)
			trx.Status = domain.TransactionStatusOutOfStock
			return s.trxRepo.CreateTx(ctx, trx)
		}

		if len(deficits) > 0 {
			_ = trx.MarkOnHoldForReplenishment(deficits)
			return s.trxRepo.CreateTx(ctx, trx)
		}

		// 3. Fully available in DISPLAY: execute reservations
		trx.Status = domain.TransactionStatusReadyToPick
		for _, alloc := range readyAllocations {
			for _, al := range alloc.allocs {
				if err := s.locRepo.ReserveStock(ctx, alloc.productID, al.locID, al.qty); err != nil {
					return err
				}
			}
		}

		return s.trxRepo.CreateTx(ctx, trx)
	})

	if err != nil {
		return nil, err
	}

	return trx, nil
}

func (s *stockTransactionService) ExecuteTransaction(ctx context.Context, req inventory_dto.ExecuteTransactionRequest, userID uint) error {
	return s.txManager.WithTransaction(ctx, func(ctx context.Context) error {
		// 1. Muat (Load) Aggregate Root
		trx, err := s.trxRepo.GetByID(ctx, req.TransactionID)
		if err != nil {
			return err
		}
		if trx == nil {
			return errors.New("transaction not found")
		}

		// Load location
		loc, err := s.locRepo.FindByID(ctx, int(req.LocationID))
		if err != nil {
			return err
		}

		// 2. Lakukan validasi ProcessLine (termasuk Guard Clauses)
		if err := trx.ProcessLine(req.MovementID, loc, req.QtyDone, userID); err != nil {
			return err
		}

		// Find the product ID from movement to release reserved and deduct actual
		var productID uint
		for _, m := range trx.Movements {
			if m.ID == req.MovementID {
				productID = m.ProductID
				break
			}
		}

		// 3. Kurangi reserved_quantity dan potong quantity fisik secara atomik
		if err := s.locRepo.ReleaseStock(ctx, int(productID), int(req.LocationID), req.QtyDone); err != nil {
			return err
		}
		if err := s.locRepo.DeductStock(ctx, int(productID), int(req.LocationID), req.QtyDone); err != nil {
			return err
		}

		// 4. Simpan log inv_movement_lines
		if err := s.trxRepo.SaveFulfillmentTx(ctx, trx); err != nil {
			return err
		}
		
		// 5. Check if fully fulfilled and write outbox event atomically
		if trx.Status == "COMPLETED" && s.outboxRepo != nil {
			payload := map[string]interface{}{
				"transaction_no": trx.TransactionNo,
				"reference_id":   trx.ReferenceID,
				"reference_type": trx.ReferenceType,
				"completed_at":   time.Now(),
			}
			payloadBytes, err := json.Marshal(payload)
			if err != nil {
				return fmt.Errorf("failed to marshal outbox payload: %w", err)
			}

			outboxEvent := &domain.OutboxEvent{
				AggregateType: "StockTransaction",
				AggregateID:   trx.TransactionNo,
				EventType:     "InventoryFulfilled",
				Payload:       string(payloadBytes),
				Status:        "PENDING",
				CreatedAt:     time.Now(),
			}
			if err := s.outboxRepo.SaveTx(ctx, outboxEvent); err != nil {
				return fmt.Errorf("failed to save outbox event: %w", err)
			}
		}

		return nil
	})
}

func (s *stockTransactionService) BatchExecuteTransactions(ctx context.Context, req inventory_dto.BatchExecuteTransactionRequest, userID uint) (*inventory_dto.BatchExecuteResult, error) {
	result := &inventory_dto.BatchExecuteResult{
		TotalProcessed: len(req.Items),
	}

	for _, item := range req.Items {
		if err := s.ExecuteTransaction(ctx, item, userID); err != nil {
			result.FailureCount++
			errMsg := fmt.Sprintf("trx %d movement %d failed: %v", item.TransactionID, item.MovementID, err)
			result.Errors = append(result.Errors, errMsg)
		} else {
			result.SuccessCount++
		}
	}

	return result, nil
}

func (s *stockTransactionService) DispatchPendingOutboxEvents(ctx context.Context) (int, error) {
	if s.outboxRepo == nil || s.eventBus == nil {
		return 0, nil
	}

	events, err := s.outboxRepo.GetPendingEvents(ctx, 50)
	if err != nil {
		return 0, err
	}

	dispatched := 0
	for _, outboxEvt := range events {
		if !json.Valid([]byte(outboxEvt.Payload)) {
			_ = s.outboxRepo.IncrementRetry(ctx, outboxEvt.ID)
			continue
		}

		err := s.eventBus.Publish(ctx, eventbus.NewEvent(
			outboxEvt.EventType,
			json.RawMessage(outboxEvt.Payload),
			0,
		))
		if err != nil {
			_ = s.outboxRepo.IncrementRetry(ctx, outboxEvt.ID)
			return dispatched, err
		}

		if err := s.outboxRepo.MarkAsPublished(ctx, outboxEvt.ID); err != nil {
			return dispatched, err
		}
		dispatched++
	}

	return dispatched, nil
}

func (s *stockTransactionService) ReconcileMissingFulfillments(ctx context.Context) (int, error) {
	if s.keljaClient == nil || s.productRepo == nil {
		return 0, nil
	}

	// 1. Fetch recent fulfillments from Kelja
	list, err := s.keljaClient.FetchRecentFulfillments(ctx, 1, 50)
	if err != nil {
		return 0, err
	}
	if len(list) == 0 {
		return 0, nil
	}

	reconciledCount := 0
	for _, order := range list {
		// Only reconcile active pending orders
		if order.Status == "CANCELLED" || order.Status == "FINISHED" || order.Status == "VOID" {
			continue
		}

		// 2. Check if already exists in WMS by reference
		existing, err := s.trxRepo.GetByReference(ctx, "KELJA_FULFILLMENT", order.Code)
		if err != nil {
			log.Printf("[Reconciliation] Error checking reference %s: %v", order.Code, err)
			continue
		}
		if existing != nil {
			continue
		}

		// 3. Not in WMS! Fetch detail from Kelja
		detail, err := s.keljaClient.FetchFulfillmentDetail(ctx, order.ID)
		if err != nil {
			log.Printf("[Reconciliation] Failed to fetch detail for Kelja ID %d: %v", order.ID, err)
			continue
		}

		if len(detail.Items) == 0 {
			continue
		}

		// 4. Map ProductCode (SKU) to ProductID
		var items []inventory_dto.TransactionItemRequest
		for _, itm := range detail.Items {
			prodID, err := s.productRepo.GetProductIDBySKUTx(ctx, itm.ProductCode)
			if err != nil || prodID == 0 {
				log.Printf("[Reconciliation] Product SKU %s not found in WMS catalog", itm.ProductCode)
				continue
			}
			items = append(items, inventory_dto.TransactionItemRequest{
				ProductID:      uint(prodID),
				TargetQuantity: itm.Quantity,
			})
		}

		if len(items) == 0 {
			continue
		}

		// 5. Create transaction in WMS with Greedy Multi-Location Split in DISPLAY
		createReq := inventory_dto.CreateTransactionRequest{
			ReferenceType:    "KELJA_FULFILLMENT",
			ReferenceID:      order.Code,
			AssignedBuilding: "",
			Items:            items,
		}

		_, err = s.CreateTransaction(ctx, createReq)
		if err != nil {
			log.Printf("[Reconciliation] Failed to auto-create transaction for %s: %v", order.Code, err)
			continue
		}

		log.Printf("[Reconciliation] Successfully recovered missing order %s (Kelja ID %d)", order.Code, order.ID)
		reconciledCount++
	}

	return reconciledCount, nil
}

func (s *stockTransactionService) GetOnHoldFulfillments(ctx context.Context, building string) ([]domain.OnHoldFulfillmentSummary, error) {
	transactions, err := s.trxRepo.GetHeldTransactions(ctx, building)
	if err != nil {
		return nil, err
	}

	summaries := make([]domain.OnHoldFulfillmentSummary, 0, len(transactions))
	for _, trx := range transactions {
		summary := domain.OnHoldFulfillmentSummary{
			TransactionID:    trx.ID,
			TransactionNo:    trx.TransactionNo,
			ReferenceType:    trx.ReferenceType,
			ReferenceID:      trx.ReferenceID,
			AssignedBuilding: trx.AssignedBuilding,
			Status:           trx.Status,
			Notes:            trx.Notes,
			CreatedAt:        trx.CreatedAt.Format(time.RFC3339),
			Deficits:         []domain.ReplenishmentDeficit{},
		}

		if trx.Notes != nil && len(*trx.Notes) > 0 && (*trx.Notes)[0] == '[' {
			var deficits []domain.ReplenishmentDeficit
			if err := json.Unmarshal([]byte(*trx.Notes), &deficits); err == nil {
				summary.Deficits = deficits
			}
		}

		// Fallback for orders created before deficit serialization or plain text notes
		if len(summary.Deficits) == 0 && len(trx.Movements) > 0 {
			for _, m := range trx.Movements {
				displayLocs, _ := s.locRepo.FindFulfillmentSourceStock(ctx, int(m.ProductID))
				totalDisplayAvail := 0
				for _, loc := range displayLocs {
					totalDisplayAvail += loc.AvailableQuantity
				}

				storageLocs, _ := s.locRepo.FindReplenishmentCandidateStock(ctx, int(m.ProductID))
				var suggestedSources []domain.SuggestedReplenishmentSource
				for _, sloc := range storageLocs {
					source := domain.SuggestedReplenishmentSource{
						LocationID:        sloc.LocationID,
						AvailableQuantity: sloc.AvailableQuantity,
						Purpose:           "STORAGE",
						Building:          trx.AssignedBuilding,
					}
					if locDetail, err := s.locRepo.FindByID(ctx, sloc.LocationID); err == nil && locDetail != nil {
						source.LocationCode = locDetail.Code
						source.Building = locDetail.Building
						source.Purpose = locDetail.Purpose
					}
					suggestedSources = append(suggestedSources, source)
				}

				sku := ""
				productName := ""
				if s.productRepo != nil {
					if prod, err := s.productRepo.FindByID(ctx, int(m.ProductID)); err == nil && prod != nil {
						sku = prod.SKU
						productName = prod.Name
					}
				}

				deficitQty := m.TargetQuantity - totalDisplayAvail
				if deficitQty < 0 {
					deficitQty = 0
				}

				summary.Deficits = append(summary.Deficits, domain.ReplenishmentDeficit{
					ProductID:                m.ProductID,
					SKU:                      sku,
					ProductName:              productName,
					TargetQuantity:           m.TargetQuantity,
					DisplayAvailableQuantity: totalDisplayAvail,
					DeficitQuantity:          deficitQty,
					SuggestedSources:         suggestedSources,
				})
			}
		}

		summaries = append(summaries, summary)
	}

	return summaries, nil
}

func (s *stockTransactionService) ReleaseHeldFulfillment(ctx context.Context, transactionID uint) (*domain.StockTransaction, error) {
	var releasedTrx *domain.StockTransaction

	err := s.txManager.WithTransaction(ctx, func(ctx context.Context) error {
		trx, err := s.trxRepo.GetByID(ctx, transactionID)
		if err != nil {
			return err
		}
		if trx == nil {
			return errors.New("transaction not found")
		}

		if !trx.CanBeReleased() {
			return domain.ErrCannotReleaseNotHeld
		}

		var readyAllocations []itemAllocation
		for _, m := range trx.Movements {
			displayLocs, err := s.locRepo.FindFulfillmentSourceStock(ctx, int(m.ProductID))
			if err != nil {
				return err
			}

			totalDisplayAvail := 0
			for _, loc := range displayLocs {
				totalDisplayAvail += loc.AvailableQuantity
			}

			if totalDisplayAvail < m.TargetQuantity {
				return fmt.Errorf("insufficient display stock for product %d: needed %d, available %d", m.ProductID, m.TargetQuantity, totalDisplayAvail)
			}

			alloc := itemAllocation{productID: int(m.ProductID)}
			remainingNeeded := m.TargetQuantity
			for _, loc := range displayLocs {
				if remainingNeeded <= 0 {
					break
				}
				allocQty := loc.AvailableQuantity
				if allocQty > remainingNeeded {
					allocQty = remainingNeeded
				}
				alloc.allocs = append(alloc.allocs, struct {
					locID int
					qty   int
				}{locID: loc.LocationID, qty: allocQty})
				remainingNeeded -= allocQty
			}
			readyAllocations = append(readyAllocations, alloc)
		}

		// All movements have sufficient DISPLAY stock: execute reservations
		for _, alloc := range readyAllocations {
			for _, al := range alloc.allocs {
				if err := s.locRepo.ReserveStock(ctx, alloc.productID, al.locID, al.qty); err != nil {
					return err
				}
			}
		}

		trx.Status = domain.TransactionStatusReadyToPick
		notes := "Released from hold; stock successfully reserved in DISPLAY"
		trx.Notes = &notes

		if err := s.trxRepo.UpdateTransactionTx(ctx, trx); err != nil {
			return err
		}

		releasedTrx = trx
		return nil
	})

	if err != nil {
		return nil, err
	}

	return releasedTrx, nil
}
