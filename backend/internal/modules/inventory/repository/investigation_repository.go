package repository

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"

	inventory_model "github.com/dps-wmhris/backend/internal/modules/inventory/model"

	"github.com/dps-wmhris/backend/internal/dto"
	"github.com/jmoiron/sqlx"
)

type InvestigationRepository interface {
	GetDuplicateGroups(ctx context.Context, req dto.GetDuplicateTransactionsRequest) ([]inventory_model.DuplicateTransactionItem, error)
	CountDuplicateGroups(ctx context.Context, req dto.GetDuplicateTransactionsRequest) (int, error)
	FindPickingListDetailsByInvoices(ctx context.Context, invoiceIds []string) ([]map[string]interface{}, error)
	FindPickingListDetailsByItemIds(ctx context.Context, itemIds []int) ([]map[string]interface{}, error)
}

type investigationRepositoryImpl struct {
	db *sqlx.DB
}

func NewInvestigationRepository(db *sqlx.DB) InvestigationRepository {
	return &investigationRepositoryImpl{db: db}
}

// buildDuplicateQueryHelper builds the common CTEs and WHERE/HAVING clauses
func buildDuplicateQueryHelper(req dto.GetDuplicateTransactionsRequest) (string, string, string, []interface{}, []interface{}) {
	var params []interface{}
	conditions := []string{"sm.notes IS NOT NULL", "sm.notes != ''"}

	if req.StartDate != "" && req.EndDate != "" {
		conditions = append(conditions, "DATE(sm.created_at) BETWEEN ? AND ?")
		params = append(params, req.StartDate, req.EndDate)
	} else if req.StartDate != "" {
		conditions = append(conditions, "DATE(sm.created_at) >= ?")
		params = append(params, req.StartDate)
	}

	if req.MovementType != nil && *req.MovementType != "" {
		var mvTypeObj struct {
			Include []string `json:"include"`
			Exclude []string `json:"exclude"`
		}
		err := json.Unmarshal([]byte(*req.MovementType), &mvTypeObj)
		if err == nil && (len(mvTypeObj.Include) > 0 || len(mvTypeObj.Exclude) > 0) {
			if len(mvTypeObj.Include) > 0 {
				placeholders := make([]string, len(mvTypeObj.Include))
				for i, v := range mvTypeObj.Include {
					placeholders[i] = "?"
					params = append(params, v)
				}
				conditions = append(conditions, fmt.Sprintf("sm.movement_type IN (%s)", strings.Join(placeholders, ",")))
			}
			if len(mvTypeObj.Exclude) > 0 {
				placeholders := make([]string, len(mvTypeObj.Exclude))
				for i, v := range mvTypeObj.Exclude {
					placeholders[i] = "?"
					params = append(params, v)
				}
				conditions = append(conditions, fmt.Sprintf("sm.movement_type NOT IN (%s)", strings.Join(placeholders, ",")))
			}
		} else {
			// it's just a string
			conditions = append(conditions, "sm.movement_type = ?")
			params = append(params, *req.MovementType)
		}
	}

	if req.IncludeNotes != "" {
		conditions = append(conditions, "sm.notes REGEXP ?")
		params = append(params, req.IncludeNotes)
	}
	if req.ExcludeNotes != "" {
		conditions = append(conditions, "sm.notes NOT REGEXP ?")
		params = append(params, req.ExcludeNotes)
	}

	if req.ProductName != "" {
		conditions = append(conditions, "(p.name LIKE ? OR p.sku LIKE ?)")
		searchVal := "%" + req.ProductName + "%"
		params = append(params, searchVal, searchVal)
	}
	if req.Username != "" {
		conditions = append(conditions, "u.username LIKE ?")
		params = append(params, "%"+req.Username+"%")
	}
	if req.Location != "" {
		conditions = append(conditions, "(fl.code LIKE ? OR tl.code LIKE ?)")
		params = append(params, "%"+req.Location+"%", "%"+req.Location+"%")
	}

	whereClause := ""
	if len(conditions) > 0 {
		whereClause = "WHERE " + strings.Join(conditions, " AND ")
	}

	var havingParams []interface{}
	havingConditions := []string{}

	if req.MinOccurrences != nil {
		havingConditions = append(havingConditions, "occurrences >= ?")
		havingParams = append(havingParams, *req.MinOccurrences)
	}
	if req.MaxOccurrences != nil {
		havingConditions = append(havingConditions, "occurrences <= ?")
		havingParams = append(havingParams, *req.MaxOccurrences)
	}
	if req.MinSku != nil {
		havingConditions = append(havingConditions, "total_sku >= ?")
		havingParams = append(havingParams, *req.MinSku)
	}
	if req.MaxSku != nil {
		havingConditions = append(havingConditions, "total_sku <= ?")
		havingParams = append(havingParams, *req.MaxSku)
	}
	if req.MaxTimeGap != nil {
		havingConditions = append(havingConditions, "TIMESTAMPDIFF(MINUTE, MIN(fm.created_at), MAX(fm.created_at)) <= ?")
		havingParams = append(havingParams, *req.MaxTimeGap)
	}

	havingClause := ""
	if len(havingConditions) > 0 {
		havingClause = "HAVING " + strings.Join(havingConditions, " AND ")
	}

	exactQuantityClause := ""
	if req.ExactQuantity == "true" {
		exactQuantityClause = ", quantity"
	}
	exactQuantityJoinClause := ""
	if req.ExactQuantity == "true" {
		exactQuantityJoinClause = "AND dp.quantity = fm.quantity"
	}

	revertStatusClause := ""
	if req.RevertStatus == "REVERTED" {
		revertStatusClause = "AND SUM(CASE WHEN notes LIKE '%[REVERTED]%' THEN 1 ELSE 0 END) > 0"
	} else if req.RevertStatus == "NOT_REVERTED" {
		revertStatusClause = "AND SUM(CASE WHEN notes LIKE '%[REVERTED]%' THEN 1 ELSE 0 END) = 0"
	}

	cte := fmt.Sprintf(`
		WITH filtered_movements AS (
			SELECT 
				sm.id, sm.product_id, sm.quantity, sm.from_location_id, sm.to_location_id, sm.movement_type, sm.user_id, sm.notes, sm.created_at,
				p.name as product_name, p.sku, 
				u.username, 
				fl.code as from_location_code, 
				tl.code as to_location_code
			FROM stock_movements sm
			LEFT JOIN products p ON sm.product_id = p.id
			LEFT JOIN users u ON sm.user_id = u.id
			LEFT JOIN locations fl ON sm.from_location_id = fl.id
			LEFT JOIN locations tl ON sm.to_location_id = tl.id
			%s
		),
		duplicate_products AS (
			SELECT 
				SUBSTRING_INDEX(notes, ' (Item', 1) as base_note, 
				product_id, 
				movement_type
				%s
			FROM filtered_movements
			GROUP BY base_note, product_id, movement_type %s
			HAVING COUNT(*) > 1
			%s
		)
	`, whereClause, exactQuantityClause, exactQuantityClause, revertStatusClause)

	return cte, havingClause, exactQuantityJoinClause, params, havingParams
}

func (r *investigationRepositoryImpl) GetDuplicateGroups(ctx context.Context, req dto.GetDuplicateTransactionsRequest) ([]inventory_model.DuplicateTransactionItem, error) {
	cte, havingClause, exactQuantityJoinClause, params, havingParams := buildDuplicateQueryHelper(req)

	orderCol := "latest_created_at"
	if req.SortBy == "OCCURRENCES" {
		orderCol = "occurrences"
	} else if req.SortBy == "TOTAL_SKU" {
		orderCol = "total_sku"
	} else if req.SortBy == "TOTAL_QTY" {
		orderCol = "total_qty"
	}

	sortDir := "DESC"
	if strings.ToUpper(req.SortDirection) == "ASC" {
		sortDir = "ASC"
	}

	orderByClause := fmt.Sprintf("ORDER BY %s %s, base_note ASC", orderCol, sortDir)
	offset := (req.Page - 1) * req.Limit

	query := fmt.Sprintf(`
		%s,
		duplicate_groups AS (
			SELECT 
				dp.base_note,
				dp.movement_type,
				COUNT(DISTINCT fm.product_id) as total_sku,
				COUNT(DISTINCT fm.created_at) as occurrences,
				SUM(fm.quantity) as total_qty,
				MAX(fm.created_at) as latest_created_at
			FROM duplicate_products dp
			JOIN filtered_movements fm 
				ON dp.base_note = SUBSTRING_INDEX(fm.notes, ' (Item', 1)
				AND dp.product_id = fm.product_id
				AND dp.movement_type = fm.movement_type
				%s
			GROUP BY dp.base_note, dp.movement_type
			%s
			%s
			LIMIT ? OFFSET ?
		)
		SELECT 
			fm.id,
			fm.product_id,
			fm.quantity,
			fm.from_location_id,
			fm.from_location_code,
			fm.to_location_id,
			fm.to_location_code,
			fm.movement_type,
			fm.user_id,
			fm.username,
			fm.notes,
			fm.created_at,
			fm.sku,
			fm.product_name
		FROM filtered_movements fm
		JOIN duplicate_products dp 
			ON SUBSTRING_INDEX(fm.notes, ' (Item', 1) = dp.base_note 
			AND fm.product_id = dp.product_id 
			AND fm.movement_type = dp.movement_type
			%s
		JOIN duplicate_groups dg 
			ON dp.base_note = dg.base_note 
			AND dp.movement_type = dg.movement_type
		ORDER BY dg.%s %s, SUBSTRING_INDEX(fm.notes, ' (Item', 1) ASC, fm.created_at DESC
	`, cte, exactQuantityJoinClause, havingClause, orderByClause, exactQuantityJoinClause, orderCol, sortDir)

	finalParams := append(params, havingParams...)
	finalParams = append(finalParams, req.Limit, offset)

	var results []inventory_model.DuplicateTransactionItem
	err := r.db.SelectContext(ctx, &results, query, finalParams...)
	return results, err
}

func (r *investigationRepositoryImpl) CountDuplicateGroups(ctx context.Context, req dto.GetDuplicateTransactionsRequest) (int, error) {
	cte, havingClause, exactQuantityJoinClause, params, havingParams := buildDuplicateQueryHelper(req)

	query := fmt.Sprintf(`
		%s,
		duplicate_groups AS (
			SELECT 
				COUNT(DISTINCT fm.product_id) as total_sku,
				COUNT(DISTINCT fm.created_at) as occurrences
			FROM duplicate_products dp
			JOIN filtered_movements fm 
				ON dp.base_note = SUBSTRING_INDEX(fm.notes, ' (Item', 1)
				AND dp.product_id = fm.product_id
				AND dp.movement_type = fm.movement_type
				%s
			GROUP BY dp.base_note, dp.movement_type
			%s
		)
		SELECT COUNT(*) as total FROM duplicate_groups
	`, cte, exactQuantityJoinClause, havingClause)

	finalParams := append(params, havingParams...)
	var total int
	err := r.db.QueryRowContext(ctx, query, finalParams...).Scan(&total)
	return total, err
}

func (r *investigationRepositoryImpl) FindPickingListDetailsByInvoices(ctx context.Context, invoiceIds []string) ([]map[string]interface{}, error) {
	if len(invoiceIds) == 0 {
		return nil, nil
	}
	query, args, err := sqlx.In(`
		SELECT 
			pl.id as picking_list_id,
			pl.original_invoice_id,
			pl.customer_name,
			pl.source,
			pl.created_at as order_date,
			pl.status as list_status,
			pl.marketplace_status,
			pl.shop_name,
			pli.id as item_id,
			pli.product_id,
			pli.original_sku,
			pli.quantity,
			pli.price,
			pli.status as item_status,
			p.name as product_name
		FROM picking_lists pl
		JOIN picking_list_items pli ON pl.id = pli.picking_list_id
		LEFT JOIN products p ON pli.product_id = p.id
		WHERE pl.original_invoice_id IN (?)
	`, invoiceIds)
	if err != nil {
		return nil, err
	}
	query = r.db.Rebind(query)

	rows, err := r.db.QueryxContext(ctx, query, args...)
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
		for k, v := range row {
			if b, ok := v.([]byte); ok {
				row[k] = string(b)
			}
		}
		results = append(results, row)
	}
	return results, nil
}

func (r *investigationRepositoryImpl) FindPickingListDetailsByItemIds(ctx context.Context, itemIds []int) ([]map[string]interface{}, error) {
	if len(itemIds) == 0 {
		return nil, nil
	}
	query, args, err := sqlx.In(`
		SELECT 
			pl.id as picking_list_id,
			pl.original_invoice_id,
			pl.customer_name,
			pl.source,
			pl.created_at as order_date,
			pl.status as list_status,
			pl.marketplace_status,
			pl.shop_name,
			pli.id as item_id,
			pli.product_id,
			pli.original_sku,
			pli.quantity,
			pli.price,
			pli.status as item_status,
			p.name as product_name
		FROM picking_lists pl
		JOIN picking_list_items pli ON pl.id = pli.picking_list_id
		LEFT JOIN products p ON pli.product_id = p.id
		WHERE pl.id IN (
			SELECT picking_list_id FROM picking_list_items WHERE id IN (?)
		)
	`, itemIds)
	if err != nil {
		return nil, err
	}
	query = r.db.Rebind(query)

	rows, err := r.db.QueryxContext(ctx, query, args...)
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
		for k, v := range row {
			if b, ok := v.([]byte); ok {
				row[k] = string(b)
			}
		}
		results = append(results, row)
	}
	return results, nil
}
