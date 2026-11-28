package mysql

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"

	analytics_dto "github.com/dps-wmhris/backend/internal/modules/analytics/application/dto"
	analytics_port "github.com/dps-wmhris/backend/internal/modules/analytics/port"
	"github.com/dps-wmhris/backend/internal/shared/database"

	"github.com/jmoiron/sqlx"
)

// StatisticRepository is a compatibility alias for analytics/port.StatisticRepository.
type StatisticRepository = analytics_port.StatisticRepository

type statisticRepositoryImpl struct {
	db *sqlx.DB
}

// NewStatisticRepository constructs a MySQL-backed StatisticRepository.
func NewStatisticRepository(db *sqlx.DB) StatisticRepository {
	return &statisticRepositoryImpl{db: db}
}

// buildStatisticTriStateWhere parses tri-state {"include": [], "exclude": []}, slice, or scalar filters into parameterized SQL clauses.
func buildStatisticTriStateWhere(field string, filter any, queryParams *[]any) []string {
	var clauses []string

	if filter == nil {
		return clauses
	}

	appendInClause := func(op string, values []string) {
		if len(values) == 0 {
			return
		}
		qMarks := make([]string, len(values))
		for i, s := range values {
			qMarks[i] = "?"
			*queryParams = append(*queryParams, s)
		}
		clauses = append(clauses, fmt.Sprintf("%s %s (%s)", field, op, strings.Join(qMarks, ",")))
	}

	switch v := filter.(type) {
	case string:
		if v == "" || v == "all" {
			return clauses
		}
		var parsed map[string]any
		if err := json.Unmarshal([]byte(v), &parsed); err == nil {
			if inc, ok := parsed["include"]; ok {
				appendInClause("IN", toSliceOfStrings(inc))
			}
			if exc, ok := parsed["exclude"]; ok {
				appendInClause("NOT IN", toSliceOfStrings(exc))
			}
		} else {
			clauses = append(clauses, fmt.Sprintf("%s = ?", field))
			*queryParams = append(*queryParams, v)
		}
	case []any:
		appendInClause("IN", toSliceOfStrings(v))
	case []string:
		appendInClause("IN", v)
	case map[string]any:
		if inc, ok := v["include"]; ok {
			appendInClause("IN", toSliceOfStrings(inc))
		}
		if exc, ok := v["exclude"]; ok {
			appendInClause("NOT IN", toSliceOfStrings(exc))
		}
	}

	return clauses
}

// toSliceOfStrings safely converts dynamic slice or comma-separated string inputs into []string.
func toSliceOfStrings(val any) []string {
	var result []string
	switch v := val.(type) {
	case string:
		parts := strings.Split(v, ",")
		for _, p := range parts {
			if trimmed := strings.TrimSpace(p); trimmed != "" {
				result = append(result, trimmed)
			}
		}
	case []any:
		for _, item := range v {
			if s := strings.TrimSpace(fmt.Sprintf("%v", item)); s != "" {
				result = append(result, s)
			}
		}
	case []string:
		for _, s := range v {
			if trimmed := strings.TrimSpace(s); trimmed != "" {
				result = append(result, trimmed)
			}
		}
	}
	return result
}

func buildMovementBuildingFilter(building string, params *[]any) string {
	if building == "" || building == "all" {
		return ""
	}

	var clause strings.Builder
	appendInclude := func(values []string) {
		if len(values) == 0 {
			return
		}
		qMarks := strings.TrimSuffix(strings.Repeat("?,", len(values)), ",")
		clause.WriteString(fmt.Sprintf(`
					AND (
						(sm.movement_type = 'INBOUND' AND tl.building IN (%s))
						OR
						(sm.movement_type IN ('SALE', 'OUT') AND fl.building IN (%s))
					)
				`, qMarks, qMarks))
		for _, s := range values {
			*params = append(*params, s)
		}
		for _, s := range values {
			*params = append(*params, s)
		}
	}
	appendExclude := func(values []string) {
		if len(values) == 0 {
			return
		}
		qMarks := strings.TrimSuffix(strings.Repeat("?,", len(values)), ",")
		clause.WriteString(fmt.Sprintf(`
					AND (
						(sm.movement_type = 'INBOUND' AND (tl.building IS NULL OR tl.building NOT IN (%s)))
						OR
						(sm.movement_type IN ('SALE', 'OUT') AND (fl.building IS NULL OR fl.building NOT IN (%s)))
					)
				`, qMarks, qMarks))
		for _, s := range values {
			*params = append(*params, s)
		}
		for _, s := range values {
			*params = append(*params, s)
		}
	}

	var parsed map[string]any
	if err := json.Unmarshal([]byte(building), &parsed); err == nil {
		appendInclude(toSliceOfStrings(parsed["include"]))
		appendExclude(toSliceOfStrings(parsed["exclude"]))
	} else {
		appendInclude(toSliceOfStrings(building))
	}

	return clause.String()
}

// buildCreatedAtRangeWhere constructs optional SARGable timestamp bounds so MySQL can use idx_sm_created_at
// without requiring hardcoded sentinel dates when callers omit startDate or endDate.
func buildCreatedAtRangeWhere(column, startDate, endDate string, params *[]any) string {
	var clauses []string
	if start := strings.TrimSpace(startDate); start != "" {
		clauses = append(clauses, fmt.Sprintf("%s >= ?", column))
		*params = append(*params, start)
	}
	if end := strings.TrimSpace(endDate); end != "" {
		clauses = append(clauses, fmt.Sprintf("%s <= CONCAT(?, ' 23:59:59')", column))
		*params = append(*params, end)
	}
	if len(clauses) == 0 {
		return "1=1"
	}
	return strings.Join(clauses, " AND ")
}

// GetStockMovementStats returns per-SKU current stock, outbound volume, and inbound volume within the requested date window.
func (r *statisticRepositoryImpl) GetStockMovementStats(ctx context.Context, filters analytics_dto.StatisticFilterRequest) ([]analytics_dto.StockMovementSummaryResponse, error) {
	ext := database.GetExt(ctx, r.db)
	queryParams := []any{}
	locWhere := []string{"l.deleted_at IS NULL"}

	bClauses := buildStatisticTriStateWhere("l.building", filters.Building, &queryParams)
	if len(bClauses) > 0 {
		locWhere = append(locWhere, bClauses...)
	}

	locSubquery := fmt.Sprintf(`
		SELECT sl.product_id, SUM(sl.quantity) AS current_stock
		FROM stock_locations sl
		JOIN locations l ON sl.location_id = l.id
		WHERE %s
		GROUP BY sl.product_id
	`, strings.Join(locWhere, " AND "))

	movParams := []any{}
	dateWhere := buildCreatedAtRangeWhere("sm.created_at", filters.StartDate, filters.EndDate, &movParams)
	movFilter := buildMovementBuildingFilter(filters.Building, &movParams)

	query := fmt.Sprintf(`
		SELECT
			p.id AS product_id,
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
			WHERE %s
			%s
			GROUP BY sm.product_id
		) s_mov ON p.id = s_mov.product_id
		WHERE p.is_package = 0 AND p.deleted_at IS NULL
	`, locSubquery, dateWhere, movFilter)

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

	var rows []analytics_dto.StockMovementSummaryResponse
	if err := ext.SelectContext(ctx, &rows, query, queryParams...); err != nil {
		return nil, err
	}
	if rows == nil {
		rows = []analytics_dto.StockMovementSummaryResponse{}
	}
	return rows, nil
}

// GetMovementTimelineStats aggregates inbound and outbound volumes grouped by daily, monthly, or annual buckets.
func (r *statisticRepositoryImpl) GetMovementTimelineStats(ctx context.Context, filters analytics_dto.StatisticFilterRequest) ([]analytics_dto.StockMovementTimelineResponse, error) {
	ext := database.GetExt(ctx, r.db)
	queryParams := []any{}
	dateWhere := buildCreatedAtRangeWhere("sm.created_at", filters.StartDate, filters.EndDate, &queryParams)
	buildingFilter := buildMovementBuildingFilter(filters.Building, &queryParams)

	searchJoin := ""
	searchFilter := ""
	if filters.SearchQuery != "" || (filters.CategoryId != "" && filters.CategoryId != "all") {
		searchJoin = "JOIN products p ON sm.product_id = p.id"
		searchFilter = " AND p.deleted_at IS NULL"
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
			%s AS date,
			SUM(CASE WHEN sm.movement_type IN ('SALE', 'OUT') THEN sm.quantity ELSE 0 END) AS total_out,
			SUM(CASE WHEN sm.movement_type = 'INBOUND' THEN sm.quantity ELSE 0 END) AS total_in
		FROM stock_movements sm
		LEFT JOIN locations fl ON sm.from_location_id = fl.id
		LEFT JOIN locations tl ON sm.to_location_id = tl.id
		%s
		WHERE %s
		%s
		%s
		GROUP BY %s
		ORDER BY date ASC
	`, dateSelect, searchJoin, dateWhere, buildingFilter, searchFilter, dateSelect)

	var rows []analytics_dto.StockMovementTimelineResponse
	if err := ext.SelectContext(ctx, &rows, query, queryParams...); err != nil {
		return nil, err
	}
	if rows == nil {
		rows = []analytics_dto.StockMovementTimelineResponse{}
	}
	return rows, nil
}

// GetInventoryValueStats computes active inventory quantities and monetary valuation per non-deleted product.
func (r *statisticRepositoryImpl) GetInventoryValueStats(ctx context.Context, filters analytics_dto.StatisticFilterRequest) ([]analytics_dto.InventoryValueResponse, error) {
	ext := database.GetExt(ctx, r.db)
	whereClauses := []string{
		"p.is_active = 1",
		"p.deleted_at IS NULL",
		"(l.id IS NULL OR l.deleted_at IS NULL)",
	}
	var queryParams []any

	if filters.StockStatus != "" && filters.StockStatus != "all" {
		vStr := filters.StockStatus
		var parsed map[string]any
		if err := json.Unmarshal([]byte(vStr), &parsed); err == nil {
			incSlice := toSliceOfStrings(parsed["include"])
			if len(incSlice) > 0 {
				var conds []string
				for _, st := range incSlice {
					switch st {
					case "positive":
						conds = append(conds, "COALESCE(sl.quantity, 0) > 0")
					case "negative":
						conds = append(conds, "COALESCE(sl.quantity, 0) < 0")
					case "zero":
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
					switch st {
					case "positive":
						conds = append(conds, "COALESCE(sl.quantity, 0) <= 0")
					case "negative":
						conds = append(conds, "COALESCE(sl.quantity, 0) >= 0")
					case "zero":
						conds = append(conds, "COALESCE(sl.quantity, 0) != 0")
					}
				}
				if len(conds) > 0 {
					whereClauses = append(whereClauses, fmt.Sprintf("(%s)", strings.Join(conds, " AND ")))
				}
			}
		} else {
			switch vStr {
			case "positive":
				whereClauses = append(whereClauses, "COALESCE(sl.quantity, 0) > 0")
			case "negative":
				whereClauses = append(whereClauses, "COALESCE(sl.quantity, 0) < 0")
			case "zero":
				whereClauses = append(whereClauses, "COALESCE(sl.quantity, 0) = 0")
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
			p.id AS product_id,
			p.sku,
			p.name,
			NULLIF(p.category_id, '') AS category_id,
			c.name AS category,
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

	var rows []analytics_dto.InventoryValueResponse
	if err := ext.SelectContext(ctx, &rows, query, queryParams...); err != nil {
		return nil, err
	}
	if rows == nil {
		rows = []analytics_dto.InventoryValueResponse{}
	}
	return rows, nil
}

// GetShopPerformanceStats returns shop performance summaries (currently disabled pending sales domain migration).
func (r *statisticRepositoryImpl) GetShopPerformanceStats(ctx context.Context, filters analytics_dto.StatisticFilterRequest) ([]analytics_dto.ShopPerformanceSummary, error) {
	return []analytics_dto.ShopPerformanceSummary{}, nil
}

// GetDailySalesTrend returns daily sales trends (currently disabled pending sales domain migration).
func (r *statisticRepositoryImpl) GetDailySalesTrend(ctx context.Context, filters analytics_dto.StatisticFilterRequest) ([]analytics_dto.DailySalesTrend, error) {
	return []analytics_dto.DailySalesTrend{}, nil
}

// GetTopSellingProducts returns top selling products (currently disabled pending sales domain migration).
func (r *statisticRepositoryImpl) GetTopSellingProducts(ctx context.Context, filters analytics_dto.StatisticFilterRequest, limit int) ([]analytics_dto.TopSellingProduct, error) {
	return []analytics_dto.TopSellingProduct{}, nil
}

// GetFulfillmentHealth returns fulfillment health metrics (currently disabled pending sales domain migration).
func (r *statisticRepositoryImpl) GetFulfillmentHealth(ctx context.Context, filters analytics_dto.StatisticFilterRequest) ([]analytics_dto.FulfillmentHealth, error) {
	return []analytics_dto.FulfillmentHealth{}, nil
}

// GetPeriodComparison returns period-over-period sales metrics (currently disabled pending sales domain migration).
func (r *statisticRepositoryImpl) GetPeriodComparison(ctx context.Context, filters analytics_dto.StatisticFilterRequest) ([]analytics_dto.PeriodComparison, error) {
	return []analytics_dto.PeriodComparison{}, nil
}

// GetPackageComponentAnalysis returns package component sales rows (currently disabled pending sales domain migration).
func (r *statisticRepositoryImpl) GetPackageComponentAnalysis(ctx context.Context, filters analytics_dto.StatisticFilterRequest) ([]analytics_dto.PackageComponentDBRow, error) {
	return []analytics_dto.PackageComponentDBRow{}, nil
}

// GetLocationLoads aggregates product count, stock quantity, total weight, and total CBM across active, non-deleted locations.
func (r *statisticRepositoryImpl) GetLocationLoads(ctx context.Context, filters analytics_dto.StatisticFilterRequest) ([]analytics_dto.LocationLoad, error) {
	ext := database.GetExt(ctx, r.db)
	queryParams := []any{}
	whereClauses := []string{"l.is_active = 1", "l.deleted_at IS NULL"}

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

	filterSQL := "WHERE " + strings.Join(whereClauses, " AND ")

	query := fmt.Sprintf(`
		SELECT
			l.id AS location_id,
			l.code,
			COALESCE(l.name, '') AS name,
			l.building,
			l.floor,
			l.purpose,
			COUNT(DISTINCT CASE WHEN p.id IS NOT NULL THEN sl.product_id END) AS total_products,
			COALESCE(SUM(CASE WHEN p.id IS NOT NULL THEN sl.quantity ELSE 0 END), 0) AS total_quantity,
			COALESCE(SUM((CASE WHEN p.id IS NOT NULL AND sl.quantity > 0 THEN sl.quantity ELSE 0 END) * COALESCE(p.weight, 0)), 0) AS total_weight,
			COALESCE(SUM((CASE WHEN p.id IS NOT NULL AND sl.quantity > 0 THEN sl.quantity ELSE 0 END) * (COALESCE(p.length, 0) * COALESCE(p.width, 0) * COALESCE(p.height, 0))) / 1000000, 0) AS total_cbm
		FROM locations l
		LEFT JOIN stock_locations sl ON l.id = sl.location_id
		LEFT JOIN products p ON sl.product_id = p.id AND p.deleted_at IS NULL
		%s
		GROUP BY l.id
		ORDER BY l.building ASC, l.floor ASC, l.code ASC
	`, filterSQL)

	var rows []analytics_dto.LocationLoad
	if err := ext.SelectContext(ctx, &rows, query, queryParams...); err != nil {
		return nil, err
	}
	if rows == nil {
		rows = []analytics_dto.LocationLoad{}
	}
	return rows, nil
}

// GetDuplicateLocations identifies active, non-deleted SKUs stored in multiple active locations sharing the same purpose.
func (r *statisticRepositoryImpl) GetDuplicateLocations(ctx context.Context, filters analytics_dto.StatisticFilterRequest) ([]analytics_dto.DuplicateProductLocation, error) {
	ext := database.GetExt(ctx, r.db)
	queryParams := []any{}
	whereClauses := []string{
		"p.is_active = 1",
		"p.deleted_at IS NULL",
		"l.is_active = 1",
		"l.deleted_at IS NULL",
		"sl.quantity > 0",
	}

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

	filterSQL := "WHERE " + strings.Join(whereClauses, " AND ")

	query := fmt.Sprintf(`
		SELECT
			p.id AS product_id,
			p.sku,
			p.name,
			l.purpose,
			COUNT(DISTINCT sl.location_id) AS location_count,
			GROUP_CONCAT(DISTINCT l.code ORDER BY l.code ASC SEPARATOR ', ') AS location_codes
		FROM products p
		JOIN stock_locations sl ON p.id = sl.product_id
		JOIN locations l ON sl.location_id = l.id
		%s
		GROUP BY p.id, l.purpose
		HAVING location_count > 1
		ORDER BY location_count DESC, p.sku ASC
	`, filterSQL)

	var rows []analytics_dto.DuplicateProductLocation
	if err := ext.SelectContext(ctx, &rows, query, queryParams...); err != nil {
		return nil, err
	}
	if rows == nil {
		rows = []analytics_dto.DuplicateProductLocation{}
	}
	return rows, nil
}

// GetLocationCapacityDetails returns per-SKU quantity, weight (kg), and CBM stored at a specific location.
func (r *statisticRepositoryImpl) GetLocationCapacityDetails(ctx context.Context, locationID int, filters analytics_dto.StatisticFilterRequest) ([]analytics_dto.LocationCapacityDetailResponse, error) {
	ext := database.GetExt(ctx, r.db)
	queryParams := []any{locationID}
	whereClauses := []string{"sl.location_id = ?", "p.deleted_at IS NULL"}

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

	filterSQL := "WHERE " + strings.Join(whereClauses, " AND ")

	query := fmt.Sprintf(`
		SELECT
			p.id AS product_id,
			p.sku,
			p.name,
			COALESCE(CAST(NULLIF(p.category_id, '') AS UNSIGNED), 0) AS category_id,
			COALESCE(c.name, '-') AS category_name,
			COALESCE(SUM(sl.quantity), 0) AS quantity,
			COALESCE(SUM((CASE WHEN sl.quantity > 0 THEN sl.quantity ELSE 0 END) * COALESCE(p.weight, 0)), 0) / 1000 AS total_weight,
			COALESCE(SUM((CASE WHEN sl.quantity > 0 THEN sl.quantity ELSE 0 END) * (COALESCE(p.length, 0) * COALESCE(p.width, 0) * COALESCE(p.height, 0))) / 1000000, 0) AS total_cbm
		FROM products p
		JOIN stock_locations sl ON p.id = sl.product_id
		LEFT JOIN categories c ON p.category_id = c.id
		%s
		GROUP BY p.id
		ORDER BY p.sku ASC
	`, filterSQL)

	var rows []analytics_dto.LocationCapacityDetailResponse
	if err := ext.SelectContext(ctx, &rows, query, queryParams...); err != nil {
		return nil, err
	}
	if rows == nil {
		rows = []analytics_dto.LocationCapacityDetailResponse{}
	}
	return rows, nil
}

// GetStockBuildingBreakdown returns stock distribution and movement totals per building for a single product.
func (r *statisticRepositoryImpl) GetStockBuildingBreakdown(ctx context.Context, productID int, startDate, endDate string) ([]analytics_dto.StockBuildingBreakdownResponse, error) {
	ext := database.GetExt(ctx, r.db)
	query := `
		SELECT
			b.building,
			COALESCE(s_loc.current_stock, 0) AS current_stock,
			COALESCE(s_out.total_out, 0) AS total_out,
			COALESCE(s_in.total_inbound, 0) AS total_inbound
		FROM (
			SELECT DISTINCT l.building
			FROM stock_locations sl
			JOIN locations l ON sl.location_id = l.id
			WHERE sl.product_id = ? AND l.deleted_at IS NULL
			UNION
			SELECT DISTINCT COALESCE(fl.building, tl.building) AS building
			FROM stock_movements sm
			LEFT JOIN locations fl ON sm.from_location_id = fl.id
			LEFT JOIN locations tl ON sm.to_location_id = tl.id
			WHERE sm.product_id = ?
				AND sm.created_at >= ? AND sm.created_at <= CONCAT(?, ' 23:59:59')
		) b
		LEFT JOIN (
			SELECT l.building, SUM(sl.quantity) AS current_stock
			FROM stock_locations sl
			JOIN locations l ON sl.location_id = l.id
			WHERE sl.product_id = ? AND l.deleted_at IS NULL
			GROUP BY l.building
		) s_loc ON b.building = s_loc.building
		LEFT JOIN (
			SELECT fl.building, SUM(sm.quantity) AS total_out
			FROM stock_movements sm
			JOIN locations fl ON sm.from_location_id = fl.id
			WHERE sm.product_id = ?
				AND sm.movement_type IN ('SALE', 'OUT')
				AND sm.created_at >= ? AND sm.created_at <= CONCAT(?, ' 23:59:59')
			GROUP BY fl.building
		) s_out ON b.building = s_out.building
		LEFT JOIN (
			SELECT tl.building, SUM(sm.quantity) AS total_inbound
			FROM stock_movements sm
			JOIN locations tl ON sm.to_location_id = tl.id
			WHERE sm.product_id = ?
				AND sm.movement_type = 'INBOUND'
				AND sm.created_at >= ? AND sm.created_at <= CONCAT(?, ' 23:59:59')
			GROUP BY tl.building
		) s_in ON b.building = s_in.building
		WHERE b.building IS NOT NULL AND b.building != ''
		ORDER BY b.building ASC
	`

	params := []any{
		productID,                     // buildings from stock_locations
		productID, startDate, endDate, // buildings from stock_movements
		productID,                     // s_loc subquery
		productID, startDate, endDate, // s_out subquery
		productID, startDate, endDate, // s_in subquery
	}

	var rows []analytics_dto.StockBuildingBreakdownResponse
	if err := ext.SelectContext(ctx, &rows, query, params...); err != nil {
		return nil, err
	}
	if rows == nil {
		rows = []analytics_dto.StockBuildingBreakdownResponse{}
	}
	return rows, nil
}
