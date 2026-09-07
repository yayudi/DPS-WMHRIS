package service

import (
	"context"
	"errors"
	"fmt"

	"github.com/dps-wmhris/backend/internal/database"
	"github.com/dps-wmhris/backend/internal/dto"
	"github.com/dps-wmhris/backend/internal/model"
	"github.com/dps-wmhris/backend/internal/repository"
	"github.com/dps-wmhris/backend/internal/utils"
	"github.com/jmoiron/sqlx"
)

type ReturnService interface {
	GetPendingReturns(ctx context.Context, params map[string]interface{}) ([]map[string]interface{}, int, error)
	GetMarketplaceReturnHistory(ctx context.Context, page, limit int, search string) (utils.PaginatedResult[model.MarketplaceReturnItem], error)
	GetManualReturnHistory(ctx context.Context, page, limit int, search string) (utils.PaginatedResult[model.ManualReturnItem], error)
	ApproveReturn(ctx context.Context, userID int, req dto.ApproveReturnRequest) error
	CreateManualReturn(ctx context.Context, userID int, req dto.CreateManualReturnRequest) error
}

type returnServiceImpl struct {
	db           *sqlx.DB
	returnRepo   repository.ReturnRepository
	locationRepo repository.LocationRepository
	stockRepo    repository.StockRepository
}

func NewReturnService(db *sqlx.DB, returnRepo repository.ReturnRepository, locationRepo repository.LocationRepository, stockRepo repository.StockRepository) ReturnService {
	return &returnServiceImpl{
		db:           db,
		returnRepo:   returnRepo,
		locationRepo: locationRepo,
		stockRepo:    stockRepo,
	}
}

func (s *returnServiceImpl) GetPendingReturns(ctx context.Context, params map[string]interface{}) ([]map[string]interface{}, int, error) {
	return s.returnRepo.GetPendingReturns(ctx, params)
}

func (s *returnServiceImpl) GetMarketplaceReturnHistory(ctx context.Context, page, limit int, search string) (utils.PaginatedResult[model.MarketplaceReturnItem], error) {
	return s.returnRepo.GetMarketplaceReturnHistory(ctx, page, limit, search)
}

func (s *returnServiceImpl) GetManualReturnHistory(ctx context.Context, page, limit int, search string) (utils.PaginatedResult[model.ManualReturnItem], error) {
	return s.returnRepo.GetManualReturnHistory(ctx, page, limit, search)
}

func (s *returnServiceImpl) ApproveReturn(ctx context.Context, userID int, req dto.ApproveReturnRequest) error {
	return database.WithTransaction(s.db, ctx, func(tx *sqlx.Tx) error {
		item, err := s.returnRepo.GetPickingItemById(ctx, tx, req.ItemID)
		if err != nil {
			return errors.New("item picking tidak ditemukan")
		}

		if item.Status != "RETURNED" {
			return fmt.Errorf("item status bukan RETURNED (Status saat ini: %s). Tidak bisa divalidasi", item.Status)
		}

		if req.QtyAccepted <= 0 || req.QtyAccepted > item.Quantity {
			return fmt.Errorf("jumlah diterima (%d) tidak valid. Maksimal: %d", req.QtyAccepted, item.Quantity)
		}

		if req.QtyAccepted == item.Quantity {
			err = s.returnRepo.CompleteReturnItem(ctx, tx, req.ItemID, req.Condition, req.Notes, req.LocationID)
			if err != nil {
				return err
			}
		} else {
			err = s.returnRepo.DecreaseItemQty(ctx, tx, req.ItemID, req.QtyAccepted)
			if err != nil {
				return err
			}

			_, err = s.returnRepo.CreateSplitReturnItem(ctx, tx, item, req.QtyAccepted, req.Condition, req.Notes, req.LocationID)
			if err != nil {
				return err
			}
		}

		err = s.locationRepo.IncrementStock(ctx, tx, item.ProductID, req.LocationID, req.QtyAccepted)
		if err != nil {
			return err
		}

		notes := fmt.Sprintf("Validasi Retur #%d (%s): %s", req.ItemID, req.Condition, req.Notes)
		movement := &model.StockMovement{
			ProductID:    item.ProductID,
			Quantity:     req.QtyAccepted,
			ToLocationID: &req.LocationID,
			MovementType: "RETURN_INBOUND",
			UserID:       userID,
			Notes:        notes,
		}

		return s.stockRepo.RecordMovement(ctx, tx, movement)
	})
}

func (s *returnServiceImpl) CreateManualReturn(ctx context.Context, userID int, req dto.CreateManualReturnRequest) error {
	return database.WithTransaction(s.db, ctx, func(tx *sqlx.Tx) error {
		notes := req.Notes
		ref := req.Reference
		
		manualReturn := &model.ManualReturn{
			UserID:    userID,
			ProductID: req.ProductID,
			Quantity:  req.Quantity,
			Condition: req.Condition,
			Reference: &ref,
			Notes:     &notes,
		}

		err := s.returnRepo.CreateManualReturn(ctx, tx, manualReturn)
		if err != nil {
			return err
		}

		err = s.locationRepo.IncrementStock(ctx, tx, req.ProductID, req.LocationID, req.Quantity)
		if err != nil {
			return err
		}

		logNotes := fmt.Sprintf("Manual Retur Ref: %s (%s)", req.Reference, req.Condition)
		movement := &model.StockMovement{
			ProductID:    req.ProductID,
			Quantity:     req.Quantity,
			ToLocationID: &req.LocationID,
			MovementType: "MANUAL_RETURN",
			UserID:       userID,
			Notes:        logNotes,
		}

		return s.stockRepo.RecordMovement(ctx, tx, movement)
	})
}
