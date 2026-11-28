package usecase

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"strings"

	inventory_dto "github.com/dps-wmhris/backend/internal/modules/inventory/application/dto"
	"github.com/dps-wmhris/backend/internal/modules/inventory/domain"
	inventory_port "github.com/dps-wmhris/backend/internal/modules/inventory/port"
	"github.com/dps-wmhris/backend/internal/shared/apperror"
	"github.com/dps-wmhris/backend/internal/shared/database"
	"github.com/dps-wmhris/backend/internal/shared/utils"
)

type returnServiceImpl struct {
	txManager    database.TransactionManager
	returnRepo   inventory_port.ReturnRepository
	locationRepo inventory_port.LocationRepository
	stockRepo    inventory_port.StockRepository
}

// NewReturnUseCase creates a ReturnUseCase wired with transactions and inventory repositories.
func NewReturnUseCase(
	txManager database.TransactionManager,
	returnRepo inventory_port.ReturnRepository,
	locationRepo inventory_port.LocationRepository,
	stockRepo inventory_port.StockRepository,
) inventory_port.ReturnUseCase {
	return &returnServiceImpl{
		txManager:    txManager,
		returnRepo:   returnRepo,
		locationRepo: locationRepo,
		stockRepo:    stockRepo,
	}
}

func (s *returnServiceImpl) GetPendingReturns(ctx context.Context, params map[string]any) ([]map[string]any, int, error) {
	return s.returnRepo.GetPendingReturns(ctx, params)
}

func (s *returnServiceImpl) GetMarketplaceReturnHistory(ctx context.Context, page, limit int, search string) (utils.PaginatedResult[domain.MarketplaceReturnItem], error) {
	return s.returnRepo.GetMarketplaceReturnHistory(ctx, page, limit, search)
}

func (s *returnServiceImpl) GetManualReturnHistory(ctx context.Context, page, limit int, search string) (utils.PaginatedResult[domain.ManualReturnItem], error) {
	return s.returnRepo.GetManualReturnHistory(ctx, page, limit, search)
}

func (s *returnServiceImpl) ApproveReturn(_ context.Context, _ int, _ inventory_dto.ApproveReturnRequest) error {
	return apperror.Validation("wms.return.err_feature_disabled", "Fitur ApproveReturn sudah dinonaktifkan (Fulfilment Teardown)")
}

func (s *returnServiceImpl) CreateManualReturn(ctx context.Context, userID int, req inventory_dto.CreateManualReturnRequest) error {
	if req.ProductID <= 0 || req.Quantity <= 0 || req.LocationID <= 0 {
		return apperror.Validation("wms.return.err_invalid_payload", "Produk, lokasi tujuan, dan jumlah retur harus bernilai positif")
	}
	condition := strings.ToUpper(strings.TrimSpace(req.Condition))
	if err := domain.ValidateReturnCondition(condition); err != nil {
		return err
	}

	return s.txManager.WithTransaction(ctx, func(txCtx context.Context) error {
		loc, err := s.locationRepo.FindByID(txCtx, req.LocationID)
		if err != nil {
			if errors.Is(err, sql.ErrNoRows) {
				return domain.ErrLocationNotFound
			}
			return err
		}
		if loc == nil {
			return domain.ErrLocationNotFound
		}

		ref := strings.TrimSpace(req.Reference)
		notes := strings.TrimSpace(req.Notes)
		var refPtr, notesPtr *string
		if ref != "" {
			refPtr = &ref
		}
		if notes != "" {
			notesPtr = &notes
		}

		manualReturn := &domain.ManualReturn{
			UserID:    userID,
			ProductID: req.ProductID,
			Quantity:  req.Quantity,
			Condition: condition,
			Reference: refPtr,
			Notes:     notesPtr,
		}

		if err := s.returnRepo.CreateManualReturn(txCtx, manualReturn); err != nil {
			return err
		}

		if err := s.locationRepo.IncrementStock(txCtx, req.ProductID, req.LocationID, req.Quantity); err != nil {
			return err
		}

		locID := req.LocationID
		logNotes := fmt.Sprintf("Manual Retur Ref: %s (%s)", ref, condition)
		movement := &domain.StockMovement{
			ProductID:    req.ProductID,
			Quantity:     req.Quantity,
			ToLocationID: &locID,
			MovementType: "MANUAL_RETURN",
			UserID:       userID,
			Notes:        logNotes,
		}

		return s.stockRepo.RecordMovement(txCtx, movement)
	})
}
