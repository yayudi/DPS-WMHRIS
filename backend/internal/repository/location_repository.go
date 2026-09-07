package repository

import (
	"context"
	"database/sql"

	"github.com/dps-wmhris/backend/internal/dto"
	"github.com/dps-wmhris/backend/internal/model"
	"github.com/jmoiron/sqlx"
)

type LocationRepository interface {
	BaseRepository[model.Location]
	Create(ctx context.Context, location *model.Location) error
	Update(ctx context.Context, tx *sqlx.Tx, location *model.Location) error
	GetStockSample(ctx context.Context, locationID int) ([]dto.StockSampleResponse, error)
	// Stock Management Helpers
	GetStockAtLocation(ctx context.Context, tx *sqlx.Tx, productID int, locationID int, lockForUpdate bool) (int, error)
	FindBestStock(ctx context.Context, tx *sqlx.Tx, productID int, qtyNeeded int, purpose string) (*int, error)
	IncrementStock(ctx context.Context, tx *sqlx.Tx, productID int, locationID int, qty int) error
	DeductStock(ctx context.Context, tx *sqlx.Tx, productID int, locationID int, qty int) error
}

type locationRepositoryImpl struct {
	BaseRepository[model.Location]
	db *sqlx.DB
}

// GetStockAtLocation checks the stock for a specific product and location.
// lockForUpdate is used for transaction safety.
func (r *locationRepositoryImpl) GetStockAtLocation(ctx context.Context, tx *sqlx.Tx, productID int, locationID int, lockForUpdate bool) (int, error) {
	query := `SELECT quantity FROM stock_locations WHERE product_id = ? AND location_id = ?`
	if lockForUpdate {
		query += ` FOR UPDATE`
	}
	var qty int
	var err error
	if tx != nil {
		err = tx.GetContext(ctx, &qty, query, productID, locationID)
	} else {
		err = r.db.GetContext(ctx, &qty, query, productID, locationID)
	}
	if err != nil {
		if err == sql.ErrNoRows {
			return 0, nil
		}
		return 0, err
	}
	return qty, nil
}

// FindBestStock searches for a location that has enough stock for the product.
func (r *locationRepositoryImpl) FindBestStock(ctx context.Context, tx *sqlx.Tx, productID int, qtyNeeded int, purpose string) (*int, error) {
	query := `
		SELECT sl.location_id
		FROM stock_locations sl
		JOIN locations l ON sl.location_id = l.id
		WHERE sl.product_id = ? AND l.purpose = ? AND sl.quantity >= ?
		ORDER BY l.id ASC
		LIMIT 1
	`
	var locationID int
	var err error
	if tx != nil {
		err = tx.GetContext(ctx, &locationID, query, productID, purpose, qtyNeeded)
	} else {
		err = r.db.GetContext(ctx, &locationID, query, productID, purpose, qtyNeeded)
	}
	if err != nil {
		if err == sql.ErrNoRows {
			return nil, nil
		}
		return nil, err
	}
	return &locationID, nil
}

func (r *locationRepositoryImpl) IncrementStock(ctx context.Context, tx *sqlx.Tx, productID int, locationID int, qty int) error {
	query := `
		INSERT INTO stock_locations (product_id, location_id, quantity)
		VALUES (?, ?, ?)
		ON DUPLICATE KEY UPDATE quantity = quantity + ?
	`
	var err error
	if tx != nil {
		_, err = tx.ExecContext(ctx, query, productID, locationID, qty, qty)
	} else {
		_, err = r.db.ExecContext(ctx, query, productID, locationID, qty, qty)
	}
	return err
}

func (r *locationRepositoryImpl) DeductStock(ctx context.Context, tx *sqlx.Tx, productID int, locationID int, qty int) error {
	query := `UPDATE stock_locations SET quantity = quantity - ? WHERE product_id = ? AND location_id = ?`
	var err error
	if tx != nil {
		_, err = tx.ExecContext(ctx, query, qty, productID, locationID)
	} else {
		_, err = r.db.ExecContext(ctx, query, qty, productID, locationID)
	}
	return err
}

func (r *locationRepositoryImpl) Update(ctx context.Context, tx *sqlx.Tx, location *model.Location) error {
	query := `
		UPDATE locations 
		SET code = ?, building = ?, floor = ?, name = ?, purpose = ?, is_active = ?
		WHERE id = ?`
		
	var err error
	if tx != nil {
		_, err = tx.ExecContext(ctx, query, location.Code, location.Building, location.Floor, location.Name, location.Purpose, location.IsActive, location.ID)
	} else {
		_, err = r.db.ExecContext(ctx, query, location.Code, location.Building, location.Floor, location.Name, location.Purpose, location.IsActive, location.ID)
	}
	return err
}

func (r *locationRepositoryImpl) GetStockSample(ctx context.Context, locationID int) ([]dto.StockSampleResponse, error) {
	query := `
		SELECT sl.product_id, p.sku, p.name, sl.quantity
		FROM stock_locations sl
		JOIN products p ON sl.product_id = p.id
		WHERE sl.location_id = ? AND sl.quantity > 0
		ORDER BY sl.quantity DESC
		LIMIT 10
	`
	var results []dto.StockSampleResponse
	err := r.db.SelectContext(ctx, &results, query, locationID)
	return results, err
}

func (r *locationRepositoryImpl) Create(ctx context.Context, location *model.Location) error {
	query := `
		INSERT INTO locations (code, building, floor, name, purpose, is_active) 
		VALUES (?, ?, ?, ?, ?, ?)`
		
	res, err := r.db.ExecContext(ctx, query,
		location.Code, location.Building, location.Floor, 
		location.Name, location.Purpose, location.IsActive,
	)
	
	if err != nil {
		return err
	}
	
	id, err := res.LastInsertId()
	if err == nil {
		location.ID = int(id)
	}
	return err
}

func NewLocationRepository(db *sqlx.DB) LocationRepository {
	base := NewBaseRepository[model.Location](db, "locations")
	return &locationRepositoryImpl{
		BaseRepository: base,
		db:             db,
	}
}
