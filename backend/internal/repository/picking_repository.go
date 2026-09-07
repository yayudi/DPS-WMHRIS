package repository

import (
	"context"
	"database/sql"

	"github.com/dps-wmhris/backend/internal/dto"
	"github.com/dps-wmhris/backend/internal/model"
	"github.com/jmoiron/sqlx"
)

type PickingRepository interface {
	GetPendingItems(ctx context.Context) ([]dto.PendingPickingItemResponse, error)
	GetHistoryItems(ctx context.Context, limit int) ([]dto.HistoryPickingItemResponse, error)
	GetListDetails(ctx context.Context, pickingListID int) ([]dto.PickingListDetailResponse, error)

	GetHeaderByID(ctx context.Context, tx *sqlx.Tx, id int) (*model.PickingList, error)
	GetItemsByIDs(ctx context.Context, tx *sqlx.Tx, itemIDs []int) ([]model.PickingListItem, error)
	CountPendingItems(ctx context.Context, tx *sqlx.Tx, pickingListID int) (int, error)

	UpdateSuggestedLocation(ctx context.Context, tx *sqlx.Tx, itemID int, locationID *int) error
	UpdateItemStatus(ctx context.Context, tx *sqlx.Tx, itemID int, status string) error
	ValidateItem(ctx context.Context, tx *sqlx.Tx, itemID int, locationID int) error
	ValidateHeader(ctx context.Context, tx *sqlx.Tx, listID int) error

	VoidHeader(ctx context.Context, tx *sqlx.Tx, listID int) (int64, error)
	VoidItemsByListID(ctx context.Context, tx *sqlx.Tx, listID int) error

	CreatePickingListTx(ctx context.Context, tx *sqlx.Tx, header *model.PickingList) (int, error)
	CreatePickingListItemTx(ctx context.Context, tx *sqlx.Tx, item *model.PickingListItem) error

	GetItemsToRestock(ctx context.Context, tx *sqlx.Tx, listID int) ([]model.PickingListItem, error)
	GetUnfulfillableItems(ctx context.Context, tx *sqlx.Tx, listID int) ([]model.PickingListItem, error)
	GetPendingAndBackorderItems(ctx context.Context, tx *sqlx.Tx, listIDs []int) ([]model.PickingListItem, error)
}

type pickingRepository struct {
	db *sqlx.DB
}

func NewPickingRepository(db *sqlx.DB) PickingRepository {
	return &pickingRepository{db: db}
}

func (r *pickingRepository) GetPendingItems(ctx context.Context) ([]dto.PendingPickingItemResponse, error) {
	query := `
		SELECT
			pli.id,
			pli.picking_list_id,
			pli.product_id,
			pli.original_sku as sku,
			pli.quantity,
			pli.status,
			COALESCE(loc_picked.code, loc_suggested.code) as location_code,
			p.name as product_name,
			pl.original_invoice_id,
			pl.source,
			pl.order_date,
			pl.created_at,
			pl.customer_name,
			pl.marketplace_status,
			pl.location_purpose,
			pl.shop_name,
			COALESCE(sl.quantity, 0) as available_stock
		FROM picking_list_items pli
		JOIN picking_lists pl ON pli.picking_list_id = pl.id
		LEFT JOIN products p ON pli.product_id = p.id
		LEFT JOIN locations loc_suggested ON pli.suggested_location_id = loc_suggested.id
		LEFT JOIN locations loc_picked ON pli.picked_from_location_id = loc_picked.id
		LEFT JOIN stock_locations sl ON sl.location_id = pli.suggested_location_id AND sl.product_id = pli.product_id
		WHERE pl.status IN (?, ?)
		  AND pl.is_active = 1
		  AND pli.status IN (?, 'BACKORDER')
		ORDER BY pl.created_at DESC, location_code ASC
	`
	var items []dto.PendingPickingItemResponse
	err := r.db.SelectContext(ctx, &items, query, "PENDING", "VALIDATED", "PENDING")
	return items, err
}

func (r *pickingRepository) GetHistoryItems(ctx context.Context, limit int) ([]dto.HistoryPickingItemResponse, error) {
	query := `
		SELECT
			pl.id as picking_list_id, pl.original_invoice_id, pl.source, pl.status,
			pl.marketplace_status, pl.customer_name, pl.shop_name, pl.created_at, pl.order_date, pl.location_purpose,
			pli.id as item_id, pli.original_sku as sku, pli.quantity, pli.status as item_status,
			pli.return_condition, pli.return_notes,
			p.name as product_name
		FROM picking_lists pl
		JOIN picking_list_items pli ON pl.id = pli.picking_list_id
		LEFT JOIN products p ON pli.product_id = p.id
		WHERE pl.status NOT IN (?)
		ORDER BY pl.created_at DESC, pl.id DESC
		LIMIT ?
	`
	var items []dto.HistoryPickingItemResponse
	err := r.db.SelectContext(ctx, &items, query, "PENDING", limit)
	return items, err
}

func (r *pickingRepository) GetListDetails(ctx context.Context, pickingListID int) ([]dto.PickingListDetailResponse, error) {
	query := `
		SELECT
			pli.id,
			pli.original_sku as sku,
			pli.quantity as qty,
			p.name,
			pli.status,
			pli.return_condition,
			pli.return_notes
		FROM picking_list_items pli
		JOIN products p ON pli.product_id = p.id
		WHERE pli.picking_list_id = ?
	`
	var items []dto.PickingListDetailResponse
	err := r.db.SelectContext(ctx, &items, query, pickingListID)
	return items, err
}

func (r *pickingRepository) GetHeaderByID(ctx context.Context, tx *sqlx.Tx, id int) (*model.PickingList, error) {
	query := `SELECT * FROM picking_lists WHERE id = ? LIMIT 1`
	var header model.PickingList
	var err error
	if tx != nil {
		err = tx.GetContext(ctx, &header, query, id)
	} else {
		err = r.db.GetContext(ctx, &header, query, id)
	}
	if err == sql.ErrNoRows {
		return nil, nil
	}
	return &header, err
}

func (r *pickingRepository) GetItemsByIDs(ctx context.Context, tx *sqlx.Tx, itemIDs []int) ([]model.PickingListItem, error) {
	if len(itemIDs) == 0 {
		return []model.PickingListItem{}, nil
	}
	query, args, err := sqlx.In(`SELECT * FROM picking_list_items WHERE id IN (?)`, itemIDs)
	if err != nil {
		return nil, err
	}
	query = tx.Rebind(query)
	var items []model.PickingListItem
	err = tx.SelectContext(ctx, &items, query, args...)
	return items, err
}

func (r *pickingRepository) CountPendingItems(ctx context.Context, tx *sqlx.Tx, pickingListID int) (int, error) {
	query := `SELECT count(*) FROM picking_list_items WHERE picking_list_id = ? AND status IN ('PENDING', 'BACKORDER')`
	var count int
	err := tx.GetContext(ctx, &count, query, pickingListID)
	return count, err
}

func (r *pickingRepository) UpdateSuggestedLocation(ctx context.Context, tx *sqlx.Tx, itemID int, locationID *int) error {
	query := `UPDATE picking_list_items SET suggested_location_id = ? WHERE id = ?`
	_, err := tx.ExecContext(ctx, query, locationID, itemID)
	return err
}

func (r *pickingRepository) UpdateItemStatus(ctx context.Context, tx *sqlx.Tx, itemID int, status string) error {
	query := `UPDATE picking_list_items SET status = ? WHERE id = ?`
	_, err := tx.ExecContext(ctx, query, status, itemID)
	return err
}

func (r *pickingRepository) ValidateItem(ctx context.Context, tx *sqlx.Tx, itemID int, locationID int) error {
	query := `UPDATE picking_list_items SET status = 'VALIDATED', picked_from_location_id = ? WHERE id = ?`
	_, err := tx.ExecContext(ctx, query, locationID, itemID)
	return err
}

func (r *pickingRepository) ValidateHeader(ctx context.Context, tx *sqlx.Tx, listID int) error {
	query := `UPDATE picking_lists SET status = 'VALIDATED', updated_at = NOW() WHERE id = ?`
	_, err := tx.ExecContext(ctx, query, listID)
	return err
}

func (r *pickingRepository) VoidHeader(ctx context.Context, tx *sqlx.Tx, listID int) (int64, error) {
	query := `UPDATE picking_lists SET status = 'VOID', is_active = 0, updated_at = NOW() WHERE id = ? AND status != 'VOID'`
	res, err := tx.ExecContext(ctx, query, listID)
	if err != nil {
		return 0, err
	}
	return res.RowsAffected()
}

func (r *pickingRepository) VoidItemsByListID(ctx context.Context, tx *sqlx.Tx, listID int) error {
	query := `UPDATE picking_list_items SET status = 'VOID' WHERE picking_list_id = ?`
	_, err := tx.ExecContext(ctx, query, listID)
	return err
}

func (r *pickingRepository) GetItemsToRestock(ctx context.Context, tx *sqlx.Tx, listID int) ([]model.PickingListItem, error) {
	query := `
		SELECT * FROM picking_list_items
		WHERE picking_list_id = ? AND status = 'VALIDATED' AND picked_from_location_id IS NOT NULL
	`
	var items []model.PickingListItem
	err := tx.SelectContext(ctx, &items, query, listID)
	return items, err
}

func (r *pickingRepository) GetUnfulfillableItems(ctx context.Context, tx *sqlx.Tx, listID int) ([]model.PickingListItem, error) {
	query := `
		SELECT pli.* FROM picking_list_items pli
		WHERE pli.picking_list_id = ?
		  AND (pli.status = 'BACKORDER' OR (pli.status = 'PENDING' AND pli.suggested_location_id IS NULL))
	`
	var items []model.PickingListItem
	err := tx.SelectContext(ctx, &items, query, listID)
	return items, err
}

func (r *pickingRepository) GetPendingAndBackorderItems(ctx context.Context, tx *sqlx.Tx, listIDs []int) ([]model.PickingListItem, error) {
	if len(listIDs) == 0 {
		return []model.PickingListItem{}, nil
	}
	query, args, err := sqlx.In(`
		SELECT pli.* FROM picking_list_items pli
		JOIN picking_lists pl ON pli.picking_list_id = pl.id
		WHERE pli.picking_list_id IN (?)
		  AND pli.status IN ('PENDING', 'BACKORDER')
		  AND pl.status IN ('PENDING', 'VALIDATED')
		  AND pl.is_active = 1
	`, listIDs)
	if err != nil {
		return nil, err
	}
	query = tx.Rebind(query)
	var items []model.PickingListItem
	err = tx.SelectContext(ctx, &items, query, args...)
	return items, err
}

func (r *pickingRepository) CreatePickingListTx(ctx context.Context, tx *sqlx.Tx, header *model.PickingList) (int, error) {
	query := `
		INSERT INTO picking_lists (user_id, original_invoice_id, source, status, is_active, customer_name, order_date, marketplace_status, location_purpose, shop_name)
		VALUES (:user_id, :original_invoice_id, :source, :status, :is_active, :customer_name, :order_date, :marketplace_status, :location_purpose, :shop_name)
	`
	res, err := tx.NamedExecContext(ctx, query, header)
	if err != nil {
		return 0, err
	}
	id, err := res.LastInsertId()
	return int(id), err
}

func (r *pickingRepository) CreatePickingListItemTx(ctx context.Context, tx *sqlx.Tx, item *model.PickingListItem) error {
	query := `
		INSERT INTO picking_list_items (picking_list_id, product_id, quantity, status)
		VALUES (:picking_list_id, :product_id, :quantity, :status)
	`
	_, err := tx.NamedExecContext(ctx, query, item)
	return err
}
