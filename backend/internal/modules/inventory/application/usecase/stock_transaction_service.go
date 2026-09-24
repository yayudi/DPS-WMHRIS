package usecase

import (
	"context"
	"errors"
	"fmt"
	"time"

	inventory_dto "github.com/dps-wmhris/backend/internal/modules/inventory/application/dto"
	"github.com/dps-wmhris/backend/internal/modules/inventory/domain"
	"github.com/dps-wmhris/backend/internal/modules/inventory/port"
	"github.com/dps-wmhris/backend/internal/shared/database"
	"github.com/dps-wmhris/backend/internal/shared/eventbus"
)

type stockTransactionService struct {
	txManager database.TransactionManager
	trxRepo   port.StockTransactionRepository
	locRepo   port.LocationRepository
	eventBus  eventbus.EventBus
}

func NewStockTransactionService(
	txManager database.TransactionManager,
	trxRepo port.StockTransactionRepository,
	locRepo port.LocationRepository,
	eventBus eventbus.EventBus,
) port.StockTransactionUseCase {
	return &stockTransactionService{
		txManager: txManager,
		trxRepo:   trxRepo,
		locRepo:   locRepo,
		eventBus:  eventBus,
	}
}

func (s *stockTransactionService) CreateFulfillment(ctx context.Context, req inventory_dto.CreateFulfillmentRequest) (*domain.StockTransaction, error) {
	trx := &domain.StockTransaction{
		TransactionNo:    fmt.Sprintf("TRX-%d", time.Now().UnixNano()),
		ReferenceType:    req.ReferenceType,
		ReferenceID:      req.ReferenceID,
		AssignedBuilding: req.AssignedBuilding,
		Status:           "PENDING",
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
		for _, item := range req.Items {
			// Find best stock (Global check for now, can be optimized later)
			locID, err := s.locRepo.FindBestStock(ctx, int(item.ProductID), item.TargetQuantity, "WAREHOUSE")
			if err != nil {
				return err
			}
			if locID == nil {
				return errors.New("insufficient global available stock for product ID: " + fmt.Sprint(item.ProductID))
			}
			// Reserve the stock
			if err := s.locRepo.ReserveStock(ctx, int(item.ProductID), *locID, item.TargetQuantity); err != nil {
				return err
			}
		}

		// Save the transaction header and movements
		if err := s.trxRepo.CreateTx(ctx, trx); err != nil {
			return err
		}

		return nil
	})

	if err != nil {
		return nil, err
	}

	return trx, nil
}

func (s *stockTransactionService) ExecuteFulfilment(ctx context.Context, req inventory_dto.ExecuteFulfilmentRequest, userID uint) error {
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

		// 2. Lakukan validasi FulfillLine (termasuk Guard Clauses)
		if err := trx.FulfillLine(req.MovementID, loc, req.QtyDone, userID); err != nil {
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
		
		// 5. Check if fully fulfilled and publish event
		if trx.Status == "COMPLETED" && s.eventBus != nil {
			payload := map[string]interface{}{
				"transaction_no": trx.TransactionNo,
				"reference_id":   trx.ReferenceID,
				"reference_type": trx.ReferenceType,
				"completed_at":   time.Now(),
			}
			s.eventBus.Publish(ctx, eventbus.Event{
				Type:    "InventoryFulfilled",
				Payload: payload,
			})
		}

		return nil
	})
}
