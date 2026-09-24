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

func NewStockQueryRepository(db *sqlx.DB) port.StockQueryRepository {
	return &stockQueryRepository{db: db}
}

func (r *stockQueryRepository) GetBalances(ctx context.Context, locationID *int, productID *int) ([]inventory_dto.StockBalanceResponse, error) {
	var balances []inventory_dto.StockBalanceResponse

	query := `
		SELECT 
			sl.location_id,
			l.name as location_name,
			sl.product_id,
			p.name as product_name,
			sl.quantity,
			sl.reserved_quantity,
			(sl.quantity - sl.reserved_quantity) as available_quantity
		FROM stock_locations sl
		JOIN locations l ON sl.location_id = l.id
		JOIN products p ON sl.product_id = p.id
		WHERE 1=1
	`
	var args []interface{}
	
	if locationID != nil {
		query += " AND sl.location_id = ?"
		args = append(args, *locationID)
	}
	
	if productID != nil {
		query += " AND sl.product_id = ?"
		args = append(args, *productID)
	}

	query += " ORDER BY l.name ASC, p.name ASC"

	ext := database.GetExt(ctx, r.db)
	err := ext.SelectContext(ctx, &balances, query, args...)
	if err != nil {
		return nil, fmt.Errorf("failed to get stock balances: %w", err)
	}

	return balances, nil
}
