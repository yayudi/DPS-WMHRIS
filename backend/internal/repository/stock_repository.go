package repository

import (
	"context"
	"database/sql"
	"encoding/json"

	"github.com/dps-wmhris/backend/internal/dto"
	"github.com/dps-wmhris/backend/internal/model"
	"github.com/dps-wmhris/backend/internal/utils"
	"github.com/jmoiron/sqlx"
)

type StockRepository interface {
	GetStockByLocation(ctx context.Context, db sqlx.ExtContext, productID int, locationID int) (*model.StockLocation, error)
	UpsertStockLocation(ctx context.Context, db sqlx.ExtContext, stock *model.StockLocation) error
	RecordMovement(ctx context.Context, db sqlx.ExtContext, movement *model.StockMovement) error
	GetAllStocks(ctx context.Context) ([]map[string]interface{}, error)
	GetMovementTypes(ctx context.Context) ([]string, error)
	GetBatchLogs(ctx context.Context, filter dto.BatchLogFilter) (utils.PaginatedResult[dto.BatchLogResponse], error)
	GetStockHistory(ctx context.Context, filter dto.StockHistoryFilter) (utils.PaginatedResult[dto.StockHistoryResponse], error)
}

type stockRepositoryImpl struct {
	db *sqlx.DB
}

func NewStockRepository(db *sqlx.DB) StockRepository {
	return &stockRepositoryImpl{db: db}
}

func (r *stockRepositoryImpl) GetStockByLocation(ctx context.Context, db sqlx.ExtContext, productID int, locationID int) (*model.StockLocation, error) {
	var stock model.StockLocation
	query := "SELECT id, product_id, location_id, quantity, updated_at FROM stock_locations WHERE product_id = ? AND location_id = ?"
	
	row := db.QueryRowxContext(ctx, query, productID, locationID)
	err := row.StructScan(&stock)
	if err != nil {
		if err == sql.ErrNoRows {
			return nil, nil
		}
		return nil, err
	}
	return &stock, nil
}

func (r *stockRepositoryImpl) UpsertStockLocation(ctx context.Context, db sqlx.ExtContext, stock *model.StockLocation) error {
	query := `
		INSERT INTO stock_locations (product_id, location_id, quantity) 
		VALUES (?, ?, ?) 
		ON DUPLICATE KEY UPDATE quantity = VALUES(quantity)`
		
	res, err := db.ExecContext(ctx, query, stock.ProductID, stock.LocationID, stock.Quantity)
	if err != nil {
		return err
	}
	
	id, _ := res.LastInsertId()
	if id > 0 {
		stock.ID = int(id)
	}
	return nil
}

func (r *stockRepositoryImpl) RecordMovement(ctx context.Context, db sqlx.ExtContext, movement *model.StockMovement) error {
	query := `
		INSERT INTO stock_movements (
			product_id, quantity, from_location_id, to_location_id, 
			movement_type, user_id, notes
		) VALUES (?, ?, ?, ?, ?, ?, ?)`
		
	res, err := db.ExecContext(ctx, query,
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

func (r *stockRepositoryImpl) GetAllStocks(ctx context.Context) ([]map[string]interface{}, error) {
	query := `
		SELECT 
			sl.id, sl.product_id, p.sku, p.name AS product_name,
			sl.location_id, l.code AS location_code, l.name AS location_name,
			sl.quantity, sl.updated_at
		FROM stock_locations sl
		JOIN products p ON sl.product_id = p.id
		JOIN locations l ON sl.location_id = l.id
		ORDER BY p.name ASC, l.name ASC
	`
	rows, err := r.db.QueryxContext(ctx, query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var results []map[string]interface{}
	for rows.Next() {
		row := make(map[string]interface{})
		if err := rows.MapScan(row); err != nil {
			return nil, err
		}
		
		// Convert []byte to string for string columns if needed, MapScan handles some natively but sometimes returns []byte
		for k, v := range row {
			if b, ok := v.([]byte); ok {
				row[k] = string(b)
			}
		}

		results = append(results, row)
	}
	return results, nil
}

func (r *stockRepositoryImpl) GetMovementTypes(ctx context.Context) ([]string, error) {
	var types []string
	query := `SELECT DISTINCT movement_type FROM stock_movements WHERE movement_type IS NOT NULL ORDER BY movement_type ASC`
	err := r.db.SelectContext(ctx, &types, query)
	return types, err
}

func (r *stockRepositoryImpl) GetBatchLogs(ctx context.Context, filter dto.BatchLogFilter) (utils.PaginatedResult[dto.BatchLogResponse], error) {
	baseQuery := `
		FROM stock_movements sm
		JOIN products p ON sm.product_id = p.id
		JOIN users u ON sm.user_id = u.id
		LEFT JOIN locations from_loc ON sm.from_location_id = from_loc.id
		LEFT JOIN locations to_loc ON sm.to_location_id = to_loc.id
		WHERE 1=1
	`
	var args []interface{}

	if filter.StartDate != "" && filter.EndDate != "" {
		baseQuery += " AND DATE(sm.created_at) BETWEEN ? AND ?"
		args = append(args, filter.StartDate, filter.EndDate)
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
	
	selectQuery := `
		SELECT sm.id,
			p.sku,
			p.name as product_name,
			sm.quantity,
			sm.movement_type,
			COALESCE(sm.notes, '') as notes,
			sm.created_at,
			u.username as user,
			COALESCE(from_loc.code, '') as from_location,
			COALESCE(to_loc.code, '') as to_location
	` + baseQuery + " ORDER BY sm.created_at DESC"
	
	selectQuery, args, err := sqlx.In(selectQuery, args...)
	if err != nil {
		return utils.PaginatedResult[dto.BatchLogResponse]{}, err
	}
	selectQuery = r.db.Rebind(selectQuery)
	
	return utils.FetchPaginated[dto.BatchLogResponse](ctx, r.db, selectQuery, filter.Page, filter.Limit, args...)
}

func (r *stockRepositoryImpl) GetStockHistory(ctx context.Context, filter dto.StockHistoryFilter) (utils.PaginatedResult[dto.StockHistoryResponse], error) {
	query := `
		SELECT sm.id,
			sm.quantity,
			sm.movement_type,
			COALESCE(sm.notes, '') as notes,
			sm.created_at,
			u.username as user,
			COALESCE(from_loc.code, '') as from_location,
			COALESCE(to_loc.code, '') as to_location
		FROM stock_movements sm
		JOIN users u ON sm.user_id = u.id
		LEFT JOIN locations from_loc ON sm.from_location_id = from_loc.id
		LEFT JOIN locations to_loc ON sm.to_location_id = to_loc.id
		WHERE sm.product_id = ?
	`
	args := []interface{}{filter.ProductID}

	if filter.MovementType != "" && filter.MovementType != "all" {
		query += " AND sm.movement_type = ?"
		args = append(args, filter.MovementType)
	}

	if filter.StartDate != "" && filter.EndDate != "" {
		query += " AND DATE(sm.created_at) BETWEEN ? AND ?"
		args = append(args, filter.StartDate, filter.EndDate)
	} else if filter.StartDate != "" {
		query += " AND DATE(sm.created_at) >= ?"
		args = append(args, filter.StartDate)
	} else if filter.EndDate != "" {
		query += " AND DATE(sm.created_at) <= ?"
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

	return utils.FetchPaginated[dto.StockHistoryResponse](ctx, r.db, query, filter.Page, filter.Limit, args...)
}
