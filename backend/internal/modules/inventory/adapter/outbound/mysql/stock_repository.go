package mysql

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"

	inventory_dto "github.com/dps-wmhris/backend/internal/modules/inventory/application/dto"
	"github.com/dps-wmhris/backend/internal/modules/inventory/domain"
	inventory_port "github.com/dps-wmhris/backend/internal/modules/inventory/port"
	"github.com/dps-wmhris/backend/internal/shared/database"
	"github.com/dps-wmhris/backend/internal/shared/utils"
	"github.com/jmoiron/sqlx"
)

type stockRepositoryImpl struct {
	db *sqlx.DB
}

// NewStockRepository creates a MySQL-backed StockRepository.
func NewStockRepository(db *sqlx.DB) inventory_port.StockRepository {
	return &stockRepositoryImpl{db: db}
}

// GetStockByLocation retrieves and locks (FOR UPDATE) the stock_locations row for a product and location.
// Returns (nil, nil) when no stock row exists yet.
func (r *stockRepositoryImpl) GetStockByLocation(ctx context.Context, productID int, locationID int) (*domain.StockLocation, error) {
	var stock domain.StockLocation
	query := `
		SELECT id, product_id, location_id, quantity, reserved_quantity, updated_at
		FROM stock_locations
		WHERE product_id = ? AND location_id = ?
		FOR UPDATE`

	ext := database.GetExt(ctx, r.db)
	err := ext.QueryRowxContext(ctx, query, productID, locationID).StructScan(&stock)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, nil
		}
		return nil, err
	}
	return &stock, nil
}

// UpsertStockLocation inserts or updates physical stock quantity for a (product_id, location_id) pair inside the active transaction.
func (r *stockRepositoryImpl) UpsertStockLocation(ctx context.Context, stock *domain.StockLocation) error {
	query := `
		INSERT INTO stock_locations (product_id, location_id, quantity)
		VALUES (?, ?, ?)
		ON DUPLICATE KEY UPDATE quantity = VALUES(quantity)`

	ext := database.GetExt(ctx, r.db)
	res, err := ext.ExecContext(ctx, query, stock.ProductID, stock.LocationID, stock.Quantity)
	if err != nil {
		return err
	}

	id, _ := res.LastInsertId()
	if id > 0 {
		stock.ID = int(id)
	}
	return nil
}

// RecordMovement appends an immutable stock movement audit row to stock_movements inside the active transaction.
func (r *stockRepositoryImpl) RecordMovement(ctx context.Context, movement *domain.StockMovement) error {
	query := `
		INSERT INTO stock_movements (
			product_id, quantity, from_location_id, to_location_id,
			movement_type, user_id, notes
		) VALUES (?, ?, ?, ?, ?, ?, ?)`

	ext := database.GetExt(ctx, r.db)
	res, err := ext.ExecContext(ctx, query,
		movement.ProductID, movement.Quantity, movement.FromLocationID,
		movement.ToLocationID, movement.MovementType, movement.UserID,
		movement.Notes,
	)
	if err != nil {
		return err
	}
	id, err := res.LastInsertId()
	if err == nil {
		movement.ID = int(id)
	}
	return err
}

// GetAllStocks returns all current stock rows joined with non-deleted products and locations.
func (r *stockRepositoryImpl) GetAllStocks(ctx context.Context) ([]map[string]any, error) {
	query := `
		SELECT
			sl.id, sl.product_id, p.sku, p.name AS product_name,
			sl.location_id, l.code AS location_code, COALESCE(l.name, '') AS location_name,
			sl.quantity, sl.reserved_quantity, sl.updated_at
		FROM stock_locations sl
		JOIN products p ON sl.product_id = p.id
		JOIN locations l ON sl.location_id = l.id
		WHERE p.deleted_at IS NULL AND l.deleted_at IS NULL
		ORDER BY p.name ASC, l.name ASC
	`
	ext := database.GetExt(ctx, r.db)
	rows, err := ext.QueryxContext(ctx, query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	results := make([]map[string]any, 0)
	for rows.Next() {
		row := make(map[string]any)
		if err := rows.MapScan(row); err != nil {
			return nil, err
		}
		for k, v := range row {
			if b, ok := v.([]byte); ok {
				row[k] = string(b)
			}
		}
		results = append(results, row)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return results, nil
}

// GetMovementTypes returns all distinct non-null movement types recorded in stock_movements.
func (r *stockRepositoryImpl) GetMovementTypes(ctx context.Context) ([]string, error) {
	types := make([]string, 0)
	query := `SELECT DISTINCT movement_type FROM stock_movements WHERE movement_type IS NOT NULL ORDER BY movement_type ASC`
	ext := database.GetExt(ctx, r.db)
	if err := ext.SelectContext(ctx, &types, query); err != nil {
		return nil, err
	}
	if types == nil {
		return []string{}, nil
	}
	return types, nil
}

// GetBatchLogs returns paginated stock movement logs filtered by date range, product, locations, movement type, user, and notes.
func (r *stockRepositoryImpl) GetBatchLogs(ctx context.Context, filter inventory_dto.BatchLogFilter) (utils.PaginatedResult[inventory_dto.BatchLogResponse], error) {
	baseQuery := `
		FROM stock_movements sm
		JOIN products p ON sm.product_id = p.id
		JOIN users u ON sm.user_id = u.id
		LEFT JOIN locations from_loc ON sm.from_location_id = from_loc.id
		LEFT JOIN locations to_loc ON sm.to_location_id = to_loc.id
		WHERE 1=1
	`
	var args []any

	if filter.StartDate != "" {
		baseQuery += " AND sm.created_at >= ?"
		args = append(args, filter.StartDate)
	}
	if filter.EndDate != "" {
		baseQuery += " AND sm.created_at <= CONCAT(?, ' 23:59:59')"
		args = append(args, filter.EndDate)
	}

	if filter.ProductName != "" {
		baseQuery += " AND (p.name LIKE ? OR p.sku LIKE ?)"
		args = append(args, "%"+filter.ProductName+"%", "%"+filter.ProductName+"%")
	}

	applyTriState := func(column string, val string) {
		if val == "" || val == "all" {
			return
		}
		var ts struct {
			Include []string `json:"include"`
			Exclude []string `json:"exclude"`
		}
		if err := json.Unmarshal([]byte(val), &ts); err == nil {
			if len(ts.Include) > 0 {
				baseQuery += " AND " + column + " IN (?)"
				args = append(args, ts.Include)
			}
			if len(ts.Exclude) > 0 {
				baseQuery += " AND " + column + " NOT IN (?)"
				args = append(args, ts.Exclude)
			}
		}
	}

	applyTriState("sm.movement_type", filter.MovementType)
	applyTriState("from_loc.code", filter.SourceLocation)
	applyTriState("to_loc.code", filter.DestinationLocation)

	if filter.UserID != "" {
		baseQuery += " AND sm.user_id = ?"
		args = append(args, filter.UserID)
	}
	if filter.Notes != "" {
		baseQuery += " AND sm.notes LIKE ?"
		args = append(args, "%"+filter.Notes+"%")
	}
	if filter.BeforeID > 0 {
		baseQuery += " AND sm.id < ?"
		args = append(args, filter.BeforeID)
	}

	selectCols := `
		SELECT sm.id,
			p.sku,
			p.name AS product_name,
			sm.quantity,
			sm.movement_type,
			COALESCE(sm.notes, '') AS notes,
			sm.created_at,
			u.username AS user,
			COALESCE(from_loc.code, '') AS from_location,
			COALESCE(to_loc.code, '') AS to_location
	`

	if filter.SkipCount {
		ext := database.GetExt(ctx, r.db)
		limit := filter.Limit
		if limit <= 0 {
			limit = 5000
		}
		selectQuery := selectCols + baseQuery + " ORDER BY sm.id DESC LIMIT ?"
		args = append(args, limit)

		selectQuery, args, err := sqlx.In(selectQuery, args...)
		if err != nil {
			return utils.PaginatedResult[inventory_dto.BatchLogResponse]{}, err
		}
		selectQuery = ext.Rebind(selectQuery)

		var rows []inventory_dto.BatchLogResponse
		if err := ext.SelectContext(ctx, &rows, selectQuery, args...); err != nil {
			return utils.PaginatedResult[inventory_dto.BatchLogResponse]{}, err
		}
		if rows == nil {
			rows = []inventory_dto.BatchLogResponse{}
		}
		return utils.PaginatedResult[inventory_dto.BatchLogResponse]{
			Data:  rows,
			Page:  1,
			Limit: limit,
		}, nil
	}

	selectQuery := selectCols + baseQuery + " ORDER BY sm.created_at DESC, sm.id DESC"

	selectQuery, args, err := sqlx.In(selectQuery, args...)
	if err != nil {
		return utils.PaginatedResult[inventory_dto.BatchLogResponse]{}, err
	}
	selectQuery = r.db.Rebind(selectQuery)

	return database.FetchPaginated[inventory_dto.BatchLogResponse](ctx, r.db, selectQuery, filter.Page, filter.Limit, args...)
}

// GetStockHistory returns paginated stock movement history for a specific product.
func (r *stockRepositoryImpl) GetStockHistory(ctx context.Context, filter inventory_dto.StockHistoryFilter) (utils.PaginatedResult[inventory_dto.StockHistoryResponse], error) {
	query := `
		SELECT sm.id,
			sm.quantity,
			sm.movement_type,
			COALESCE(sm.notes, '') AS notes,
			sm.created_at,
			u.username AS user,
			COALESCE(from_loc.code, '') AS from_location,
			COALESCE(to_loc.code, '') AS to_location
		FROM stock_movements sm
		JOIN users u ON sm.user_id = u.id
		LEFT JOIN locations from_loc ON sm.from_location_id = from_loc.id
		LEFT JOIN locations to_loc ON sm.to_location_id = to_loc.id
		WHERE sm.product_id = ?
	`
	args := []any{filter.ProductID}

	if filter.MovementType != "" && filter.MovementType != "all" {
		query += " AND sm.movement_type = ?"
		args = append(args, filter.MovementType)
	}

	if filter.StartDate != "" {
		query += " AND sm.created_at >= ?"
		args = append(args, filter.StartDate)
	}
	if filter.EndDate != "" {
		query += " AND sm.created_at <= CONCAT(?, ' 23:59:59')"
		args = append(args, filter.EndDate)
	}

	if filter.LocationID != "" && filter.LocationID != "all" {
		query += " AND (sm.from_location_id = ? OR sm.to_location_id = ?)"
		args = append(args, filter.LocationID, filter.LocationID)
	}

	if filter.User != "" {
		query += " AND u.username LIKE ?"
		args = append(args, "%"+filter.User+"%")
	}

	query += " ORDER BY sm.created_at DESC"

	return database.FetchPaginated[inventory_dto.StockHistoryResponse](ctx, r.db, query, filter.Page, filter.Limit, args...)
}
