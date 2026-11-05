package mysql

import (
	inventory_dto "github.com/dps-wmhris/backend/internal/modules/inventory/application/dto"
	"github.com/dps-wmhris/backend/internal/modules/inventory/domain"
	inventory_port "github.com/dps-wmhris/backend/internal/modules/inventory/port"

	"context"
	"database/sql"

	database "github.com/dps-wmhris/backend/internal/shared/database"
	"github.com/jmoiron/sqlx"
)

type locationRepositoryImpl struct {
	database.BaseRepository[domain.Location]
	db *sqlx.DB
}

// GetStockAtLocation checks the stock for a specific product and location.
// lockForUpdate is used for transaction safety.
func (r *locationRepositoryImpl) GetStockAtLocation(ctx context.Context, productID int, locationID int, lockForUpdate bool) (int, error) {
	query := `SELECT quantity FROM stock_locations WHERE product_id = ? AND location_id = ?`
	if lockForUpdate {
		query += ` FOR UPDATE`
	}
	var qty int
	var err error
	ext := database.GetExt(ctx, r.db)
	err = ext.GetContext(ctx, &qty, query, productID, locationID)
	if err != nil {
		if err == sql.ErrNoRows {
			return 0, nil
		}
		return 0, err
	}
	return qty, nil
}

// FindBestStock searches for a location that has enough stock for the product.
func (r *locationRepositoryImpl) FindBestStock(ctx context.Context, productID int, qtyNeeded int, purpose string) (*int, error) {
	query := `
		SELECT sl.location_id
		FROM stock_locations sl
		JOIN locations l ON sl.location_id = l.id
		WHERE sl.product_id = ? AND l.purpose = ? AND (sl.quantity - sl.reserved_quantity) >= ?
		ORDER BY l.id ASC
		LIMIT 1
	`
	var locationID int
	var err error
	ext := database.GetExt(ctx, r.db)
	err = ext.GetContext(ctx, &locationID, query, productID, purpose, qtyNeeded)
	if err != nil {
		if err == sql.ErrNoRows {
			return nil, nil
		}
		return nil, err
	}
	return &locationID, nil
}

// FindAvailableStockLocations retrieves all locations having available stock for a product,
// filtered by purpose and building, ordered descending by available stock (greedy).
func (r *locationRepositoryImpl) FindAvailableStockLocations(ctx context.Context, productID int, purpose string, building string) ([]domain.AvailableLocationStock, error) {
	query := `
		SELECT sl.location_id, (sl.quantity - sl.reserved_quantity) AS available_quantity
		FROM stock_locations sl
		JOIN locations l ON sl.location_id = l.id
		WHERE sl.product_id = ?
		  AND l.purpose = ?
		  AND (? = '' OR l.building = ?)
		  AND (sl.quantity - sl.reserved_quantity) > 0
		ORDER BY (sl.quantity - sl.reserved_quantity) DESC, sl.location_id ASC
	`
	var results []domain.AvailableLocationStock
	ext := database.GetExt(ctx, r.db)
	err := ext.SelectContext(ctx, &results, query, productID, purpose, building, building)
	if err != nil {
		return nil, err
	}
	return results, nil
}

// FindFulfillmentSourceStock returns stock from locations marked as fulfillment sources.
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
	var results []domain.AvailableLocationStock
	ext := database.GetExt(ctx, r.db)
	err := ext.SelectContext(ctx, &results, query, productID)
	if err != nil {
		return nil, err
	}
	return results, nil
}

// FindReplenishmentCandidateStock returns stock from non-fulfillment locations for replenishment.
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
	var results []domain.AvailableLocationStock
	ext := database.GetExt(ctx, r.db)
	err := ext.SelectContext(ctx, &results, query, productID)
	if err != nil {
		return nil, err
	}
	return results, nil
}

// UpdateFulfillmentSourceFlag toggles is_fulfillment_source flag for a location.
func (r *locationRepositoryImpl) UpdateFulfillmentSourceFlag(ctx context.Context, locationID int, isFulfillmentSource bool) error {
	query := `UPDATE locations SET is_fulfillment_source = ? WHERE id = ?`
	ext := database.GetExt(ctx, r.db)
	_, err := ext.ExecContext(ctx, query, isFulfillmentSource, locationID)
	return err
}

func (r *locationRepositoryImpl) IncrementStock(ctx context.Context, productID int, locationID int, qty int) error {
	query := `
		INSERT INTO stock_locations (product_id, location_id, quantity)
		VALUES (?, ?, ?)
		ON DUPLICATE KEY UPDATE quantity = quantity + ?
	`
	var err error
	ext := database.GetExt(ctx, r.db)
	_, err = ext.ExecContext(ctx, query, productID, locationID, qty, qty)
	return err
}

func (r *locationRepositoryImpl) DeductStock(ctx context.Context, productID int, locationID int, qty int) error {
	query := `UPDATE stock_locations SET quantity = quantity - ? WHERE product_id = ? AND location_id = ?`
	var err error
	ext := database.GetExt(ctx, r.db)
	_, err = ext.ExecContext(ctx, query, qty, productID, locationID)
	return err
}

func (r *locationRepositoryImpl) ReserveStock(ctx context.Context, productID int, locationID int, qty int) error {
	query := `UPDATE stock_locations SET reserved_quantity = reserved_quantity + ? WHERE product_id = ? AND location_id = ?`
	ext := database.GetExt(ctx, r.db)
	_, err := ext.ExecContext(ctx, query, qty, productID, locationID)
	return err
}

func (r *locationRepositoryImpl) ReleaseStock(ctx context.Context, productID int, locationID int, qty int) error {
	query := `UPDATE stock_locations SET reserved_quantity = reserved_quantity - ? WHERE product_id = ? AND location_id = ?`
	ext := database.GetExt(ctx, r.db)
	_, err := ext.ExecContext(ctx, query, qty, productID, locationID)
	return err
}

func (r *locationRepositoryImpl) Update(ctx context.Context, location *domain.Location) error {
	query := `
		UPDATE locations 
		SET code = ?, building = ?, floor = ?, name = ?, purpose = ?, is_active = ?, is_fulfillment_source = ?
		WHERE id = ?`

	var err error
	ext := database.GetExt(ctx, r.db)
	_, err = ext.ExecContext(ctx, query, location.Code, location.Building, location.Floor, location.Name, location.Purpose, location.IsActive, location.IsFulfillmentSource, location.ID)
	return err
}

func (r *locationRepositoryImpl) GetStockSample(ctx context.Context, locationID int) ([]inventory_dto.StockSampleResponse, error) {
	query := `
		SELECT sl.product_id, p.sku, p.name, sl.quantity
		FROM stock_locations sl
		JOIN products p ON sl.product_id = p.id
		WHERE sl.location_id = ? AND sl.quantity > 0
		ORDER BY sl.quantity DESC
		LIMIT 10
	`
	var results []inventory_dto.StockSampleResponse
	err := r.db.SelectContext(ctx, &results, query, locationID)
	return results, err
}

func (r *locationRepositoryImpl) Create(ctx context.Context, location *domain.Location) error {
	query := `
		INSERT INTO locations (code, building, floor, name, purpose, is_active, is_fulfillment_source) 
		VALUES (?, ?, ?, ?, ?, ?, ?)`

	res, err := r.db.ExecContext(ctx, query,
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

func NewLocationRepository(db *sqlx.DB) inventory_port.LocationRepository {
	base := database.NewBaseRepository[domain.Location](db, "locations")
	return &locationRepositoryImpl{
		BaseRepository: base,
		db:             db,
	}
}
