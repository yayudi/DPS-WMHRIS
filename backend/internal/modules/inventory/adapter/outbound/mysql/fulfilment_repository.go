package mysql

import (
	"context"
	"database/sql"

	inventory_dto "github.com/dps-wmhris/backend/internal/modules/inventory/application/dto"
	database "github.com/dps-wmhris/backend/internal/shared/database"

	"github.com/dps-wmhris/backend/internal/modules/inventory/domain"
	inventory_port "github.com/dps-wmhris/backend/internal/modules/inventory/port"

	"github.com/jmoiron/sqlx"
)

type fulfilmentRepository struct {
	db *sqlx.DB
}

func NewFulfilmentRepository(db *sqlx.DB) inventory_port.FulfilmentRepository {
	return &fulfilmentRepository{db: db}
}

func (r *fulfilmentRepository) GetPendingFilterOptions(ctx context.Context) (inventory_dto.PendingFilterOptionsResponse, error) {
	var res inventory_dto.PendingFilterOptionsResponse

	couriersQuery := `SELECT id, name, is_sameday FROM expeditions ORDER BY name ASC`
	if err := r.db.SelectContext(ctx, &res.Expeditions, couriersQuery); err != nil {
		return res, err
	}

	shopsQuery := `SELECT DISTINCT shop_name FROM fulfilment_lists WHERE shop_name IS NOT NULL AND shop_name != '' AND status IN ('PENDING', 'VALIDATED')`
	if err := r.db.SelectContext(ctx, &res.Shops, shopsQuery); err != nil {
		return res, err
	}

	return res, nil
}

func (r *fulfilmentRepository) GetPendingItems(ctx context.Context, filter inventory_dto.PendingFulfilmentFilter) ([]inventory_dto.PendingFulfilmentItemResponse, int, error) {
	queryBuilder := `
		FROM fulfilment_list_items pli
		JOIN fulfilment_lists pl ON pli.fulfilment_list_id = pl.id
		LEFT JOIN products p ON pli.product_id = p.id
		LEFT JOIN locations loc_suggested ON pli.suggested_location_id = loc_suggested.id
		LEFT JOIN locations loc_picked ON pli.picked_from_location_id = loc_picked.id
		LEFT JOIN stock_locations sl ON sl.location_id = pli.suggested_location_id AND sl.product_id = pli.product_id
		LEFT JOIN expeditions e ON pl.expedition_id = e.id
		WHERE pl.status IN (?, ?, ?, ?, ?, ?, ?, ?)
		  AND pl.is_active = 1
	`
	args := []interface{}{"PENDING", "VALIDATED", "PICKED", "PACKED", "READY TO PICK", "READY TO CHECK", "READY TO PACK", "READY TO SHIP"}

	if filter.Role != "" && filter.Role != "All" {
		switch filter.Role {
		case "Pick":
			queryBuilder += ` AND pli.status IN (?, ?, ?, ?)`
			args = append(args, "PENDING", "BACKORDER", "READY TO PICK", "READY TO CHECK")
		case "Pack":
			queryBuilder += ` AND pli.status IN (?, ?, ?)`
			args = append(args, "PICKED", "VALIDATED", "READY TO PACK")
		case "Ship":
			queryBuilder += ` AND pli.status IN (?, ?)`
			args = append(args, "PACKED", "READY TO SHIP")
		}
	} else {
		queryBuilder += ` AND pli.status IN (?, ?, ?, ?, ?, ?, ?, ?, 'BACKORDER')`
		args = append(args, "PENDING", "NEW", "PICKED", "PACKED", "READY TO PICK", "READY TO CHECK", "READY TO PACK", "READY TO SHIP")
	}

	if filter.Search != "" {
		queryBuilder += ` AND (pl.original_invoice_id LIKE ? OR pli.original_sku LIKE ? OR p.name LIKE ? OR pl.customer_name LIKE ? OR pl.shop_name LIKE ?)`
		likeQuery := "%" + filter.Search + "%"
		args = append(args, likeQuery, likeQuery, likeQuery, likeQuery, likeQuery)
	}

	switch filter.SourceType {
		case "Offline":
			queryBuilder += ` AND (LOWER(pl.source) = 'offline' OR LOWER(pl.source) = 'manual')`
		case "Online":
			queryBuilder += ` AND (LOWER(pl.source) != 'offline' AND LOWER(pl.source) != 'manual')`
	}

	if len(filter.SourceInclude) > 0 {
		queryBuilder += ` AND pl.source IN (?)`
		args = append(args, filter.SourceInclude)
	}
	if len(filter.SourceExclude) > 0 {
		queryBuilder += ` AND pl.source NOT IN (?)`
		args = append(args, filter.SourceExclude)
	}

	if len(filter.ShopInclude) > 0 {
		queryBuilder += ` AND pl.shop_name IN (?)`
		args = append(args, filter.ShopInclude)
	}
	if len(filter.ShopExclude) > 0 {
		queryBuilder += ` AND pl.shop_name NOT IN (?)`
		args = append(args, filter.ShopExclude)
	}

	if len(filter.ExpeditionIDInclude) > 0 {
		queryBuilder += ` AND pl.expedition_id IN (?)`
		args = append(args, filter.ExpeditionIDInclude)
	}
	if len(filter.ExpeditionIDExclude) > 0 {
		queryBuilder += ` AND pl.expedition_id NOT IN (?)`
		args = append(args, filter.ExpeditionIDExclude)
	}

	if filter.IsSameday != nil {
		queryBuilder += ` AND e.is_sameday = ?`
		args = append(args, *filter.IsSameday)
	}

	if filter.IsBackorder != nil {
		if *filter.IsBackorder {
			queryBuilder += ` AND pl.id IN (SELECT fulfilment_list_id FROM fulfilment_list_items WHERE status = 'BACKORDER')`
		} else {
			queryBuilder += ` AND pl.id NOT IN (SELECT fulfilment_list_id FROM fulfilment_list_items WHERE status = 'BACKORDER')`
		}
	}

	if filter.StartDate != "" {
		queryBuilder += ` AND COALESCE(pl.created_at, pl.order_date) >= ?`
		args = append(args, filter.StartDate+" 00:00:00")
	}
	if filter.EndDate != "" {
		queryBuilder += ` AND COALESCE(pl.created_at, pl.order_date) <= ?`
		args = append(args, filter.EndDate+" 23:59:59")
	}

	countQuery := `SELECT COUNT(DISTINCT pl.id) ` + queryBuilder
	var total int
	countQuery, args, err := sqlx.In(countQuery, args...)
	if err != nil {
		return nil, 0, err
	}
	if err := r.db.GetContext(ctx, &total, r.db.Rebind(countQuery), args...); err != nil {
		return nil, 0, err
	}

	if total == 0 {
		return []inventory_dto.PendingFulfilmentItemResponse{}, 0, nil
	}

	listQuery := `SELECT DISTINCT pl.id ` + queryBuilder
	if filter.SortBy == "oldest" {
		listQuery += ` ORDER BY pl.id ASC` // Fallback sort since created_at is not in SELECT DISTINCT cleanly without group by
	} else {
		listQuery += ` ORDER BY pl.id DESC`
	}

	if filter.Limit > 0 {
		offset := (filter.Page - 1) * filter.Limit
		listQuery += ` LIMIT ? OFFSET ?`
		args = append(args, filter.Limit, offset)
	}

	listQuery, args, err = sqlx.In(listQuery, args...)
	if err != nil {
		return nil, 0, err
	}

	var listIDs []int
	if err := r.db.SelectContext(ctx, &listIDs, r.db.Rebind(listQuery), args...); err != nil {
		return nil, 0, err
	}

	if len(listIDs) == 0 {
		return []inventory_dto.PendingFulfilmentItemResponse{}, total, nil
	}

	dataQuery := `
		SELECT
			pli.id,
			pli.fulfilment_list_id,
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
			pl.invoice_no,
			pl.courier,
			pl.expedition_id,
			pl.awb,
			pl.kelja_histories,
			COALESCE(sl.quantity, 0) as available_stock
		FROM fulfilment_list_items pli
		JOIN fulfilment_lists pl ON pli.fulfilment_list_id = pl.id
		LEFT JOIN products p ON pli.product_id = p.id
		LEFT JOIN locations loc_suggested ON pli.suggested_location_id = loc_suggested.id
		LEFT JOIN locations loc_picked ON pli.picked_from_location_id = loc_picked.id
		LEFT JOIN stock_locations sl ON sl.location_id = pli.suggested_location_id AND sl.product_id = pli.product_id
		WHERE pl.id IN (?)
	`

	if filter.SortBy == "oldest" {
		dataQuery += ` ORDER BY pl.created_at ASC, location_code ASC`
	} else {
		dataQuery += ` ORDER BY pl.created_at DESC, location_code ASC`
	}

	dataQuery, dataArgs, err := sqlx.In(dataQuery, listIDs)
	if err != nil {
		return nil, 0, err
	}

	var items []inventory_dto.PendingFulfilmentItemResponse
	err = r.db.SelectContext(ctx, &items, r.db.Rebind(dataQuery), dataArgs...)
	return items, total, err
}

func (r *fulfilmentRepository) GetHistoryItems(ctx context.Context, limit int) ([]inventory_dto.HistoryFulfilmentItemResponse, error) {
	query := `
		SELECT
			pl.id as fulfilment_list_id, pl.original_invoice_id, pl.source, pl.status,
			pl.marketplace_status, pl.customer_name, pl.shop_name, pl.created_at, pl.order_date, pl.location_purpose,
			pl.invoice_no, pl.courier, pl.expedition_id, pl.awb, pl.kelja_histories,
			pli.id as item_id, pli.original_sku as sku, pli.quantity, pli.status as item_status,
			pli.return_condition, pli.return_notes,
			p.name as product_name
		FROM fulfilment_lists pl
		JOIN fulfilment_list_items pli ON pl.id = pli.fulfilment_list_id
		LEFT JOIN products p ON pli.product_id = p.id
		WHERE pl.status NOT IN (?, ?, ?, ?, ?, ?, ?, ?)
		ORDER BY pl.created_at DESC, pl.id DESC
		LIMIT ?
	`
	var items []inventory_dto.HistoryFulfilmentItemResponse
	err := r.db.SelectContext(ctx, &items, query, "PENDING", "READY TO PICK", "PICKED", "VALIDATED", "READY TO PACK", "PACKED", "READY TO SHIP", "BACKORDER", limit)
	return items, err
}

func (r *fulfilmentRepository) GetListDetails(ctx context.Context, fulfilmentListID int) ([]inventory_dto.FulfilmentListDetailResponse, error) {
	query := `
		SELECT
			pli.id,
			pli.original_sku as sku,
			pli.quantity as qty,
			p.name,
			pli.status,
			pli.return_condition,
			pli.return_notes
		FROM fulfilment_list_items pli
		JOIN products p ON pli.product_id = p.id
		WHERE pli.fulfilment_list_id = ?
	`
	var items []inventory_dto.FulfilmentListDetailResponse
	err := r.db.SelectContext(ctx, &items, query, fulfilmentListID)
	return items, err
}

func (r *fulfilmentRepository) GetHeaderByID(ctx context.Context, id int) (*domain.FulfilmentList, error) {
	query := `SELECT * FROM fulfilment_lists WHERE id = ? LIMIT 1`
	var header domain.FulfilmentList
	var err error
	ext := database.GetExt(ctx, r.db)
	err = ext.GetContext(ctx, &header, query, id)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	return &header, err
}

func (r *fulfilmentRepository) GetItemsByIDs(ctx context.Context, itemIDs []int) ([]domain.FulfilmentListItem, error) {
	ext := database.GetExt(ctx, r.db)
	if len(itemIDs) == 0 {
		return []domain.FulfilmentListItem{}, nil
	}
	query, args, err := sqlx.In(`SELECT * FROM fulfilment_list_items WHERE id IN (?)`, itemIDs)
	if err != nil {
		return nil, err
	}
	query = ext.Rebind(query)
	var items []domain.FulfilmentListItem
	err = ext.SelectContext(ctx, &items, query, args...)
	return items, err
}

func (r *fulfilmentRepository) CountPendingItems(ctx context.Context, fulfilmentListID int, statuses ...string) (int, error) {
	ext := database.GetExt(ctx, r.db)
	if len(statuses) == 0 {
		statuses = []string{"PENDING", "BACKORDER"} // fallback backward compat
	}
	query, args, err := sqlx.In(`SELECT count(*) FROM fulfilment_list_items WHERE fulfilment_list_id = ? AND status IN (?)`, fulfilmentListID, statuses)
	if err != nil {
		return 0, err
	}
	query = ext.Rebind(query)
	var count int
	err = ext.GetContext(ctx, &count, query, args...)
	return count, err
}

func (r *fulfilmentRepository) UpdateSuggestedLocation(ctx context.Context, itemID int, locationID *int) error {
	ext := database.GetExt(ctx, r.db)
	query := `UPDATE fulfilment_list_items SET suggested_location_id = ? WHERE id = ?`
	_, err := ext.ExecContext(ctx, query, locationID, itemID)
	return err
}

func (r *fulfilmentRepository) UpdateItemStatus(ctx context.Context, itemID int, status string) error {
	ext := database.GetExt(ctx, r.db)
	query := `UPDATE fulfilment_list_items SET status = ? WHERE id = ?`
	_, err := ext.ExecContext(ctx, query, status, itemID)
	return err
}

func (r *fulfilmentRepository) ValidateItem(ctx context.Context, itemID int, locationID int, status string) error {
	ext := database.GetExt(ctx, r.db)
	query := `UPDATE fulfilment_list_items SET status = ?, picked_from_location_id = ? WHERE id = ?`
	_, err := ext.ExecContext(ctx, query, status, locationID, itemID)
	return err
}

func (r *fulfilmentRepository) ValidateHeader(ctx context.Context, listID int, status string) error {
	ext := database.GetExt(ctx, r.db)
	query := `UPDATE fulfilment_lists SET status = ?, updated_at = NOW() WHERE id = ?`
	_, err := ext.ExecContext(ctx, query, status, listID)
	return err
}

func (r *fulfilmentRepository) UpdateHeaderStatus(ctx context.Context, listID int, status string) error {
	ext := database.GetExt(ctx, r.db)
	query := `UPDATE fulfilment_lists SET status = ?, updated_at = NOW() WHERE id = ?`
	_, err := ext.ExecContext(ctx, query, status, listID)
	return err
}

func (r *fulfilmentRepository) VoidHeader(ctx context.Context, listID int) (int64, error) {
	ext := database.GetExt(ctx, r.db)
	query := `UPDATE fulfilment_lists SET status = 'VOID', is_active = 0, updated_at = NOW() WHERE id = ? AND status != 'VOID'`
	res, err := ext.ExecContext(ctx, query, listID)
	if err != nil {
		return 0, err
	}
	return res.RowsAffected()
}

func (r *fulfilmentRepository) VoidItemsByListID(ctx context.Context, listID int) error {
	ext := database.GetExt(ctx, r.db)
	query := `UPDATE fulfilment_list_items SET status = 'VOID' WHERE fulfilment_list_id = ?`
	_, err := ext.ExecContext(ctx, query, listID)
	return err
}

func (r *fulfilmentRepository) GetItemsToRestock(ctx context.Context, listID int) ([]domain.FulfilmentListItem, error) {
	ext := database.GetExt(ctx, r.db)
	query := `
		SELECT * FROM fulfilment_list_items
		WHERE fulfilment_list_id = ? AND status = 'VALIDATED' AND picked_from_location_id IS NOT NULL
	`
	var items []domain.FulfilmentListItem
	err := ext.SelectContext(ctx, &items, query, listID)
	return items, err
}

func (r *fulfilmentRepository) GetUnfulfillableItems(ctx context.Context, listID int) ([]domain.FulfilmentListItem, error) {
	ext := database.GetExt(ctx, r.db)
	query := `
		SELECT pli.* FROM fulfilment_list_items pli
		WHERE pli.fulfilment_list_id = ?
		  AND (pli.status = 'BACKORDER' OR (pli.status = 'PENDING' AND pli.suggested_location_id IS NULL))
	`
	var items []domain.FulfilmentListItem
	err := ext.SelectContext(ctx, &items, query, listID)
	return items, err
}

func (r *fulfilmentRepository) GetUnfulfillableItemsByProductID(ctx context.Context, productID int) ([]domain.FulfilmentListItem, error) {
	ext := database.GetExt(ctx, r.db)
	query := `
		SELECT pli.* FROM fulfilment_list_items pli
		JOIN fulfilment_lists pl ON pli.fulfilment_list_id = pl.id
		WHERE pli.product_id = ?
		  AND (pli.status = 'BACKORDER' OR (pli.status = 'PENDING' AND pli.suggested_location_id IS NULL))
		  AND pl.status NOT IN ('COMPLETED', 'VOID')
		ORDER BY pl.created_at ASC
	`
	var items []domain.FulfilmentListItem
	err := ext.SelectContext(ctx, &items, query, productID)
	return items, err
}

func (r *fulfilmentRepository) GetPendingAndBackorderItems(ctx context.Context, listIDs []int) ([]domain.FulfilmentListItem, error) {
	ext := database.GetExt(ctx, r.db)
	if len(listIDs) == 0 {
		return []domain.FulfilmentListItem{}, nil
	}
	query, args, err := sqlx.In(`
		SELECT pli.* FROM fulfilment_list_items pli
		JOIN fulfilment_lists pl ON pli.fulfilment_list_id = pl.id
		WHERE pli.fulfilment_list_id IN (?)
		  AND pli.status IN ('PENDING', 'BACKORDER')
		  AND pl.status IN ('PENDING', 'VALIDATED')
		  AND pl.is_active = 1
	`, listIDs)
	if err != nil {
		return nil, err
	}
	query = ext.Rebind(query)
	var items []domain.FulfilmentListItem
	err = ext.SelectContext(ctx, &items, query, args...)
	return items, err
}

func (r *fulfilmentRepository) CreateFulfilmentListTx(ctx context.Context, header *domain.FulfilmentList) (int, error) {
	ext := database.GetExt(ctx, r.db)
	query := `
		INSERT INTO fulfilment_lists (user_id, original_invoice_id, source, status, is_active, customer_name, order_date, marketplace_status, location_purpose, shop_name, invoice_no, courier, expedition_id, awb, kelja_histories, kelja_id)
		VALUES (:user_id, :original_invoice_id, :source, :status, :is_active, :customer_name, :order_date, :marketplace_status, :location_purpose, :shop_name, :invoice_no, :courier, :expedition_id, :awb, :kelja_histories, :kelja_id)
	`
	res, err := ext.NamedExecContext(ctx, query, header)
	if err != nil {
		return 0, err
	}
	id, err := res.LastInsertId()
	return int(id), err
}

func (r *fulfilmentRepository) CreateFulfilmentListItemTx(ctx context.Context, item *domain.FulfilmentListItem) error {
	ext := database.GetExt(ctx, r.db)
	query := `
		INSERT INTO fulfilment_list_items (fulfilment_list_id, product_id, quantity, status, original_sku, price, suggested_location_id)
		VALUES (:fulfilment_list_id, :product_id, :quantity, :status, :original_sku, :price, :suggested_location_id)
	`
	_, err := ext.NamedExecContext(ctx, query, item)
	return err
}

func (r *fulfilmentRepository) ExistsByInvoiceNo(ctx context.Context, invoiceNo string) (bool, error) {
	query := `SELECT EXISTS(SELECT 1 FROM fulfilment_lists WHERE invoice_no = ? AND is_active = 1)`
	var exists bool
	err := r.db.GetContext(ctx, &exists, query, invoiceNo)
	return exists, err
}

func (r *fulfilmentRepository) UpdateKeljaIDByInvoiceNo(ctx context.Context, invoiceNo string, keljaID int) error {
	ext := database.GetExt(ctx, r.db)
	query := `UPDATE fulfilment_lists SET kelja_id = ? WHERE invoice_no = ? AND kelja_id IS NULL`
	_, err := ext.ExecContext(ctx, query, keljaID, invoiceNo)
	return err
}

func (r *fulfilmentRepository) GetListIDByKeljaIDOrInvoiceNo(ctx context.Context, keljaID int, invoiceNo string) (*int, error) {
	query := `SELECT id FROM fulfilment_lists WHERE kelja_id = ? OR invoice_no = ? LIMIT 1`
	var id int
	err := r.db.GetContext(ctx, &id, query, keljaID, invoiceNo)
	if err != nil {
		if err == sql.ErrNoRows {
			return nil, nil
		}
		return nil, err
	}
	return &id, nil
}

func (r *fulfilmentRepository) UpdateKeljaHistories(ctx context.Context, listID int, histories string) error {
	query := `UPDATE fulfilment_lists SET kelja_histories = ? WHERE id = ?`
	_, err := r.db.ExecContext(ctx, query, histories, listID)
	return err
}
