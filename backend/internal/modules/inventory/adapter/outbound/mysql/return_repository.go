package mysql

import (
	database "github.com/dps-wmhris/backend/internal/shared/database"

	"context"
	"fmt"
	"strings"

	"github.com/dps-wmhris/backend/internal/modules/inventory/domain"
	inventory_port "github.com/dps-wmhris/backend/internal/modules/inventory/port"

	"github.com/dps-wmhris/backend/internal/shared/utils"
	"github.com/jmoiron/sqlx"
)

type returnRepositoryImpl struct {
	db *sqlx.DB
}

func NewReturnRepository(db *sqlx.DB) inventory_port.ReturnRepository {
	return &returnRepositoryImpl{db: db}
}

func (r *returnRepositoryImpl) GetPendingReturns(ctx context.Context, params map[string]interface{}) ([]map[string]interface{}, int, error) {
	limit := params["limit"].(int)
	offset := params["offset"].(int)
	search := params["search"].(string)

	whereClauses := []string{"pli.status = ? AND pl.is_active = 1"}
	queryParams := []interface{}{"RETURNED"}

	if search != "" {
		whereClauses = append(whereClauses, "(pl.original_invoice_id LIKE ? OR p.name LIKE ? OR pli.original_sku LIKE ?)")
		searchVal := "%" + search + "%"
		queryParams = append(queryParams, searchVal, searchVal, searchVal)
	}

	whereClauseStr := strings.Join(whereClauses, " AND ")

	query := fmt.Sprintf(`
		SELECT SQL_CALC_FOUND_ROWS
			pli.id,
			pli.fulfilment_list_id,
			pli.product_id,
			pli.original_sku as sku,
			pli.quantity,
			p.name as product_name,
			p.price,
			pl.original_invoice_id,
			pl.source,
			pl.customer_name,
			pl.marketplace_status,
			pl.created_at as order_date
		FROM fulfilment_list_items pli
		JOIN fulfilment_lists pl ON pli.fulfilment_list_id = pl.id
		LEFT JOIN products p ON pli.product_id = p.id
		WHERE %s
		ORDER BY pl.created_at DESC
		LIMIT ? OFFSET ?
	`, whereClauseStr)

	queryParams = append(queryParams, limit, offset)

	rows, err := r.db.QueryxContext(ctx, query, queryParams...)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()

	var results []map[string]interface{}
	for rows.Next() {
		row := make(map[string]interface{})
		if err := rows.MapScan(row); err != nil {
			return nil, 0, err
		}
		for k, v := range row {
			if b, ok := v.([]byte); ok {
				row[k] = string(b)
			}
		}
		results = append(results, row)
	}

	var total int
	err = r.db.QueryRowContext(ctx, "SELECT FOUND_ROWS()").Scan(&total)
	if err != nil {
		return nil, 0, err
	}

	return results, total, nil
}

func (r *returnRepositoryImpl) GetMarketplaceReturnHistory(ctx context.Context, page, limit int, search string) (utils.PaginatedResult[domain.MarketplaceReturnItem], error) {
	whereClauses := []string{"pli.status = 'COMPLETED_RETURN'"}
	queryParams := []interface{}{}

	if search != "" {
		whereClauses = append(whereClauses, "(pl.original_invoice_id LIKE ? OR p.name LIKE ? OR pli.original_sku LIKE ?)")
		searchVal := "%" + search + "%"
		queryParams = append(queryParams, searchVal, searchVal, searchVal)
	}

	whereClauseStr := strings.Join(whereClauses, " AND ")

	query := fmt.Sprintf(`
		SELECT
			'MARKETPLACE' as type,
			pli.id,
			pl.original_invoice_id as reference,
			p.name as product_name,
			pli.original_sku as sku,
			pli.quantity,
			pli.return_condition as `+"`condition`"+`,
			pli.return_notes as notes,
			l.code as location_code,
			pl.updated_at as date,
			pl.source
		FROM fulfilment_list_items pli
		JOIN fulfilment_lists pl ON pli.fulfilment_list_id = pl.id
		JOIN products p ON pli.product_id = p.id
		LEFT JOIN locations l ON pli.confirmed_location_id = l.id
		WHERE %s
		ORDER BY pl.updated_at DESC
	`, whereClauseStr)

	return utils.FetchPaginated[domain.MarketplaceReturnItem](ctx, r.db, query, page, limit, queryParams...)
}

func (r *returnRepositoryImpl) GetManualReturnHistory(ctx context.Context, page, limit int, search string) (utils.PaginatedResult[domain.ManualReturnItem], error) {
	whereClauses := []string{"1=1"}
	queryParams := []interface{}{}

	if search != "" {
		whereClauses = append(whereClauses, "(mr.reference LIKE ? OR p.name LIKE ? OR p.sku LIKE ?)")
		searchVal := "%" + search + "%"
		queryParams = append(queryParams, searchVal, searchVal, searchVal)
	}

	whereClauseStr := strings.Join(whereClauses, " AND ")

	query := fmt.Sprintf(`
		SELECT
			'MANUAL' as type,
			mr.id,
			mr.reference,
			p.name as product_name,
			p.sku,
			mr.quantity,
			mr.`+"`condition`"+` as `+"`condition`"+`,
			mr.notes,
			mr.created_at as date,
			'MANUAL' as source
		FROM manual_returns mr
		JOIN products p ON mr.product_id = p.id
		WHERE %s
		ORDER BY mr.created_at DESC
	`, whereClauseStr)

	return utils.FetchPaginated[domain.ManualReturnItem](ctx, r.db, query, page, limit, queryParams...)
}

func (r *returnRepositoryImpl) GetFulfilmentItemById(ctx context.Context, id int) (*domain.FulfilmentListItem, error) {
	var item domain.FulfilmentListItem
	query := "SELECT * FROM fulfilment_list_items WHERE id = ?"
	ext := database.GetExt(ctx, r.db)
	err := ext.GetContext(ctx, &item, query, id)
	if err != nil {
		return nil, err
	}
	return &item, nil
}

func (r *returnRepositoryImpl) CompleteReturnItem(ctx context.Context, itemID int, condition string, notes string, locationID int) error {
	query := `
		UPDATE fulfilment_list_items
		SET
			status = 'COMPLETED_RETURN',
			return_condition = ?,
			return_notes = ?,
			confirmed_location_id = ?
		WHERE id = ?
	`
	ext := database.GetExt(ctx, r.db)
	_, err := ext.ExecContext(ctx, query, condition, notes, locationID, itemID)
	return err
}

func (r *returnRepositoryImpl) DecreaseItemQty(ctx context.Context, itemID int, qtyToDeduct int) error {
	query := "UPDATE fulfilment_list_items SET quantity = quantity - ? WHERE id = ?"
	ext := database.GetExt(ctx, r.db)
	_, err := ext.ExecContext(ctx, query, qtyToDeduct, itemID)
	return err
}

func (r *returnRepositoryImpl) CreateSplitReturnItem(ctx context.Context, originItem *domain.FulfilmentListItem, qtyReturn int, condition string, notes string, locationID int) (int, error) {
	query := `
		INSERT INTO fulfilment_list_items
			(fulfilment_list_id, product_id, original_sku, quantity, status, return_condition, return_notes, confirmed_location_id, suggested_location_id, picked_from_location_id)
		VALUES (?, ?, ?, ?, 'COMPLETED_RETURN', ?, ?, ?, ?, ?)
	`
	ext := database.GetExt(ctx, r.db)
	res, err := ext.ExecContext(ctx, query,
		originItem.FulfilmentListID,
		originItem.ProductID,
		originItem.OriginalSKU,
		qtyReturn,
		condition,
		notes,
		locationID,
		originItem.SuggestedLocationID,
		originItem.PickedFromLocationID,
	)
	if err != nil {
		return 0, err
	}

	id, err := res.LastInsertId()
	return int(id), err
}

func (r *returnRepositoryImpl) CreateManualReturn(ctx context.Context, manualReturn *domain.ManualReturn) error {
	query := `
		INSERT INTO manual_returns
			(user_id, product_id, quantity, ` + "`condition`" + `, reference, notes, status, created_at)
		VALUES (?, ?, ?, ?, ?, ?, 'APPROVED', NOW())
	`
	// Fallbacks for nullables
	var ref, notes interface{}
	if manualReturn.Reference != nil {
		ref = *manualReturn.Reference
	}
	if manualReturn.Notes != nil {
		notes = *manualReturn.Notes
	}

	ext := database.GetExt(ctx, r.db)
	res, err := ext.ExecContext(ctx, query,
		manualReturn.UserID,
		manualReturn.ProductID,
		manualReturn.Quantity,
		manualReturn.Condition,
		ref,
		notes,
	)
	if err != nil {
		return err
	}

	id, err := res.LastInsertId()
	if err == nil {
		manualReturn.ID = int(id)
	}
	return err
}
