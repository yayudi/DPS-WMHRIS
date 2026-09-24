package usecase

import (
	"context"
	"errors"
	"fmt"

	inventory_dto "github.com/dps-wmhris/backend/internal/modules/inventory/application/dto"

	"github.com/dps-wmhris/backend/internal/modules/inventory/domain"
	inventory_port "github.com/dps-wmhris/backend/internal/modules/inventory/port"
	"github.com/dps-wmhris/backend/internal/shared/database"
	"github.com/dps-wmhris/backend/internal/shared/utils"
)

type returnServiceImpl struct {
	txManager    database.TransactionManager
	returnRepo   inventory_port.ReturnRepository
	locationRepo inventory_port.LocationRepository
	stockRepo    inventory_port.StockRepository
}

func NewReturnUseCase(txManager database.TransactionManager, returnRepo inventory_port.ReturnRepository, locationRepo inventory_port.LocationRepository, stockRepo inventory_port.StockRepository) inventory_port.ReturnUseCase {
	return &returnServiceImpl{
		txManager:    txManager,
		returnRepo:   returnRepo,
		locationRepo: locationRepo,
		stockRepo:    stockRepo,
	}
}

func (s *returnServiceImpl) GetPendingReturns(ctx context.Context, params map[string]interface{}) ([]map[string]interface{}, int, error) {
	return s.returnRepo.GetPendingReturns(ctx, params)
}

func (s *returnServiceImpl) GetMarketplaceReturnHistory(ctx context.Context, page, limit int, search string) (utils.PaginatedResult[domain.MarketplaceReturnItem], error) {
	return s.returnRepo.GetMarketplaceReturnHistory(ctx, page, limit, search)
}

func (s *returnServiceImpl) GetManualReturnHistory(ctx context.Context, page, limit int, search string) (utils.PaginatedResult[domain.ManualReturnItem], error) {
	return s.returnRepo.GetManualReturnHistory(ctx, page, limit, search)
}

func (s *returnServiceImpl) ApproveReturn(ctx context.Context, userID int, req inventory_dto.ApproveReturnRequest) error {
	return s.txManager.WithTransaction(ctx, func(ctx context.Context) error {
		item, err := s.returnRepo.GetFulfilmentItemById(ctx, req.ItemID)
		if err != nil {
			return errors.New("item fulfilment tidak ditemukan")
		}

		if item.Status != "RETURNED" {
			return fmt.Errorf("item status bukan RETURNED (Status saat ini: %s). Tidak bisa divalidasi", item.Status)
		}

		if req.QtyAccepted <= 0 || req.QtyAccepted > item.Quantity {
			return fmt.Errorf("jumlah diterima (%d) tidak valid. Maksimal: %d", req.QtyAccepted, item.Quantity)
		}

		if req.QtyAccepted == item.Quantity {
			err = s.returnRepo.CompleteReturnItem(ctx, req.ItemID, req.Condition, req.Notes, req.LocationID)
			if err != nil {
				return err
			}
		} else {
			err = s.returnRepo.DecreaseItemQty(ctx, req.ItemID, req.QtyAccepted)
			if err != nil {
				return err
			}

			_, err = s.returnRepo.CreateSplitReturnItem(ctx, item, req.QtyAccepted, req.Condition, req.Notes, req.LocationID)
			if err != nil {
				return err
			}
		}

		err = s.locationRepo.IncrementStock(ctx, item.ProductID, req.LocationID, req.QtyAccepted)
		if err != nil {
			return err
		}

		notes := fmt.Sprintf("Validasi Retur #%d (%s): %s", req.ItemID, req.Condition, req.Notes)
		movement := &domain.StockMovement{
			ProductID:    item.ProductID,
			Quantity:     req.QtyAccepted,
			ToLocationID: &req.LocationID,
			MovementType: "RETURN_INBOUND",
			UserID:       userID,
			Notes:        notes,
		}

		return s.stockRepo.RecordMovement(ctx, movement)
	})
}

func (s *returnServiceImpl) CreateManualReturn(ctx context.Context, userID int, req inventory_dto.CreateManualReturnRequest) error {
	return s.txManager.WithTransaction(ctx, func(ctx context.Context) error {
		notes := req.Notes
		ref := req.Reference

		manualReturn := &domain.ManualReturn{
			UserID:    userID,
			ProductID: req.ProductID,
			Quantity:  req.Quantity,
			Condition: req.Condition,
			Reference: &ref,
			Notes:     &notes,
		}

		err := s.returnRepo.CreateManualReturn(ctx, manualReturn)
		if err != nil {
			return err
		}

		err = s.locationRepo.IncrementStock(ctx, req.ProductID, req.LocationID, req.Quantity)
		if err != nil {
			return err
		}

		logNotes := fmt.Sprintf("Manual Retur Ref: %s (%s)", req.Reference, req.Condition)
		movement := &domain.StockMovement{
			ProductID:    req.ProductID,
			Quantity:     req.Quantity,
			ToLocationID: &req.LocationID,
			MovementType: "MANUAL_RETURN",
			UserID:       userID,
			Notes:        logNotes,
		}

		return s.stockRepo.RecordMovement(ctx, movement)
	})
}
