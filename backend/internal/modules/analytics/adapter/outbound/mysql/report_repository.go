package mysql

import (
	"context"
	"fmt"
	"strings"

	analytics_dto "github.com/dps-wmhris/backend/internal/modules/analytics/application/dto"
	analytics_port "github.com/dps-wmhris/backend/internal/modules/analytics/port"
	system_domain "github.com/dps-wmhris/backend/internal/modules/system/domain"
	"github.com/dps-wmhris/backend/internal/shared/database"

	"github.com/jmoiron/sqlx"
)

// ReportRepository is a compatibility alias for analytics/port.ReportRepository.
type ReportRepository = analytics_port.ReportRepository

type reportRepositoryImpl struct {
	db *sqlx.DB
}

// NewReportRepository constructs a MySQL-backed ReportRepository.
func NewReportRepository(db *sqlx.DB) ReportRepository {
	return &reportRepositoryImpl{db: db}
}

// GetDistinctBuildings returns all distinct non-empty buildings across active, non-deleted locations.
func (r *reportRepositoryImpl) GetDistinctBuildings(ctx context.Context) ([]string, error) {
	ext := database.GetExt(ctx, r.db)
	query := "SELECT DISTINCT building FROM locations WHERE is_active = 1 AND deleted_at IS NULL AND building IS NOT NULL AND building != '' ORDER BY building ASC"
	var buildings []string
	if err := ext.SelectContext(ctx, &buildings, query); err != nil {
		return nil, err
	}
	if buildings == nil {
		buildings = []string{}
	}
	return buildings, nil
}

// GetDistinctPurposes returns all distinct non-empty purposes across active, non-deleted locations.
func (r *reportRepositoryImpl) GetDistinctPurposes(ctx context.Context) ([]string, error) {
	ext := database.GetExt(ctx, r.db)
	query := "SELECT DISTINCT purpose FROM locations WHERE is_active = 1 AND deleted_at IS NULL AND purpose IS NOT NULL AND purpose != '' ORDER BY purpose ASC"
	var purposes []string
	if err := ext.SelectContext(ctx, &purposes, query); err != nil {
		return nil, err
	}
	if purposes == nil {
		purposes = []string{}
	}
	return purposes, nil
}

// GetBuildingPurposeRelations returns distinct purpose-to-building pairs for active, non-deleted locations.
func (r *reportRepositoryImpl) GetBuildingPurposeRelations(ctx context.Context) ([]map[string]any, error) {
	ext := database.GetExt(ctx, r.db)
	query := "SELECT DISTINCT purpose, building FROM locations WHERE is_active = 1 AND deleted_at IS NULL AND purpose IS NOT NULL AND building IS NOT NULL AND purpose != '' AND building != '' ORDER BY purpose ASC, building ASC"
	rows, err := ext.QueryxContext(ctx, query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	results := make([]map[string]any, 0)
	for rows.Next() {
		row := make(map[string]any)
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
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return results, nil
}

// GetUserExportJobs retrieves the 20 most recent export jobs requested by a user.
func (r *reportRepositoryImpl) GetUserExportJobs(ctx context.Context, userID int) ([]system_domain.ExportJob, error) {
	ext := database.GetExt(ctx, r.db)
	query := `
		SELECT id, user_id, job_type, status, file_path, error_message, created_at, filters
		FROM export_jobs
		WHERE user_id = ?
		ORDER BY created_at DESC
		LIMIT 20
	`
	var jobs []system_domain.ExportJob
	if err := ext.SelectContext(ctx, &jobs, query, userID); err != nil {
		return nil, err
	}
	if jobs == nil {
		jobs = []system_domain.ExportJob{}
	}
	return jobs, nil
}

// parseFilterSlice extracts include and exclude string slices from dynamic frontend filter shapes.
func parseFilterSlice(val any) ([]string, []string) {
	if val == nil {
		return nil, nil
	}

	var includes []string
	var excludes []string

	switch v := val.(type) {
	case string:
		if v != "all" && v != "" {
			includes = append(includes, v)
		}
	case []string:
		for _, s := range v {
			if s != "" {
				includes = append(includes, s)
			}
		}
	case []any:
		for _, item := range v {
			if s, ok := item.(string); ok && s != "" {
				includes = append(includes, s)
			}
		}
	case map[string]any:
		includes = append(includes, extractStringSlice(v["include"])...)
		excludes = append(excludes, extractStringSlice(v["exclude"])...)
	}

	return includes, excludes
}

func extractStringSlice(raw any) []string {
	var out []string
	switch items := raw.(type) {
	case []string:
		for _, s := range items {
			if s != "" {
				out = append(out, s)
			}
		}
	case []any:
		for _, item := range items {
			if s, ok := item.(string); ok && s != "" {
				out = append(out, s)
			}
		}
	}
	return out
}

func parseIsPackageFilter(val any) (int, bool) {
	switch v := val.(type) {
	case bool:
		if v {
			return 1, true
		}
		return 0, true
	case int:
		if v == 0 || v == 1 {
			return v, true
		}
	case int64:
		if v == 0 || v == 1 {
			return int(v), true
		}
	case float64:
		if v == 0 || v == 1 {
			return int(v), true
		}
	case string:
		switch strings.ToLower(strings.TrimSpace(v)) {
		case "1", "true":
			return 1, true
		case "0", "false":
			return 0, true
		}
	}
	return 0, false
}

// GetStockReportData queries active, non-deleted product stock rows filtered by status, building, purpose, search query, and package flag.
func (r *reportRepositoryImpl) GetStockReportData(ctx context.Context, filter analytics_dto.StockReportFilter) ([]analytics_dto.StockReportRow, error) {
	ext := database.GetExt(ctx, r.db)
	whereClauses := []string{
		"p.is_active = 1",
		"p.deleted_at IS NULL",
		"(l.id IS NULL OR l.deleted_at IS NULL)",
	}
	var queryParams []any

	switch filter.StockStatus {
	case "positive":
		whereClauses = append(whereClauses, "COALESCE(sl.quantity, 0) > 0")
	case "negative":
		whereClauses = append(whereClauses, "COALESCE(sl.quantity, 0) < 0")
	case "zero":
		whereClauses = append(whereClauses, "COALESCE(sl.quantity, 0) = 0")
	}

	incB, excB := parseFilterSlice(filter.Building)
	if len(incB) > 0 {
		query, args, err := sqlx.In("l.building IN (?)", incB)
		if err != nil {
			return nil, fmt.Errorf("failed to build building include filter: %w", err)
		}
		whereClauses = append(whereClauses, query)
		queryParams = append(queryParams, args...)
	}
	if len(excB) > 0 {
		query, args, err := sqlx.In("l.building NOT IN (?)", excB)
		if err != nil {
			return nil, fmt.Errorf("failed to build building exclude filter: %w", err)
		}
		whereClauses = append(whereClauses, query)
		queryParams = append(queryParams, args...)
	}

	incP, excP := parseFilterSlice(filter.Purpose)
	if len(incP) > 0 {
		query, args, err := sqlx.In("l.purpose IN (?)", incP)
		if err != nil {
			return nil, fmt.Errorf("failed to build purpose include filter: %w", err)
		}
		whereClauses = append(whereClauses, query)
		queryParams = append(queryParams, args...)
	}
	if len(excP) > 0 {
		query, args, err := sqlx.In("l.purpose NOT IN (?)", excP)
		if err != nil {
			return nil, fmt.Errorf("failed to build purpose exclude filter: %w", err)
		}
		whereClauses = append(whereClauses, query)
		queryParams = append(queryParams, args...)
	}

	if filter.SearchQuery != "" {
		whereClauses = append(whereClauses, "(p.sku LIKE ? OR p.name LIKE ?)")
		queryParams = append(queryParams, "%"+filter.SearchQuery+"%", "%"+filter.SearchQuery+"%")
	}

	if isPkg, ok := parseIsPackageFilter(filter.IsPackage); ok {
		whereClauses = append(whereClauses, "p.is_package = ?")
		queryParams = append(queryParams, isPkg)
	}

	finalQuery := fmt.Sprintf(`
		SELECT
			p.sku AS Sku,
			p.name AS NamaProduk,
			l.code AS Lokasi,
			COALESCE(sl.quantity, 0) AS Kuantitas,
			p.price AS HargaSatuan,
			(COALESCE(sl.quantity, 0) * p.price) AS TotalNilai
		FROM products p
		LEFT JOIN stock_locations sl ON p.id = sl.product_id
		LEFT JOIN locations l ON sl.location_id = l.id
		WHERE %s
		ORDER BY p.sku, l.code
	`, strings.Join(whereClauses, " AND "))

	finalQuery = ext.Rebind(finalQuery)

	var rows []analytics_dto.StockReportRow
	if err := ext.SelectContext(ctx, &rows, finalQuery, queryParams...); err != nil {
		return nil, err
	}
	if rows == nil {
		rows = []analytics_dto.StockReportRow{}
	}
	return rows, nil
}
