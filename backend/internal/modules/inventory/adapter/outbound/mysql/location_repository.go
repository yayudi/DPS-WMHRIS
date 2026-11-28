// Package mysql implements MySQL persistence repositories for the inventory bounded context.
package mysql

import (
	"context"
	"database/sql"
	"errors"

	inventory_dto "github.com/dps-wmhris/backend/internal/modules/inventory/application/dto"
	"github.com/dps-wmhris/backend/internal/modules/inventory/domain"
	inventory_port "github.com/dps-wmhris/backend/internal/modules/inventory/port"
	"github.com/dps-wmhris/backend/internal/shared/database"
	"github.com/jmoiron/sqlx"
)

const locationSelectColumns = `
	id, created_at, deleted_at, code, building, floor,
	COALESCE(name, '') AS name,
	COALESCE(purpose, '') AS purpose,
	COALESCE(is_active, 1) AS is_active,
	is_fulfillment_source
`

type locationRepositoryImpl struct {
	database.BaseRepository[domain.Location]
	db *sqlx.DB
}

// NewLocationRepository creates a MySQL-backed LocationRepository.
func NewLocationRepository(db *sqlx.DB) inventory_port.LocationRepository {
	base := database.NewBaseRepository[domain.Location](db, "locations")
	return &locationRepositoryImpl{
		BaseRepository: base,
		db:             db,
	}
}

func (r *locationRepositoryImpl) ensureExists(ctx context.Context, ext database.ExtContext, id int) error {
	var count int
	if err := ext.GetContext(ctx, &count, `SELECT COUNT(*) FROM locations WHERE id = ? AND deleted_at IS NULL`, id); err != nil {
		return err
	}
	if count == 0 {
		return sql.ErrNoRows
	}
	return nil
}

// FindAll retrieves all non-deleted locations using COALESCE for nullable columns.
func (r *locationRepositoryImpl) FindAll(ctx context.Context) ([]domain.Location, error) {
	ext := database.GetExt(ctx, r.db)
	locations := make([]domain.Location, 0)
	query := `SELECT ` + locationSelectColumns + ` FROM locations WHERE deleted_at IS NULL ORDER BY id ASC`
	if err := ext.SelectContext(ctx, &locations, query); err != nil {
		return nil, err
	}
	if locations == nil {
		return []domain.Location{}, nil
	}
	return locations, nil
}

// FindByID retrieves a single non-deleted location by ID using COALESCE for nullable columns.
func (r *locationRepositoryImpl) FindByID(ctx context.Context, id int) (*domain.Location, error) {
	ext := database.GetExt(ctx, r.db)
	var loc domain.Location
	query := `SELECT ` + locationSelectColumns + ` FROM locations WHERE id = ? AND deleted_at IS NULL`
	if err := ext.GetContext(ctx, &loc, query, id); err != nil {
		return nil, err
	}
	return &loc, nil
}

// GetStockAtLocation retrieves the physical stock quantity for a product at a specific location.
// When lockForUpdate is true, the row is locked with SELECT ... FOR UPDATE inside the active transaction.
func (r *locationRepositoryImpl) GetStockAtLocation(ctx context.Context, productID int, locationID int, lockForUpdate bool) (int, error) {
	query := `SELECT quantity FROM stock_locations WHERE product_id = ? AND location_id = ?`
	if lockForUpdate {
		query += ` FOR UPDATE`
	}
	var qty int
	ext := database.GetExt(ctx, r.db)
	if err := ext.GetContext(ctx, &qty, query, productID, locationID); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return 0, nil
		}
		return 0, err
	}
	return qty, nil
}

// FindBestStock finds an active, non-deleted location matching purpose with sufficient available stock.
func (r *locationRepositoryImpl) FindBestStock(ctx context.Context, productID int, qtyNeeded int, purpose string) (*int, error) {
	query := `
		SELECT sl.location_id
		FROM stock_locations sl
		JOIN locations l ON sl.location_id = l.id
		WHERE sl.product_id = ?
		  AND l.purpose = ?
		  AND l.is_active = 1
		  AND l.deleted_at IS NULL
		  AND (sl.quantity - sl.reserved_quantity) >= ?
		ORDER BY l.id ASC
		LIMIT 1
	`
	var locationID int
	ext := database.GetExt(ctx, r.db)
	if err := ext.GetContext(ctx, &locationID, query, productID, purpose, qtyNeeded); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, nil
		}
		return nil, err
	}
	return &locationID, nil
}

// FindAvailableStockLocations retrieves active, non-deleted locations with available stock for a product,
// filtered by purpose and optional building, ordered descending by available stock (greedy allocation).
func (r *locationRepositoryImpl) FindAvailableStockLocations(ctx context.Context, productID int, purpose string, building string) ([]domain.AvailableLocationStock, error) {
	query := `
		SELECT sl.location_id, (sl.quantity - sl.reserved_quantity) AS available_quantity
		FROM stock_locations sl
		JOIN locations l ON sl.location_id = l.id
		WHERE sl.product_id = ?
		  AND l.purpose = ?
		  AND l.is_active = 1
		  AND l.deleted_at IS NULL
		  AND (? = '' OR l.building = ?)
		  AND (sl.quantity - sl.reserved_quantity) > 0
		ORDER BY (sl.quantity - sl.reserved_quantity) DESC, sl.location_id ASC
	`
	results := make([]domain.AvailableLocationStock, 0)
	ext := database.GetExt(ctx, r.db)
	if err := ext.SelectContext(ctx, &results, query, productID, purpose, building, building); err != nil {
		return nil, err
	}
	if results == nil {
		return []domain.AvailableLocationStock{}, nil
	}
	return results, nil
}

// FindFulfillmentSourceStock returns available stock from active locations flagged as automatic fulfillment sources.
func (r *locationRepositoryImpl) FindFulfillmentSourceStock(ctx context.Context, productID int) ([]domain.AvailableLocationStock, error) {
	query := `
		SELECT sl.location_id, (sl.quantity - sl.reserved_quantity) AS available_quantity
		FROM stock_locations sl
		JOIN locations l ON sl.location_id = l.id
		WHERE sl.product_id = ?
		  AND l.is_fulfillment_source = 1
		  AND l.is_active = 1
		  AND l.deleted_at IS NULL
		  AND (sl.quantity - sl.reserved_quantity) > 0
		ORDER BY (sl.quantity - sl.reserved_quantity) DESC, sl.location_id ASC
	`
	results := make([]domain.AvailableLocationStock, 0)
	ext := database.GetExt(ctx, r.db)
	if err := ext.SelectContext(ctx, &results, query, productID); err != nil {
		return nil, err
	}
	if results == nil {
		return []domain.AvailableLocationStock{}, nil
	}
	return results, nil
}

// FindReplenishmentCandidateStock returns available stock from active non-fulfillment storage locations.
func (r *locationRepositoryImpl) FindReplenishmentCandidateStock(ctx context.Context, productID int) ([]domain.AvailableLocationStock, error) {
	query := `
		SELECT sl.location_id, (sl.quantity - sl.reserved_quantity) AS available_quantity
		FROM stock_locations sl
		JOIN locations l ON sl.location_id = l.id
		WHERE sl.product_id = ?
		  AND l.is_fulfillment_source = 0
		  AND l.is_active = 1
		  AND l.deleted_at IS NULL
		  AND l.purpose NOT IN ('BAD_STOCK', 'WORKSHOP', 'BRANCH')
		  AND (sl.quantity - sl.reserved_quantity) > 0
		ORDER BY (sl.quantity - sl.reserved_quantity) DESC, sl.location_id ASC
	`
	results := make([]domain.AvailableLocationStock, 0)
	ext := database.GetExt(ctx, r.db)
	if err := ext.SelectContext(ctx, &results, query, productID); err != nil {
		return nil, err
	}
	if results == nil {
		return []domain.AvailableLocationStock{}, nil
	}
	return results, nil
}

// UpdateFulfillmentSourceFlag toggles is_fulfillment_source for a non-deleted location.
func (r *locationRepositoryImpl) UpdateFulfillmentSourceFlag(ctx context.Context, locationID int, isFulfillmentSource bool) error {
	query := `UPDATE locations SET is_fulfillment_source = ? WHERE id = ? AND deleted_at IS NULL`
	ext := database.GetExt(ctx, r.db)
	res, err := ext.ExecContext(ctx, query, isFulfillmentSource, locationID)
	if err != nil {
		return err
	}
	if affected, err := res.RowsAffected(); err == nil && affected == 0 {
		return r.ensureExists(ctx, ext, locationID)
	}
	return nil
}

// IncrementStock atomically increments physical quantity at a product/location pair.
func (r *locationRepositoryImpl) IncrementStock(ctx context.Context, productID int, locationID int, qty int) error {
	query := `
		INSERT INTO stock_locations (product_id, location_id, quantity)
		VALUES (?, ?, ?)
		ON DUPLICATE KEY UPDATE quantity = quantity + ?
	`
	ext := database.GetExt(ctx, r.db)
	_, err := ext.ExecContext(ctx, query, productID, locationID, qty, qty)
	return err
}

// DeductStock subtracts physical quantity at a product/location pair inside the active transaction.
func (r *locationRepositoryImpl) DeductStock(ctx context.Context, productID int, locationID int, qty int) error {
	query := `UPDATE stock_locations SET quantity = quantity - ? WHERE product_id = ? AND location_id = ?`
	ext := database.GetExt(ctx, r.db)
	_, err := ext.ExecContext(ctx, query, qty, productID, locationID)
	return err
}

// ReserveStock increments reserved_quantity at a product/location pair inside the active transaction.
func (r *locationRepositoryImpl) ReserveStock(ctx context.Context, productID int, locationID int, qty int) error {
	query := `UPDATE stock_locations SET reserved_quantity = reserved_quantity + ? WHERE product_id = ? AND location_id = ?`
	ext := database.GetExt(ctx, r.db)
	_, err := ext.ExecContext(ctx, query, qty, productID, locationID)
	return err
}

// ReleaseStock decrements reserved_quantity clamped at zero to prevent negative reservations.
func (r *locationRepositoryImpl) ReleaseStock(ctx context.Context, productID int, locationID int, qty int) error {
	query := `UPDATE stock_locations SET reserved_quantity = GREATEST(0, reserved_quantity - ?) WHERE product_id = ? AND location_id = ?`
	ext := database.GetExt(ctx, r.db)
	_, err := ext.ExecContext(ctx, query, qty, productID, locationID)
	return err
}

// Update updates a non-deleted warehouse location record inside the active transaction.
func (r *locationRepositoryImpl) Update(ctx context.Context, location *domain.Location) error {
	query := `
		UPDATE locations
		SET code = ?, building = ?, floor = ?, name = ?, purpose = ?, is_active = ?, is_fulfillment_source = ?
		WHERE id = ? AND deleted_at IS NULL`

	ext := database.GetExt(ctx, r.db)
	res, err := ext.ExecContext(ctx, query,
		location.Code, location.Building, location.Floor, location.Name,
		location.Purpose, location.IsActive, location.IsFulfillmentSource, location.ID,
	)
	if err != nil {
		return err
	}
	if affected, err := res.RowsAffected(); err == nil && affected == 0 {
		return r.ensureExists(ctx, ext, location.ID)
	}
	return nil
}

// GetStockSample returns up to 10 products with the highest positive stock at a location.
func (r *locationRepositoryImpl) GetStockSample(ctx context.Context, locationID int) ([]inventory_dto.StockSampleResponse, error) {
	query := `
		SELECT sl.product_id, p.sku, p.name, sl.quantity
		FROM stock_locations sl
		JOIN products p ON sl.product_id = p.id
		WHERE sl.location_id = ? AND sl.quantity > 0
		ORDER BY sl.quantity DESC
		LIMIT 10
	`
	results := make([]inventory_dto.StockSampleResponse, 0)
	ext := database.GetExt(ctx, r.db)
	if err := ext.SelectContext(ctx, &results, query, locationID); err != nil {
		return nil, err
	}
	if results == nil {
		return []inventory_dto.StockSampleResponse{}, nil
	}
	return results, nil
}

// Create inserts a new warehouse location inside the active transaction and populates location.ID.
func (r *locationRepositoryImpl) Create(ctx context.Context, location *domain.Location) error {
	query := `
		INSERT INTO locations (code, building, floor, name, purpose, is_active, is_fulfillment_source)
		VALUES (?, ?, ?, ?, ?, ?, ?)`

	ext := database.GetExt(ctx, r.db)
	res, err := ext.ExecContext(ctx, query,
		location.Code, location.Building, location.Floor,
		location.Name, location.Purpose, location.IsActive, location.IsFulfillmentSource,
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
