package mysql

import (
	"context"

	"github.com/dps-wmhris/backend/internal/modules/inventory/domain"
	inventory_port "github.com/dps-wmhris/backend/internal/modules/inventory/port"
	"github.com/dps-wmhris/backend/internal/shared/database"
	"github.com/jmoiron/sqlx"
)

type slotRepositoryImpl struct {
	database.BaseRepository[domain.ProductLocationSlot]
	db *sqlx.DB
}

// NewSlotRepository creates a new instance of SlotRepository for MySQL.
func NewSlotRepository(db *sqlx.DB) inventory_port.SlotRepository {
	base := database.NewBaseRepository[domain.ProductLocationSlot](db, "product_location_slots")
	return &slotRepositoryImpl{
		BaseRepository: base,
		db:             db,
	}
}

// GetSlots retrieves all active slotting metadata for a given product and location.
func (r *slotRepositoryImpl) GetSlots(ctx context.Context, productID int, locationID int) ([]domain.ProductLocationSlot, error) {
	ext := database.GetExt(ctx, r.db)
	query := `
		SELECT id, product_id, location_id, room, rack, tier, formatted_coordinate, is_primary, updated_by, created_at, updated_at
		FROM product_location_slots
		WHERE product_id = ? AND location_id = ?
		ORDER BY is_primary DESC, id ASC`

	var slots []domain.ProductLocationSlot
	err := ext.SelectContext(ctx, &slots, query, productID, locationID)
	if err != nil {
		return nil, err
	}
	return slots, nil
}

// GetSlotByID retrieves a single slot by its primary key ID.
func (r *slotRepositoryImpl) GetSlotByID(ctx context.Context, id int) (*domain.ProductLocationSlot, error) {
	return r.FindByID(ctx, id)
}

// CreateSlot inserts a new slotting record.
func (r *slotRepositoryImpl) CreateSlot(ctx context.Context, slot *domain.ProductLocationSlot) error {
	ext := database.GetExt(ctx, r.db)
	query := `
		INSERT INTO product_location_slots (product_id, location_id, room, rack, tier, formatted_coordinate, is_primary, updated_by, created_at, updated_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`

	res, err := ext.ExecContext(ctx, query,
		slot.ProductID,
		slot.LocationID,
		slot.Room,
		slot.Rack,
		slot.Tier,
		slot.FormattedCoordinate,
		slot.IsPrimary,
		slot.UpdatedBy,
	)
	if err != nil {
		return err
	}

	id, err := res.LastInsertId()
	if err == nil && id > 0 {
		slot.ID = int(id)
	}
	return nil
}

// UpdateSlot updates an existing slotting record.
func (r *slotRepositoryImpl) UpdateSlot(ctx context.Context, slot *domain.ProductLocationSlot) error {
	ext := database.GetExt(ctx, r.db)
	query := `
		UPDATE product_location_slots
		SET room = ?, rack = ?, tier = ?, formatted_coordinate = ?, is_primary = ?, updated_by = ?, updated_at = NOW()
		WHERE id = ?`

	_, err := ext.ExecContext(ctx, query,
		slot.Room,
		slot.Rack,
		slot.Tier,
		slot.FormattedCoordinate,
		slot.IsPrimary,
		slot.UpdatedBy,
		slot.ID,
	)
	return err
}

// DeleteSlot deletes a slot record by ID.
func (r *slotRepositoryImpl) DeleteSlot(ctx context.Context, id int) error {
	return r.SoftDelete(ctx, id)
}

// SetPrimarySlot unsets existing primary and sets the given slot as primary for the product and location.
func (r *slotRepositoryImpl) SetPrimarySlot(ctx context.Context, productID int, locationID int, slotID int) error {
	ext := database.GetExt(ctx, r.db)
	if _, err := ext.ExecContext(ctx, `UPDATE product_location_slots SET is_primary = 0 WHERE product_id = ? AND location_id = ?`, productID, locationID); err != nil {
		return err
	}
	_, err := ext.ExecContext(ctx, `UPDATE product_location_slots SET is_primary = 1 WHERE id = ? AND product_id = ? AND location_id = ?`, slotID, productID, locationID)
	return err
}

// CreateSlotLog records a historical audit log entry when slotting coordinates are assigned, moved, or cleared.
func (r *slotRepositoryImpl) CreateSlotLog(ctx context.Context, log *domain.ProductLocationSlotLog) error {
	ext := database.GetExt(ctx, r.db)
	query := `
		INSERT INTO product_location_slot_logs (product_id, location_id, action, from_coordinate, to_coordinate, notes, user_id, created_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, NOW())`

	res, err := ext.ExecContext(ctx, query,
		log.ProductID,
		log.LocationID,
		log.Action,
		log.FromCoordinate,
		log.ToCoordinate,
		log.Notes,
		log.UserID,
	)
	if err != nil {
		return err
	}

	id, err := res.LastInsertId()
	if err == nil && id > 0 {
		log.ID = int(id)
	}
	return nil
}

// GetSlotLogs retrieves paginated audit logs for a product at a location.
func (r *slotRepositoryImpl) GetSlotLogs(ctx context.Context, productID int, locationID int, limit int, offset int) ([]domain.ProductLocationSlotLog, int, error) {
	page := 1
	if limit > 0 {
		page = (offset / limit) + 1
	}

	baseQuery := `
		SELECT l.id, l.product_id, l.location_id, l.action, l.from_coordinate, l.to_coordinate, l.notes, l.user_id,
		       COALESCE(NULLIF(u.nickname, ''), u.username, 'Sistem') AS user_name, l.created_at
		FROM product_location_slot_logs l
		LEFT JOIN users u ON l.user_id = u.id
		WHERE l.product_id = ? AND l.location_id = ?
		ORDER BY l.created_at DESC, l.id DESC`

	paginated, err := database.FetchPaginated[domain.ProductLocationSlotLog](ctx, r.db, baseQuery, page, limit, productID, locationID)
	if err != nil {
		return nil, 0, err
	}

	return paginated.Data, paginated.Total, nil
}

// GetSlotsByProductAndLocations retrieves slotting information for multiple locations of a product in a single query.
func (r *slotRepositoryImpl) GetSlotsByProductAndLocations(ctx context.Context, productID int, locationIDs []int) (map[int][]domain.ProductLocationSlot, error) {
	result := make(map[int][]domain.ProductLocationSlot)
	if len(locationIDs) == 0 {
		return result, nil
	}

	ext := database.GetExt(ctx, r.db)
	query, args, err := sqlx.In(`
		SELECT id, product_id, location_id, room, rack, tier, formatted_coordinate, is_primary, updated_by, created_at, updated_at
		FROM product_location_slots
		WHERE product_id = ? AND location_id IN (?)
		ORDER BY is_primary DESC, id ASC`, productID, locationIDs)
	if err != nil {
		return nil, err
	}

	query = ext.Rebind(query)
	var slots []domain.ProductLocationSlot
	if err := ext.SelectContext(ctx, &slots, query, args...); err != nil {
		return nil, err
	}

	for _, slot := range slots {
		result[slot.LocationID] = append(result[slot.LocationID], slot)
	}
	return result, nil
}
