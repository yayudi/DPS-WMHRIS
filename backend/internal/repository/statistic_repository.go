package repository

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"

	"github.com/dps-wmhris/backend/internal/dto"
	"github.com/jmoiron/sqlx"
)

type StatisticRepository interface {
	GetStockMovementStats(ctx context.Context, filters dto.StatisticFilterRequest) ([]dto.StockMovementSummaryResponse, error)
	GetMovementTimelineStats(ctx context.Context, filters dto.StatisticFilterRequest) ([]dto.StockMovementTimelineResponse, error)
	GetInventoryValueStats(ctx context.Context, filters dto.StatisticFilterRequest) ([]dto.InventoryValueResponse, error)
	GetShopPerformanceStats(ctx context.Context, filters dto.StatisticFilterRequest) ([]dto.ShopPerformanceSummary, error)
	GetDailySalesTrend(ctx context.Context, filters dto.StatisticFilterRequest) ([]dto.DailySalesTrend, error)
	GetTopSellingProducts(ctx context.Context, filters dto.StatisticFilterRequest, limit int) ([]dto.TopSellingProduct, error)
	GetFulfillmentHealth(ctx context.Context, filters dto.StatisticFilterRequest) ([]dto.FulfillmentHealth, error)
	GetPeriodComparison(ctx context.Context, filters dto.StatisticFilterRequest) ([]dto.PeriodComparison, error) // Returns rows that we aggregate
	GetPackageComponentAnalysis(ctx context.Context, filters dto.StatisticFilterRequest) ([]dto.PackageComponentDBRow, error)
	GetLocationLoads(ctx context.Context, filters dto.StatisticFilterRequest) ([]dto.LocationLoad, error)
	GetLocationCapacityDetails(ctx context.Context, locationId int, filters dto.StatisticFilterRequest) ([]dto.LocationCapacityDetailResponse, error)
	GetDuplicateLocations(ctx context.Context, filters dto.StatisticFilterRequest) ([]dto.DuplicateProductLocation, error)
}

type statisticRepositoryImpl struct {
	db *sqlx.DB
}

func NewStatisticRepository(db *sqlx.DB) StatisticRepository {
	return &statisticRepositoryImpl{db: db}
}

// buildStatisticTriStateWhere is a Go port of the Node.js helper to parse complex {"include": [], "exclude": []} queries
func buildStatisticTriStateWhere(field string, filter interface{}, queryParams *[]interface{}) []string {
	var clauses []string

	if filter == nil {
		return clauses
	}

	// Try to handle based on type
	switch v := filter.(type) {
	case string:
		if v == "" || v == "all" {
			return clauses
		}
		// Try to parse as JSON first
		var parsed map[string]interface{}
		err := json.Unmarshal([]byte(v), &parsed)
		if err == nil {
			// It is a JSON object {"include": [], "exclude": []}
			if inc, ok := parsed["include"]; ok {
				incSlice := toSliceOfStrings(inc)
				if len(incSlice) > 0 {
					qMarks := make([]string, len(incSlice))
					for i, s := range incSlice {
						qMarks[i] = "?"
						*queryParams = append(*queryParams, s)
					}
					clauses = append(clauses, fmt.Sprintf("%s IN (%s)", field, strings.Join(qMarks, ",")))
				}
			}
			if exc, ok := parsed["exclude"]; ok {
				excSlice := toSliceOfStrings(exc)
				if len(excSlice) > 0 {
					qMarks := make([]string, len(excSlice))
					for i, s := range excSlice {
						qMarks[i] = "?"
						*queryParams = append(*queryParams, s)
					}
					clauses = append(clauses, fmt.Sprintf("%s NOT IN (%s)", field, strings.Join(qMarks, ",")))
				}
			}
		} else {
			// Fallback: normal string equal
			clauses = append(clauses, fmt.Sprintf("%s = ?", field))
			*queryParams = append(*queryParams, v)
		}
	case []interface{}: // Can be direct slice
		sSlice := toSliceOfStrings(v)
		if len(sSlice) > 0 {
			qMarks := make([]string, len(sSlice))
			for i, s := range sSlice {
				qMarks[i] = "?"
				*queryParams = append(*queryParams, s)
			}
			clauses = append(clauses, fmt.Sprintf("%s IN (%s)", field, strings.Join(qMarks, ",")))
		}
	case map[string]interface{}: // If it was parsed dynamically already
		if inc, ok := v["include"]; ok {
			incSlice := toSliceOfStrings(inc)
			if len(incSlice) > 0 {
				qMarks := make([]string, len(incSlice))
				for i, s := range incSlice {
					qMarks[i] = "?"
					*queryParams = append(*queryParams, s)
				}
				clauses = append(clauses, fmt.Sprintf("%s IN (%s)", field, strings.Join(qMarks, ",")))
			}
		}
		if exc, ok := v["exclude"]; ok {
			excSlice := toSliceOfStrings(exc)
			if len(excSlice) > 0 {
				qMarks := make([]string, len(excSlice))
				for i, s := range excSlice {
					qMarks[i] = "?"
					*queryParams = append(*queryParams, s)
				}
				clauses = append(clauses, fmt.Sprintf("%s NOT IN (%s)", field, strings.Join(qMarks, ",")))
			}
		}
	}

	return clauses
}

// toSliceOfStrings safely converts various interface{} slice or string forms to []string
func toSliceOfStrings(val interface{}) []string {
	var result []string
	switch v := val.(type) {
	case string:
		// Sometime comma separated
		parts := strings.Split(v, ",")
		for _, p := range parts {
			if p != "" {
				result = append(result, p)
			}
		}
	case []interface{}:
		for _, item := range v {
			result = append(result, fmt.Sprintf("%v", item))
		}
	case []string:
		result = v
	}
	return result
}

func (r *statisticRepositoryImpl) GetStockMovementStats(ctx context.Context, filters dto.StatisticFilterRequest) ([]dto.StockMovementSummaryResponse, error) {
	queryParams := []interface{}{}
	locSubquery := `
		SELECT product_id, SUM(quantity) as current_stock
		FROM stock_locations
	`

	bClauses := buildStatisticTriStateWhere("l.building", filters.Building, &queryParams)
	if len(bClauses) > 0 {
		locSubquery = fmt.Sprintf(`
			SELECT sl.product_id, SUM(sl.quantity) as current_stock
			FROM stock_locations sl
			JOIN locations l ON sl.location_id = l.id
			WHERE %s
			GROUP BY sl.product_id
		`, strings.Join(bClauses, " AND "))
	} else {
		locSubquery += ` GROUP BY product_id`
	}

	movFilter := ""
	movParams := []interface{}{filters.StartDate, filters.EndDate}

	// Custom movement filter for buildings (both IN and OUT conditions)
	if filters.Building != "" && filters.Building != "all" {
		v := filters.Building
		// Parse as TriState
		var parsed map[string]interface{}
		if err := json.Unmarshal([]byte(v), &parsed); err == nil {
			incSlice := toSliceOfStrings(parsed["include"])
			if len(incSlice) > 0 {
				qMarks := strings.Repeat("?,", len(incSlice))
				qMarks = qMarks[:len(qMarks)-1]
				movFilter += fmt.Sprintf(`
					AND (
						(sm.movement_type = 'INBOUND' AND tl.building IN (%s))
						OR
						(sm.movement_type IN ('SALE', 'OUT') AND fl.building IN (%s))
					)
				`, qMarks, qMarks)
				for _, s := range incSlice {
					movParams = append(movParams, s)
				}
				for _, s := range incSlice {
					movParams = append(movParams, s)
				}
			}
			excSlice := toSliceOfStrings(parsed["exclude"])
			if len(excSlice) > 0 {
				qMarks := strings.Repeat("?,", len(excSlice))
				qMarks = qMarks[:len(qMarks)-1]
				movFilter += fmt.Sprintf(`
					AND (
						(sm.movement_type = 'INBOUND' AND (tl.building IS NULL OR tl.building NOT IN (%s)))
						OR
						(sm.movement_type IN ('SALE', 'OUT') AND (fl.building IS NULL OR fl.building NOT IN (%s)))
					)
				`, qMarks, qMarks)
				for _, s := range excSlice {
					movParams = append(movParams, s)
				}
				for _, s := range excSlice {
					movParams = append(movParams, s)
				}
			}
		} else {
			// Comma-separated or simple string
			incSlice := toSliceOfStrings(v)
			if len(incSlice) > 0 {
				qMarks := strings.Repeat("?,", len(incSlice))
				qMarks = qMarks[:len(qMarks)-1]
				movFilter += fmt.Sprintf(`
					AND (
						(sm.movement_type = 'INBOUND' AND tl.building IN (%s))
						OR
						(sm.movement_type IN ('SALE', 'OUT') AND fl.building IN (%s))
					)
				`, qMarks, qMarks)
				for _, s := range incSlice {
					movParams = append(movParams, s)
				}
				for _, s := range incSlice {
					movParams = append(movParams, s)
				}
			}
		}
	}

	query := fmt.Sprintf(`
		SELECT
			p.id as product_id,
			p.sku,
			p.name,
			p.is_active,
			IFNULL(s_loc.current_stock, 0) AS current_stock,
			IFNULL(s_mov.total_sold, 0) AS total_sold,
			IFNULL(s_mov.total_inbound, 0) AS total_inbound
		FROM products p
		LEFT JOIN (
			%s
		) s_loc ON p.id = s_loc.product_id
		LEFT JOIN (
			SELECT
				sm.product_id,
				SUM(CASE WHEN sm.movement_type IN ('SALE', 'OUT') THEN sm.quantity ELSE 0 END) AS total_sold,
				SUM(CASE WHEN sm.movement_type = 'INBOUND' THEN sm.quantity ELSE 0 END) AS total_inbound
			FROM stock_movements sm
			LEFT JOIN locations fl ON sm.from_location_id = fl.id
			LEFT JOIN locations tl ON sm.to_location_id = tl.id
			WHERE DATE(sm.created_at) >= ? AND DATE(sm.created_at) <= ?
			%s
			GROUP BY sm.product_id
		) s_mov ON p.id = s_mov.product_id
		WHERE p.is_package = 0
	`, locSubquery, movFilter)

	queryParams = append(queryParams, movParams...)

	if filters.SearchQuery != "" {
		query += ` AND (p.sku LIKE ? OR p.name LIKE ?)`
		likeTerm := "%" + filters.SearchQuery + "%"
		queryParams = append(queryParams, likeTerm, likeTerm)
	}

	cClauses := buildStatisticTriStateWhere("p.category_id", filters.CategoryId, &queryParams)
	if len(cClauses) > 0 {
		query += " AND " + strings.Join(cClauses, " AND ")
	}

	query += ` ORDER BY total_sold DESC`

	var rows []dto.StockMovementSummaryResponse
	err := r.db.SelectContext(ctx, &rows, query, queryParams...)
	return rows, err
}

func (r *statisticRepositoryImpl) GetMovementTimelineStats(ctx context.Context, filters dto.StatisticFilterRequest) ([]dto.StockMovementTimelineResponse, error) {
	queryParams := []interface{}{filters.StartDate, filters.EndDate}

	buildingFilter := ""
	if filters.Building != "" && filters.Building != "all" {
		v := filters.Building
		var parsed map[string]interface{}
		if err := json.Unmarshal([]byte(v), &parsed); err == nil {
			incSlice := toSliceOfStrings(parsed["include"])
			if len(incSlice) > 0 {
				qMarks := strings.Repeat("?,", len(incSlice))
				qMarks = qMarks[:len(qMarks)-1]
				buildingFilter += fmt.Sprintf(`
					AND (
						(sm.movement_type = 'INBOUND' AND tl.building IN (%s))
						OR
						(sm.movement_type IN ('SALE', 'OUT') AND fl.building IN (%s))
					)
				`, qMarks, qMarks)
				for _, s := range incSlice {
					queryParams = append(queryParams, s)
				}
				for _, s := range incSlice {
					queryParams = append(queryParams, s)
				}
			}
			excSlice := toSliceOfStrings(parsed["exclude"])
			if len(excSlice) > 0 {
				qMarks := strings.Repeat("?,", len(excSlice))
				qMarks = qMarks[:len(qMarks)-1]
				buildingFilter += fmt.Sprintf(`
					AND (
						(sm.movement_type = 'INBOUND' AND (tl.building IS NULL OR tl.building NOT IN (%s)))
						OR
						(sm.movement_type IN ('SALE', 'OUT') AND (fl.building IS NULL OR fl.building NOT IN (%s)))
					)
				`, qMarks, qMarks)
				for _, s := range excSlice {
					queryParams = append(queryParams, s)
				}
				for _, s := range excSlice {
					queryParams = append(queryParams, s)
				}
			}
		} else {
			incSlice := toSliceOfStrings(v)
			if len(incSlice) > 0 {
				qMarks := strings.Repeat("?,", len(incSlice))
				qMarks = qMarks[:len(qMarks)-1]
				buildingFilter += fmt.Sprintf(`
					AND (
						(sm.movement_type = 'INBOUND' AND tl.building IN (%s))
						OR
						(sm.movement_type IN ('SALE', 'OUT') AND fl.building IN (%s))
					)
				`, qMarks, qMarks)
				for _, s := range incSlice {
					queryParams = append(queryParams, s)
				}
				for _, s := range incSlice {
					queryParams = append(queryParams, s)
				}
			}
		}
	}

	searchJoin := ""
	searchFilter := ""

	if filters.SearchQuery != "" || (filters.CategoryId != "" && filters.CategoryId != "all") {
		searchJoin = "JOIN products p ON sm.product_id = p.id"
		if filters.SearchQuery != "" {
			searchFilter += " AND (p.sku LIKE ? OR p.name LIKE ?)"
			likeTerm := "%" + filters.SearchQuery + "%"
			queryParams = append(queryParams, likeTerm, likeTerm)
		}

		cClauses := buildStatisticTriStateWhere("p.category_id", filters.CategoryId, &queryParams)
		if len(cClauses) > 0 {
			searchFilter += " AND " + strings.Join(cClauses, " AND ")
		}
	}

	dateSelect := "DATE_FORMAT(sm.created_at, '%Y-%m-%d')"
	if filters.TimeResolution == "monthly" {
		dateSelect = "DATE_FORMAT(sm.created_at, '%Y-%m')"
	} else if filters.TimeResolution == "annual" {
		dateSelect = "DATE_FORMAT(sm.created_at, '%Y')"
	}

	query := fmt.Sprintf(`
		SELECT
			%s as date,
			SUM(CASE WHEN sm.movement_type IN ('SALE', 'OUT') THEN sm.quantity ELSE 0 END) AS total_out,
			SUM(CASE WHEN sm.movement_type = 'INBOUND' THEN sm.quantity ELSE 0 END) AS total_in
		FROM stock_movements sm
		LEFT JOIN locations fl ON sm.from_location_id = fl.id
		LEFT JOIN locations tl ON sm.to_location_id = tl.id
		%s
		WHERE DATE(sm.created_at) >= ? AND DATE(sm.created_at) <= ?
		%s
		%s
		GROUP BY %s
		ORDER BY date ASC
	`, dateSelect, searchJoin, buildingFilter, searchFilter, dateSelect)

	var rows []dto.StockMovementTimelineResponse
	err := r.db.SelectContext(ctx, &rows, query, queryParams...)
	return rows, err
}

func (r *statisticRepositoryImpl) GetInventoryValueStats(ctx context.Context, filters dto.StatisticFilterRequest) ([]dto.InventoryValueResponse, error) {
	whereClauses := []string{"p.is_active = 1"}
	var queryParams []interface{}

	if filters.StockStatus != "" {
		if filters.StockStatus != "all" {
			vStr := filters.StockStatus
			var parsed map[string]interface{}
			if err := json.Unmarshal([]byte(vStr), &parsed); err == nil {
				incSlice := toSliceOfStrings(parsed["include"])
				if len(incSlice) > 0 {
					var conds []string
					for _, st := range incSlice {
						if st == "positive" {
							conds = append(conds, "COALESCE(sl.quantity, 0) > 0")
						} else if st == "negative" {
							conds = append(conds, "COALESCE(sl.quantity, 0) < 0")
						} else if st == "zero" {
							conds = append(conds, "COALESCE(sl.quantity, 0) = 0")
						}
					}
					if len(conds) > 0 {
						whereClauses = append(whereClauses, fmt.Sprintf("(%s)", strings.Join(conds, " OR ")))
					}
				}
				excSlice := toSliceOfStrings(parsed["exclude"])
				if len(excSlice) > 0 {
					var conds []string
					for _, st := range excSlice {
						if st == "positive" {
							conds = append(conds, "COALESCE(sl.quantity, 0) <= 0")
						} else if st == "negative" {
							conds = append(conds, "COALESCE(sl.quantity, 0) >= 0")
						} else if st == "zero" {
							conds = append(conds, "COALESCE(sl.quantity, 0) != 0")
						}
					}
					if len(conds) > 0 {
						whereClauses = append(whereClauses, fmt.Sprintf("(%s)", strings.Join(conds, " AND ")))
					}
				}
			} else {
				// Simple string
				if vStr == "positive" {
					whereClauses = append(whereClauses, "COALESCE(sl.quantity, 0) > 0")
				} else if vStr == "negative" {
					whereClauses = append(whereClauses, "COALESCE(sl.quantity, 0) < 0")
				} else if vStr == "zero" {
					whereClauses = append(whereClauses, "COALESCE(sl.quantity, 0) = 0")
				}
			}
		}
	}

	bClauses := buildStatisticTriStateWhere("l.building", filters.Building, &queryParams)
	if len(bClauses) > 0 {
		whereClauses = append(whereClauses, bClauses...)
	}

	if filters.SearchQuery != "" {
		whereClauses = append(whereClauses, "(p.sku LIKE ? OR p.name LIKE ?)")
		likeTerm := "%" + filters.SearchQuery + "%"
		queryParams = append(queryParams, likeTerm, likeTerm)
	}

	pClauses := buildStatisticTriStateWhere("l.purpose", filters.Purpose, &queryParams)
	if len(pClauses) > 0 {
		whereClauses = append(whereClauses, pClauses...)
	}

	if filters.IsPackage != nil {
		whereClauses = append(whereClauses, "p.is_package = ?")
		queryParams = append(queryParams, *filters.IsPackage)
	}

	cClauses := buildStatisticTriStateWhere("p.category_id", filters.CategoryId, &queryParams)
	if len(cClauses) > 0 {
		whereClauses = append(whereClauses, cClauses...)
	}

	query := fmt.Sprintf(`
		SELECT
			p.id as product_id,
			p.sku,
			p.name,
			p.category_id,
			c.name as category,
			p.price,
			SUM(COALESCE(sl.quantity, 0)) AS total_quantity,
			(SUM(COALESCE(sl.quantity, 0)) * p.price) AS total_value
		FROM products p
		LEFT JOIN categories c ON p.category_id = c.id
		LEFT JOIN stock_locations sl ON p.id = sl.product_id
		LEFT JOIN locations l ON sl.location_id = l.id
		WHERE %s
		GROUP BY p.id, p.sku, p.name, p.category_id, c.name, p.price
		ORDER BY total_value DESC
	`, strings.Join(whereClauses, " AND "))

	var rows []dto.InventoryValueResponse
	err := r.db.SelectContext(ctx, &rows, query, queryParams...)
	return rows, err
}

func buildShopFilters(filters dto.StatisticFilterRequest, queryParams *[]interface{}) string {
	var clauses []string

	sourceClauses := buildStatisticTriStateWhere("pl.source", filters.Source, queryParams)
	if len(sourceClauses) > 0 {
		clauses = append(clauses, sourceClauses...)
	}

	shopClauses := buildStatisticTriStateWhere("pl.shop_name", filters.ShopName, queryParams)
	if len(shopClauses) > 0 {
		clauses = append(clauses, shopClauses...)
	}

	if len(clauses) > 0 {
		return " AND " + strings.Join(clauses, " AND ")
	}
	return ""
}

func (r *statisticRepositoryImpl) GetShopPerformanceStats(ctx context.Context, filters dto.StatisticFilterRequest) ([]dto.ShopPerformanceSummary, error) {
	queryParams := []interface{}{}
	filterSql := buildShopFilters(filters, &queryParams)

	query := fmt.Sprintf(`
		SELECT
			pl.source,
			COALESCE(pl.shop_name, 'Toko Tidak Diketahui') as shop_name,
			COUNT(DISTINCT pl.id) as total_orders,
			SUM(pli.quantity) as total_items_sold,
			SUM(pli.quantity * pli.price) as total_revenue
		FROM picking_lists pl
		JOIN picking_list_items pli ON pl.id = pli.picking_list_id
		WHERE pl.order_date >= ?
			AND pl.order_date <= ?
			AND pl.status NOT IN ('CANCEL', 'OBSOLETE')
			AND pl.is_active = 1
			%s
		GROUP BY pl.source, pl.shop_name
		ORDER BY total_revenue DESC
	`, filterSql)

	fullParams := append([]interface{}{filters.StartDate, filters.EndDate}, queryParams...)
	var rows []dto.ShopPerformanceSummary
	err := r.db.SelectContext(ctx, &rows, query, fullParams...)
	return rows, err
}

func (r *statisticRepositoryImpl) GetDailySalesTrend(ctx context.Context, filters dto.StatisticFilterRequest) ([]dto.DailySalesTrend, error) {
	queryParams := []interface{}{}
	filterSql := buildShopFilters(filters, &queryParams)

	query := fmt.Sprintf(`
		SELECT
			DATE(pl.order_date) as date,
			COUNT(DISTINCT pl.id) as total_orders,
			SUM(pli.quantity) as total_items_sold,
			SUM(pli.quantity * pli.price) as total_revenue
		FROM picking_lists pl
		JOIN picking_list_items pli ON pl.id = pli.picking_list_id
		WHERE pl.order_date >= ?
			AND pl.order_date <= ?
			AND pl.status NOT IN ('CANCEL', 'OBSOLETE')
			AND pl.is_active = 1
			%s
		GROUP BY DATE(pl.order_date)
		ORDER BY date ASC
	`, filterSql)

	fullParams := append([]interface{}{filters.StartDate, filters.EndDate}, queryParams...)
	var rows []dto.DailySalesTrend
	err := r.db.SelectContext(ctx, &rows, query, fullParams...)
	return rows, err
}

func (r *statisticRepositoryImpl) GetTopSellingProducts(ctx context.Context, filters dto.StatisticFilterRequest, limit int) ([]dto.TopSellingProduct, error) {
	queryParams := []interface{}{}
	filterSql := buildShopFilters(filters, &queryParams)

	query := fmt.Sprintf(`
		SELECT
			pl.source,
			COALESCE(pl.shop_name, 'Toko Tidak Diketahui') as shop_name,
			p.sku,
			p.name as product_name,
			SUM(pli.quantity) as total_sold,
			SUM(pli.quantity * pli.price) as revenue
		FROM picking_lists pl
		JOIN picking_list_items pli ON pl.id = pli.picking_list_id
		JOIN products p ON pli.product_id = p.id
		WHERE pl.order_date >= ?
			AND pl.order_date <= ?
			AND pl.status NOT IN ('CANCEL', 'OBSOLETE')
			AND pl.is_active = 1
			%s
		GROUP BY pl.source, pl.shop_name, p.id
		ORDER BY total_sold DESC
		LIMIT ?
	`, filterSql)

	fullParams := append([]interface{}{filters.StartDate, filters.EndDate}, queryParams...)
	fullParams = append(fullParams, limit)
	var rows []dto.TopSellingProduct
	err := r.db.SelectContext(ctx, &rows, query, fullParams...)
	return rows, err
}

func (r *statisticRepositoryImpl) GetFulfillmentHealth(ctx context.Context, filters dto.StatisticFilterRequest) ([]dto.FulfillmentHealth, error) {
	queryParams := []interface{}{}
	filterSql := buildShopFilters(filters, &queryParams)

	query := fmt.Sprintf(`
		SELECT
			pl.source,
			COALESCE(pl.shop_name, 'Toko Tidak Diketahui') as shop_name,
			COUNT(*) as total_orders,
			SUM(CASE WHEN pl.status IN ('COMPLETED', 'SHIPPED', 'PACKED') THEN 1 ELSE 0 END) as completed_orders,
			SUM(CASE WHEN pl.status = 'CANCEL' THEN 1 ELSE 0 END) as cancelled_orders,
			SUM(CASE WHEN pl.status = 'RETURNED' THEN 1 ELSE 0 END) as returned_orders,
			SUM(CASE WHEN pl.status = 'PENDING' THEN 1 ELSE 0 END) as pending_orders
		FROM picking_lists pl
		WHERE pl.order_date >= ?
			AND pl.order_date <= ?
			AND pl.is_active = 1
			%s
		GROUP BY pl.source, pl.shop_name
		ORDER BY total_orders DESC
	`, filterSql)

	fullParams := append([]interface{}{filters.StartDate, filters.EndDate}, queryParams...)
	var rows []dto.FulfillmentHealth
	err := r.db.SelectContext(ctx, &rows, query, fullParams...)
	return rows, err
}

func (r *statisticRepositoryImpl) GetPeriodComparison(ctx context.Context, filters dto.StatisticFilterRequest) ([]dto.PeriodComparison, error) {
	queryParams := []interface{}{}
	filterSql := buildShopFilters(filters, &queryParams)

	query := fmt.Sprintf(`
		SELECT
			CASE
				WHEN pl.order_date >= ? AND pl.order_date <= ? THEN 'current'
				WHEN pl.order_date >= ? AND pl.order_date <= ? THEN 'previous'
			END as period,
			COUNT(DISTINCT pl.id) as total_orders,
			SUM(pli.quantity) as total_items_sold,
			SUM(pli.quantity * pli.price) as total_revenue
		FROM picking_lists pl
		JOIN picking_list_items pli ON pl.id = pli.picking_list_id
		WHERE (
				(pl.order_date >= ? AND pl.order_date <= ?)
				OR (pl.order_date >= ? AND pl.order_date <= ?)
			)
			AND pl.status NOT IN ('CANCEL', 'OBSOLETE')
			AND pl.is_active = 1
			%s
		GROUP BY period
	`, filterSql)

	// Go translates row responses into a helper struct, we'll return two rows inside PeriodComparison (manually in service)
	// But actually for simplicity, we map directly to an anonymous struct here and return
	type row struct {
		Period         string  `db:"period"`
		TotalOrders    float64 `db:"total_orders"`
		TotalItemsSold float64 `db:"total_items_sold"`
		TotalRevenue   float64 `db:"total_revenue"`
	}

	fullParams := []interface{}{
		filters.StartDate, filters.EndDate,
		filters.PrevStartDate, filters.PrevEndDate,
		filters.StartDate, filters.EndDate,
		filters.PrevStartDate, filters.PrevEndDate,
	}
	fullParams = append(fullParams, queryParams...)

	var rawRows []row
	err := r.db.SelectContext(ctx, &rawRows, query, fullParams...)
	if err != nil {
		return nil, err
	}

	var comp dto.PeriodComparison
	for _, r := range rawRows {
		if r.Period == "current" {
			comp.Current.TotalOrders = r.TotalOrders
			comp.Current.TotalItemsSold = r.TotalItemsSold
			comp.Current.TotalRevenue = r.TotalRevenue
		} else if r.Period == "previous" {
			comp.Previous.TotalOrders = r.TotalOrders
			comp.Previous.TotalItemsSold = r.TotalItemsSold
			comp.Previous.TotalRevenue = r.TotalRevenue
		}
	}
	return []dto.PeriodComparison{comp}, nil // service expects one but we return as slice to match interface or simply return one
}

func (r *statisticRepositoryImpl) GetPackageComponentAnalysis(ctx context.Context, filters dto.StatisticFilterRequest) ([]dto.PackageComponentDBRow, error) {
	queryParams := []interface{}{filters.StartDate, filters.EndDate}
	searchFilter := ""

	if filters.SearchQuery != "" {
		searchFilter = " AND (cp.sku LIKE ? OR cp.name LIKE ?)"
		likeTerm := "%" + filters.SearchQuery + "%"
		queryParams = append(queryParams, likeTerm, likeTerm)
	}

	cClauses := buildStatisticTriStateWhere("cp.category_id", filters.CategoryId, &queryParams)
	if len(cClauses) > 0 {
		searchFilter += " AND " + strings.Join(cClauses, " AND ")
	}

	query := fmt.Sprintf(`
		SELECT
			cp.id as component_product_id,
			cp.sku as component_sku,
			cp.name as component_name,
			cp.category_id as component_category_id,
			COALESCE((SELECT SUM(quantity) FROM stock_locations WHERE product_id = cp.id), 0) as current_stock,
			pp.sku as package_sku,
			pp.name as package_name,
			pp.category_id as package_category_id,
			COALESCE(s_mov.comp_needed, 0) / pc.quantity_per_package as sold,
			pc.quantity_per_package as qty_per_package,
			COALESCE(s_mov.comp_needed, 0) as subtotal_needed
		FROM products cp
		JOIN package_components pc ON cp.id = pc.component_product_id
		JOIN products pp ON pc.package_product_id = pp.id
		LEFT JOIN (
				SELECT pli.original_sku, pli.product_id, SUM(pli.quantity) as comp_needed
				FROM picking_list_items pli
				JOIN picking_lists pl ON pli.picking_list_id = pl.id
				WHERE pl.status NOT IN ('CANCEL', 'OBSOLETE')
					AND pl.is_active = 1
					AND COALESCE(DATE(pl.order_date), DATE(pl.created_at)) >= ?
					AND COALESCE(DATE(pl.order_date), DATE(pl.created_at)) <= ?
				GROUP BY pli.original_sku, pli.product_id
		) s_mov ON pp.sku = s_mov.original_sku AND cp.id = s_mov.product_id
		WHERE cp.is_package = 0 AND pp.is_active = 1
		%s
		HAVING subtotal_needed > 0
		ORDER BY cp.id, subtotal_needed DESC
	`, searchFilter)

	var rows []dto.PackageComponentDBRow
	err := r.db.SelectContext(ctx, &rows, query, queryParams...)
	return rows, err
}

func (r *statisticRepositoryImpl) GetLocationLoads(ctx context.Context, filters dto.StatisticFilterRequest) ([]dto.LocationLoad, error) {
	queryParams := []interface{}{}
	whereClauses := []string{"l.is_active = 1"}

	bClauses := buildStatisticTriStateWhere("l.building", filters.Building, &queryParams)
	if len(bClauses) > 0 {
		whereClauses = append(whereClauses, bClauses...)
	}

	fClauses := buildStatisticTriStateWhere("l.floor", filters.Floor, &queryParams)
	if len(fClauses) > 0 {
		whereClauses = append(whereClauses, fClauses...)
	}

	pClauses := buildStatisticTriStateWhere("l.purpose", filters.Purpose, &queryParams)
	if len(pClauses) > 0 {
		whereClauses = append(whereClauses, pClauses...)
	}

	if filters.CategoryId != "" {
		cClauses := buildStatisticTriStateWhere("p.category_id", filters.CategoryId, &queryParams)
		if len(cClauses) > 0 {
			whereClauses = append(whereClauses, cClauses...)
		}
	}

	if filters.SearchQuery != "" {
		searchLike := "%" + filters.SearchQuery + "%"
		whereClauses = append(whereClauses, "(p.name LIKE ? OR p.sku LIKE ?)")
		queryParams = append(queryParams, searchLike, searchLike)
	}

	filterSql := ""
	if len(whereClauses) > 0 {
		filterSql = "WHERE " + strings.Join(whereClauses, " AND ")
	}

	query := fmt.Sprintf(`
		SELECT 
			l.id as location_id,
			l.code,
			l.name,
			l.building,
			l.floor,
			l.purpose,
			COUNT(DISTINCT sl.product_id) as total_products,
			COALESCE(SUM(sl.quantity), 0) as total_quantity,
			COALESCE(SUM(sl.quantity * COALESCE(p.weight, 0)), 0) as total_weight,
			COALESCE(SUM(sl.quantity * (COALESCE(p.length, 0) * COALESCE(p.width, 0) * COALESCE(p.height, 0))) / 1000000, 0) as total_cbm
		FROM locations l
		LEFT JOIN stock_locations sl ON l.id = sl.location_id
		LEFT JOIN products p ON sl.product_id = p.id
		%s
		GROUP BY l.id
		ORDER BY l.building ASC, l.floor ASC, l.code ASC
	`, filterSql)

	var rows []dto.LocationLoad
	err := r.db.SelectContext(ctx, &rows, query, queryParams...)
	return rows, err
}

func (r *statisticRepositoryImpl) GetDuplicateLocations(ctx context.Context, filters dto.StatisticFilterRequest) ([]dto.DuplicateProductLocation, error) {
	queryParams := []interface{}{}
	whereClauses := []string{"l.is_active = 1", "sl.quantity > 0"}

	bClauses := buildStatisticTriStateWhere("l.building", filters.Building, &queryParams)
	if len(bClauses) > 0 {
		whereClauses = append(whereClauses, bClauses...)
	}

	fClauses := buildStatisticTriStateWhere("l.floor", filters.Floor, &queryParams)
	if len(fClauses) > 0 {
		whereClauses = append(whereClauses, fClauses...)
	}

	pClauses := buildStatisticTriStateWhere("l.purpose", filters.Purpose, &queryParams)
	if len(pClauses) > 0 {
		whereClauses = append(whereClauses, pClauses...)
	}

	filterSql := ""
	if len(whereClauses) > 0 {
		filterSql = "WHERE " + strings.Join(whereClauses, " AND ")
	}

	query := fmt.Sprintf(`
		SELECT
			p.id as product_id,
			p.sku,
			p.name,
			l.purpose,
			COUNT(DISTINCT sl.location_id) as location_count,
			GROUP_CONCAT(DISTINCT l.code ORDER BY l.code ASC SEPARATOR ', ') as location_codes
		FROM products p
		JOIN stock_locations sl ON p.id = sl.product_id
		JOIN locations l ON sl.location_id = l.id
		%s
		GROUP BY p.id, l.purpose
		HAVING location_count > 1
		ORDER BY location_count DESC, p.sku ASC
	`, filterSql)

	var rows []dto.DuplicateProductLocation
	err := r.db.SelectContext(ctx, &rows, query, queryParams...)
	return rows, err
}

func (r *statisticRepositoryImpl) GetLocationCapacityDetails(ctx context.Context, locationId int, filters dto.StatisticFilterRequest) ([]dto.LocationCapacityDetailResponse, error) {
	queryParams := []interface{}{locationId}
	whereClauses := []string{"sl.location_id = ?"}

	if filters.CategoryId != "" {
		cClauses := buildStatisticTriStateWhere("p.category_id", filters.CategoryId, &queryParams)
		if len(cClauses) > 0 {
			whereClauses = append(whereClauses, cClauses...)
		}
	}

	if filters.SearchQuery != "" {
		searchLike := "%" + filters.SearchQuery + "%"
		whereClauses = append(whereClauses, "(p.name LIKE ? OR p.sku LIKE ?)")
		queryParams = append(queryParams, searchLike, searchLike)
	}

	filterSql := ""
	if len(whereClauses) > 0 {
		filterSql = "WHERE " + strings.Join(whereClauses, " AND ")
	}

	query := fmt.Sprintf(`
		SELECT
			p.id as product_id,
			p.sku,
			p.name,
			p.category_id,
			COALESCE(c.name, '-') as category_name,
			COALESCE(SUM(sl.quantity), 0) as quantity,
			COALESCE(SUM(sl.quantity * COALESCE(p.weight, 0)), 0) / 1000 as total_weight,
			COALESCE(SUM(sl.quantity * (COALESCE(p.length, 0) * COALESCE(p.width, 0) * COALESCE(p.height, 0))) / 1000000, 0) as total_cbm
		FROM products p
		JOIN stock_locations sl ON p.id = sl.product_id
		LEFT JOIN categories c ON p.category_id = c.id
		%s
		GROUP BY p.id
		ORDER BY p.sku ASC
	`, filterSql)

	var rows []dto.LocationCapacityDetailResponse
	err := r.db.SelectContext(ctx, &rows, query, queryParams...)
	if rows == nil {
		rows = []dto.LocationCapacityDetailResponse{}
	}
	return rows, err
}
