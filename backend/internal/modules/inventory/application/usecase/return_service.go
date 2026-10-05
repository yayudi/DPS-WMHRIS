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
	return errors.New("Fitur ApproveReturn sudah dinonaktifkan (Fulfilment Teardown)")
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
