package usecase

import (
	"context"
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"strings"
	"time"

	catalog_domain "github.com/dps-wmhris/backend/internal/modules/catalog/domain"
	catalog_port "github.com/dps-wmhris/backend/internal/modules/catalog/port"
	inventory_dto "github.com/dps-wmhris/backend/internal/modules/inventory/application/dto"
	"github.com/dps-wmhris/backend/internal/modules/inventory/domain"
	"github.com/dps-wmhris/backend/internal/modules/inventory/port"
	"github.com/dps-wmhris/backend/internal/shared/apperror"
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

// NewStockTransactionService creates a StockTransactionUseCase for Kelja fulfillment reservations, picking, reconciliation, and outbox dispatch.
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

type locationAllocation struct {
	locID int
	qty   int
}

type itemAllocation struct {
	productID int
	allocs    []locationAllocation
}

type productLocKey struct {
	productID  int
	locationID int
}

func generateTransactionNo() string {
	var randBytes [4]byte
	if _, err := rand.Read(randBytes[:]); err != nil {
		return fmt.Sprintf("TRX-%d", time.Now().UnixNano())
	}
	return fmt.Sprintf("TRX-%s-%s", time.Now().Format("20060102150405"), hex.EncodeToString(randBytes[:]))
}

// planGreedyAllocations computes greedy fulfillment reservations across displayLocs while deducting
// quantities already claimed earlier within the same batch to prevent intra-order over-reservation.
func planGreedyAllocations(
	productID int,
	targetQty int,
	displayLocs []domain.AvailableLocationStock,
	reservedInBatch map[productLocKey]int,
) (itemAllocation, int, bool) {
	totalAvail := 0
	effective := make([]domain.AvailableLocationStock, 0, len(displayLocs))
	for _, loc := range displayLocs {
		avail := loc.AvailableQuantity - reservedInBatch[productLocKey{productID: productID, locationID: loc.LocationID}]
		if avail <= 0 {
			continue
		}
		totalAvail += avail
		effective = append(effective, domain.AvailableLocationStock{
			LocationID:        loc.LocationID,
			AvailableQuantity: avail,
		})
	}

	if totalAvail < targetQty {
		return itemAllocation{}, totalAvail, false
	}

	alloc := itemAllocation{productID: productID}
	remaining := targetQty
	for _, loc := range effective {
		if remaining <= 0 {
			break
		}
		allocQty := loc.AvailableQuantity
		if allocQty > remaining {
			allocQty = remaining
		}
		alloc.allocs = append(alloc.allocs, locationAllocation{
			locID: loc.LocationID,
			qty:   allocQty,
		})
		reservedInBatch[productLocKey{productID: productID, locationID: loc.LocationID}] += allocQty
		remaining -= allocQty
	}

	return alloc, totalAvail, true
}

func (s *stockTransactionService) CreateTransaction(ctx context.Context, req inventory_dto.CreateTransactionRequest) (*domain.StockTransaction, error) {
	now := time.Now()
	trx := &domain.StockTransaction{
		TransactionNo:    generateTransactionNo(),
		ReferenceType:    strings.TrimSpace(req.ReferenceType),
		ReferenceID:      strings.TrimSpace(req.ReferenceID),
		AssignedBuilding: strings.TrimSpace(req.AssignedBuilding),
		Status:           domain.TransactionStatusPending,
		Notes:            req.Notes,
		CreatedAt:        now,
		UpdatedAt:        now,
	}

	for _, item := range req.Items {
		if err := trx.AddDemand(item.ProductID, item.TargetQuantity); err != nil {
			return nil, err
		}
	}

	err := s.txManager.WithTransaction(ctx, func(txCtx context.Context) error {
		var deficits []domain.ReplenishmentDeficit
		isOutOfStock := false
		var readyAllocations []itemAllocation
		reservedInBatch := make(map[productLocKey]int)
		locCache := make(map[int]*domain.Location)
		prodCache := make(map[int]*catalog_domain.Product)

		for _, item := range req.Items {
			// 1. Check fulfillment source availability across all active fulfillment locations
			displayLocs, err := s.locRepo.FindFulfillmentSourceStock(txCtx, int(item.ProductID))
			if err != nil {
				return err
			}

			alloc, totalDisplayAvail, sufficient := planGreedyAllocations(
				int(item.ProductID), item.TargetQuantity, displayLocs, reservedInBatch,
			)
			if !sufficient {
				deficitQty := item.TargetQuantity - totalDisplayAvail
				storageLocs, err := s.locRepo.FindReplenishmentCandidateStock(txCtx, int(item.ProductID))
				if err != nil {
					return err
				}

				totalStorageAvail := 0
				suggestedSources := make([]domain.SuggestedReplenishmentSource, 0, len(storageLocs))
				for _, sloc := range storageLocs {
					totalStorageAvail += sloc.AvailableQuantity
					source := domain.SuggestedReplenishmentSource{
						LocationID:        sloc.LocationID,
						AvailableQuantity: sloc.AvailableQuantity,
						Purpose:           "STORAGE",
						Building:          trx.AssignedBuilding,
					}
					locDetail := s.lookupLocationCached(txCtx, sloc.LocationID, locCache)
					if locDetail != nil {
						source.LocationCode = locDetail.Code
						source.Building = locDetail.Building
						source.Purpose = locDetail.Purpose
					}
					suggestedSources = append(suggestedSources, source)
				}

				if (totalDisplayAvail + totalStorageAvail) < item.TargetQuantity {
					isOutOfStock = true
				}

				sku, productName := s.lookupProductSummaryCached(txCtx, int(item.ProductID), prodCache)
				deficits = append(deficits, domain.ReplenishmentDeficit{
					ProductID:                item.ProductID,
					SKU:                      sku,
					ProductName:              productName,
					TargetQuantity:           item.TargetQuantity,
					DisplayAvailableQuantity: totalDisplayAvail,
					DeficitQuantity:          deficitQty,
					SuggestedSources:         suggestedSources,
				})
				continue
			}

			readyAllocations = append(readyAllocations, alloc)
		}

		// 2. Zero partial reservation: if any item has a deficit, hold the entire order
		if isOutOfStock {
			if err := trx.MarkOnHoldForReplenishment(deficits); err != nil {
				return err
			}
			trx.Status = domain.TransactionStatusOutOfStock
			return s.trxRepo.CreateTx(txCtx, trx)
		}

		if len(deficits) > 0 {
			if err := trx.MarkOnHoldForReplenishment(deficits); err != nil {
				return err
			}
			return s.trxRepo.CreateTx(txCtx, trx)
		}

		// 3. Fully available in fulfillment locations: execute reservations atomically
		trx.Status = domain.TransactionStatusReadyToPick
		for _, alloc := range readyAllocations {
			for _, al := range alloc.allocs {
				if err := s.locRepo.ReserveStock(txCtx, alloc.productID, al.locID, al.qty); err != nil {
					return err
				}
			}
		}

		return s.trxRepo.CreateTx(txCtx, trx)
	})

	if err != nil {
		return nil, err
	}

	return trx, nil
}

func (s *stockTransactionService) ExecuteTransaction(ctx context.Context, req inventory_dto.ExecuteTransactionRequest, userID uint) error {
	return s.txManager.WithTransaction(ctx, func(txCtx context.Context) error {
		// 1. Load aggregate root
		trx, err := s.trxRepo.GetByID(txCtx, req.TransactionID)
		if err != nil {
			if errors.Is(err, sql.ErrNoRows) {
				return apperror.NotFound("wms.transaction.err_not_found", "Transaksi tidak ditemukan")
			}
			return err
		}
		if trx == nil {
			return apperror.NotFound("wms.transaction.err_not_found", "Transaksi tidak ditemukan")
		}

		// 2. Load scanned fulfillment location
		loc, err := s.locRepo.FindByID(txCtx, int(req.LocationID))
		if err != nil {
			if errors.Is(err, sql.ErrNoRows) {
				return domain.ErrLocationNotFound
			}
			return err
		}
		if loc == nil {
			return domain.ErrLocationNotFound
		}

		// 3. Validate domain guards (pickable status, fulfillment source, movement exists & incomplete)
		if err := trx.ProcessLine(req.MovementID, loc, req.QtyDone, userID); err != nil {
			return err
		}

		var productID uint
		for _, m := range trx.Movements {
			if m.ID == req.MovementID {
				productID = m.ProductID
				break
			}
		}

		// 4. Lock stock_locations row FOR UPDATE and verify physical stock >= QtyDone
		physicalQty, err := s.locRepo.GetStockAtLocation(txCtx, int(productID), int(req.LocationID), true)
		if err != nil {
			return err
		}
		if physicalQty < req.QtyDone {
			return apperror.Validation(
				"wms.stock.err_insufficient_stock",
				fmt.Sprintf("Stok fisik tidak mencukupi di lokasi %s (tersedia: %d, dibutuhkan: %d)", loc.Code, physicalQty, req.QtyDone),
				map[string]any{"available": physicalQty, "requested": req.QtyDone},
			)
		}

		// 5. Atomically release reserved quantity and deduct physical stock
		if err := s.locRepo.ReleaseStock(txCtx, int(productID), int(req.LocationID), req.QtyDone); err != nil {
			return err
		}
		if err := s.locRepo.DeductStock(txCtx, int(productID), int(req.LocationID), req.QtyDone); err != nil {
			return err
		}

		// 6. Persist scanned movement line and updated movement/transaction statuses
		if err := s.trxRepo.SaveFulfillmentTx(txCtx, trx); err != nil {
			return err
		}

		// 7. When fully fulfilled, write InventoryFulfilled outbox event inside the same transaction
		if trx.Status == domain.TransactionStatusCompleted && s.outboxRepo != nil {
			payload := map[string]any{
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
				Status:        domain.OutboxStatusPending,
				CreatedAt:     time.Now(),
			}
			if err := s.outboxRepo.SaveTx(txCtx, outboxEvent); err != nil {
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
	var lastErr error
	for _, outboxEvt := range events {
		if !json.Valid([]byte(outboxEvt.Payload)) {
			if retryErr := s.outboxRepo.IncrementRetry(ctx, outboxEvt.ID); retryErr != nil {
				log.Printf("[Outbox] Failed to increment retry for malformed event %d: %v", outboxEvt.ID, retryErr)
			}
			continue
		}

		if err := s.eventBus.Publish(ctx, eventbus.NewEvent(
			outboxEvt.EventType,
			json.RawMessage(outboxEvt.Payload),
			0,
		)); err != nil {
			log.Printf("[Outbox] Failed to publish event %d (%s): %v", outboxEvt.ID, outboxEvt.EventType, err)
			if retryErr := s.outboxRepo.IncrementRetry(ctx, outboxEvt.ID); retryErr != nil {
				log.Printf("[Outbox] Failed to increment retry for event %d: %v", outboxEvt.ID, retryErr)
			}
			lastErr = err
			continue
		}

		if err := s.outboxRepo.MarkAsPublished(ctx, outboxEvt.ID); err != nil {
			log.Printf("[Outbox] Failed to mark event %d as published: %v", outboxEvt.ID, err)
			lastErr = err
			continue
		}
		dispatched++
	}

	return dispatched, lastErr
}

func (s *stockTransactionService) ReconcileMissingFulfillments(ctx context.Context) (int, error) {
	if s.keljaClient == nil || s.productRepo == nil {
		return 0, nil
	}

	list, err := s.keljaClient.FetchRecentFulfillments(ctx, 1, 50)
	if err != nil {
		return 0, err
	}
	if len(list) == 0 {
		return 0, nil
	}

	reconciledCount := 0
	for _, order := range list {
		status := strings.ToUpper(strings.TrimSpace(order.Status))
		if status == "CANCELLED" || status == "FINISHED" || status == "VOID" {
			continue
		}

		existing, err := s.trxRepo.GetByReference(ctx, "KELJA_FULFILLMENT", order.Code)
		if err != nil {
			log.Printf("[Reconciliation] Error checking reference %s: %v", order.Code, err)
			continue
		}
		if existing != nil {
			continue
		}

		detail, err := s.keljaClient.FetchFulfillmentDetail(ctx, order.ID)
		if err != nil {
			log.Printf("[Reconciliation] Failed to fetch detail for Kelja ID %d: %v", order.ID, err)
			continue
		}
		if detail == nil || len(detail.Items) == 0 {
			continue
		}

		items := make([]inventory_dto.TransactionItemRequest, 0, len(detail.Items))
		hasInvalidItem := false
		for _, itm := range detail.Items {
			if itm.Quantity <= 0 || strings.TrimSpace(itm.ProductCode) == "" {
				log.Printf("[Reconciliation] Skipping order %s: invalid line item (sku=%q qty=%d)", order.Code, itm.ProductCode, itm.Quantity)
				hasInvalidItem = true
				break
			}
			prodID, err := s.productRepo.GetProductIDBySKUTx(ctx, strings.TrimSpace(itm.ProductCode))
			if err != nil || prodID <= 0 {
				log.Printf("[Reconciliation] Skipping order %s: product SKU %q not found in WMS catalog (err=%v)", order.Code, itm.ProductCode, err)
				hasInvalidItem = true
				break
			}
			items = append(items, inventory_dto.TransactionItemRequest{
				ProductID:      uint(prodID),
				TargetQuantity: itm.Quantity,
			})
		}

		if hasInvalidItem || len(items) == 0 {
			continue
		}

		createReq := inventory_dto.CreateTransactionRequest{
			ReferenceType:    "KELJA_FULFILLMENT",
			ReferenceID:      order.Code,
			AssignedBuilding: "",
			Items:            items,
		}

		if _, err := s.CreateTransaction(ctx, createReq); err != nil {
			log.Printf("[Reconciliation] Failed to auto-create transaction for %s: %v", order.Code, err)
			continue
		}

		log.Printf("[Reconciliation] Successfully recovered missing order %s (Kelja ID %d)", order.Code, order.ID)
		reconciledCount++
	}

	return reconciledCount, nil
}

func (s *stockTransactionService) GetOnHoldFulfillments(ctx context.Context, building string) ([]domain.OnHoldFulfillmentSummary, error) {
	transactions, err := s.trxRepo.GetHeldTransactions(ctx, strings.TrimSpace(building))
	if err != nil {
		return nil, err
	}

	summaries := make([]domain.OnHoldFulfillmentSummary, 0, len(transactions))
	locCache := make(map[int]*domain.Location)
	prodCache := make(map[int]*catalog_domain.Product)

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

		// Fallback for legacy held orders without serialized deficit notes
		if len(summary.Deficits) == 0 && len(trx.Movements) > 0 && s.locRepo != nil {
			for _, m := range trx.Movements {
				displayLocs, err := s.locRepo.FindFulfillmentSourceStock(ctx, int(m.ProductID))
				if err != nil {
					return nil, err
				}
				totalDisplayAvail := 0
				for _, loc := range displayLocs {
					totalDisplayAvail += loc.AvailableQuantity
				}

				storageLocs, err := s.locRepo.FindReplenishmentCandidateStock(ctx, int(m.ProductID))
				if err != nil {
					return nil, err
				}
				suggestedSources := make([]domain.SuggestedReplenishmentSource, 0, len(storageLocs))
				for _, sloc := range storageLocs {
					source := domain.SuggestedReplenishmentSource{
						LocationID:        sloc.LocationID,
						AvailableQuantity: sloc.AvailableQuantity,
						Purpose:           "STORAGE",
						Building:          trx.AssignedBuilding,
					}
					if locDetail := s.lookupLocationCached(ctx, sloc.LocationID, locCache); locDetail != nil {
						source.LocationCode = locDetail.Code
						source.Building = locDetail.Building
						source.Purpose = locDetail.Purpose
					}
					suggestedSources = append(suggestedSources, source)
				}

				sku, productName := s.lookupProductSummaryCached(ctx, int(m.ProductID), prodCache)
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

	err := s.txManager.WithTransaction(ctx, func(txCtx context.Context) error {
		trx, err := s.trxRepo.GetByID(txCtx, transactionID)
		if err != nil {
			if errors.Is(err, sql.ErrNoRows) {
				return apperror.NotFound("wms.transaction.err_not_found", "Transaksi tidak ditemukan")
			}
			return err
		}
		if trx == nil {
			return apperror.NotFound("wms.transaction.err_not_found", "Transaksi tidak ditemukan")
		}

		if !trx.CanBeReleased() {
			return domain.ErrCannotReleaseNotHeld
		}

		var readyAllocations []itemAllocation
		reservedInBatch := make(map[productLocKey]int)
		for _, m := range trx.Movements {
			displayLocs, err := s.locRepo.FindFulfillmentSourceStock(txCtx, int(m.ProductID))
			if err != nil {
				return err
			}

			alloc, totalDisplayAvail, sufficient := planGreedyAllocations(
				int(m.ProductID), m.TargetQuantity, displayLocs, reservedInBatch,
			)
			if !sufficient {
				return apperror.Validation(
					"wms.transaction.err_insufficient_display",
					fmt.Sprintf("insufficient display stock for product %d: needed %d, available %d", m.ProductID, m.TargetQuantity, totalDisplayAvail),
					map[string]any{"product": m.ProductID, "needed": m.TargetQuantity, "available": totalDisplayAvail},
				)
			}

			readyAllocations = append(readyAllocations, alloc)
		}

		// All movements have sufficient fulfillment stock: execute reservations atomically
		for _, alloc := range readyAllocations {
			for _, al := range alloc.allocs {
				if err := s.locRepo.ReserveStock(txCtx, alloc.productID, al.locID, al.qty); err != nil {
					return err
				}
			}
		}

		trx.Status = domain.TransactionStatusReadyToPick
		notes := "Released from hold; stock successfully reserved in DISPLAY"
		trx.Notes = &notes

		if err := s.trxRepo.UpdateTransactionTx(txCtx, trx); err != nil {
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

func (s *stockTransactionService) lookupLocationCached(ctx context.Context, locationID int, cache map[int]*domain.Location) *domain.Location {
	if loc, ok := cache[locationID]; ok {
		return loc
	}
	loc, err := s.locRepo.FindByID(ctx, locationID)
	if err != nil {
		cache[locationID] = nil
		return nil
	}
	cache[locationID] = loc
	return loc
}

func (s *stockTransactionService) lookupProductSummaryCached(ctx context.Context, productID int, cache map[int]*catalog_domain.Product) (string, string) {
	if s.productRepo == nil {
		return "", ""
	}
	prod, ok := cache[productID]
	if !ok {
		var err error
		prod, err = s.productRepo.FindByID(ctx, productID)
		if err != nil {
			cache[productID] = nil
			return "", ""
		}
		cache[productID] = prod
	}
	if prod == nil {
		return "", ""
	}
	return prod.SKU, prod.Name
}
