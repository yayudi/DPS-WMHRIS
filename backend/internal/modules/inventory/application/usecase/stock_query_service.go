package usecase

import (
	"context"

	inventory_dto "github.com/dps-wmhris/backend/internal/modules/inventory/application/dto"
	"github.com/dps-wmhris/backend/internal/modules/inventory/port"
)

type stockQueryService struct {
	repo port.StockQueryRepository
}

func NewStockQueryService(repo port.StockQueryRepository) port.StockQueryUseCase {
	return &stockQueryService{
		repo: repo,
	}
}

func (s *stockQueryService) GetStockBalances(ctx context.Context, locationID *int, productID *int) ([]inventory_dto.StockBalanceResponse, error) {
	return s.repo.GetBalances(ctx, locationID, productID)
}
