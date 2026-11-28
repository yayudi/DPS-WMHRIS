package usecase

import (
	"context"

	inventory_dto "github.com/dps-wmhris/backend/internal/modules/inventory/application/dto"
	"github.com/dps-wmhris/backend/internal/modules/inventory/port"
)

type stockQueryService struct {
	repo port.StockQueryRepository
}

// NewStockQueryService creates a read-only StockQueryUseCase backed by StockQueryRepository.
func NewStockQueryService(repo port.StockQueryRepository) port.StockQueryUseCase {
	return &stockQueryService{
		repo: repo,
	}
}

// GetStockBalances returns physical, reserved, and net available stock balances filtered by optional location and product IDs.
func (s *stockQueryService) GetStockBalances(ctx context.Context, locationID *int, productID *int) ([]inventory_dto.StockBalanceResponse, error) {
	return s.repo.GetBalances(ctx, locationID, productID)
}
