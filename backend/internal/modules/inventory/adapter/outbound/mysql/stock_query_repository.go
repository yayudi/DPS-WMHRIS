package mysql

import (
	"context"
	"fmt"

	inventory_dto "github.com/dps-wmhris/backend/internal/modules/inventory/application/dto"
	"github.com/dps-wmhris/backend/internal/modules/inventory/port"
	"github.com/dps-wmhris/backend/internal/shared/database"
	"github.com/jmoiron/sqlx"
)

type stockQueryRepository struct {
	db *sqlx.DB
}

// NewStockQueryRepository creates a MySQL-backed StockQueryRepository.
func NewStockQueryRepository(db *sqlx.DB) port.StockQueryRepository {
	return &stockQueryRepository{db: db}
}

// GetBalances returns physical, reserved, and net available stock balances for non-deleted products and locations.
func (r *stockQueryRepository) GetBalances(ctx context.Context, locationID *int, productID *int) ([]inventory_dto.StockBalanceResponse, error) {
	balances := make([]inventory_dto.StockBalanceResponse, 0)

	query := `
		SELECT
			sl.location_id,
			COALESCE(l.name, '') AS location_name,
			sl.product_id,
			p.name AS product_name,
			sl.quantity,
			sl.reserved_quantity,
			(sl.quantity - sl.reserved_quantity) AS available_quantity
		FROM stock_locations sl
		JOIN locations l ON sl.location_id = l.id
		JOIN products p ON sl.product_id = p.id
		WHERE l.deleted_at IS NULL AND p.deleted_at IS NULL
	`
	var args []any

	if locationID != nil {
		query += " AND sl.location_id = ?"
		args = append(args, *locationID)
	}

	if productID != nil {
		query += " AND sl.product_id = ?"
		args = append(args, *productID)
	}

	query += " ORDER BY location_name ASC, p.name ASC"

	ext := database.GetExt(ctx, r.db)
	if err := ext.SelectContext(ctx, &balances, query, args...); err != nil {
		return nil, fmt.Errorf("failed to get stock balances: %w", err)
	}
	if balances == nil {
		return []inventory_dto.StockBalanceResponse{}, nil
	}

	return balances, nil
}
