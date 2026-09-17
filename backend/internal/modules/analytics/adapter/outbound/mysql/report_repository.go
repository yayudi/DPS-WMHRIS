package mysql

import (
	"context"
	"fmt"
	"strings"

	analytics_dto "github.com/dps-wmhris/backend/internal/modules/analytics/application/dto"
	system_domain "github.com/dps-wmhris/backend/internal/modules/system/domain"

	"github.com/jmoiron/sqlx"
)

type ReportRepository interface {
	GetDistinctBuildings(ctx context.Context) ([]string, error)
	GetDistinctPurposes(ctx context.Context) ([]string, error)
	GetBuildingPurposeRelations(ctx context.Context) ([]map[string]interface{}, error)
	GetUserExportJobs(ctx context.Context, userID int) ([]system_domain.ExportJob, error)
	GetStockReportData(ctx context.Context, filter analytics_dto.StockReportFilter) ([]analytics_dto.StockReportRow, error)
}

type reportRepositoryImpl struct {
	db *sqlx.DB
}

func NewReportRepository(db *sqlx.DB) ReportRepository {
	return &reportRepositoryImpl{db: db}
}

func (r *reportRepositoryImpl) GetDistinctBuildings(ctx context.Context) ([]string, error) {
	query := "SELECT DISTINCT building FROM locations WHERE building IS NOT NULL AND building != '' ORDER BY building ASC"
	var buildings []string
	err := r.db.SelectContext(ctx, &buildings, query)
	return buildings, err
}

func (r *reportRepositoryImpl) GetDistinctPurposes(ctx context.Context) ([]string, error) {
	query := "SELECT DISTINCT purpose FROM locations WHERE purpose IS NOT NULL AND purpose != '' ORDER BY purpose ASC"
	var purposes []string
	err := r.db.SelectContext(ctx, &purposes, query)
	return purposes, err
}

func (r *reportRepositoryImpl) GetBuildingPurposeRelations(ctx context.Context) ([]map[string]interface{}, error) {
	query := "SELECT DISTINCT purpose, building FROM locations WHERE purpose IS NOT NULL AND building IS NOT NULL AND purpose != '' AND building != ''"
	rows, err := r.db.QueryxContext(ctx, query)
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
		// Convert byte slices to strings
		for k, v := range row {
			if b, ok := v.([]byte); ok {
				row[k] = string(b)
			}
		}
		results = append(results, row)
	}
	return results, nil
}

func (r *reportRepositoryImpl) GetUserExportJobs(ctx context.Context, userID int) ([]system_domain.ExportJob, error) {
	query := `
		SELECT id, status, file_path, error_message, created_at, filters
		FROM export_jobs
		WHERE user_id = ?
		ORDER BY created_at DESC
		LIMIT 20
	`
	var jobs []system_domain.ExportJob
	err := r.db.SelectContext(ctx, &jobs, query, userID)
	return jobs, err
}

// helper to parse dynamic array/object from frontend
func parseFilterSlice(val interface{}) ([]string, []string) {
	if val == nil {
		return nil, nil
	}

	var includes []string
	var excludes []string

	// Maybe it's a string "all"
	if s, ok := val.(string); ok {
		if s != "all" && s != "" {
			includes = append(includes, s)
		}
		return includes, excludes
	}

	// Maybe it's an array of strings
	if arr, ok := val.([]interface{}); ok {
		for _, item := range arr {
			if s, ok := item.(string); ok {
				includes = append(includes, s)
			}
		}
		return includes, excludes
	}

	// Maybe it's a map (include/exclude)
	if m, ok := val.(map[string]interface{}); ok {
		if inc, ok := m["include"].([]interface{}); ok {
			for _, item := range inc {
				if s, ok := item.(string); ok {
					includes = append(includes, s)
				}
			}
		}
		if exc, ok := m["exclude"].([]interface{}); ok {
			for _, item := range exc {
				if s, ok := item.(string); ok {
					excludes = append(excludes, s)
				}
			}
		}
	}

	return includes, excludes
}

func (r *reportRepositoryImpl) GetStockReportData(ctx context.Context, filter analytics_dto.StockReportFilter) ([]analytics_dto.StockReportRow, error) {
	var whereClauses []string
	var queryParams []interface{}

	whereClauses = append(whereClauses, "p.is_active = 1")

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
		query, args, _ := sqlx.In("l.building IN (?)", incB)
		whereClauses = append(whereClauses, query)
		queryParams = append(queryParams, args...)
	}
	if len(excB) > 0 {
		query, args, _ := sqlx.In("l.building NOT IN (?)", excB)
		whereClauses = append(whereClauses, query)
		queryParams = append(queryParams, args...)
	}

	incP, excP := parseFilterSlice(filter.Purpose)
	if len(incP) > 0 {
		query, args, _ := sqlx.In("l.purpose IN (?)", incP)
		whereClauses = append(whereClauses, query)
		queryParams = append(queryParams, args...)
	}
	if len(excP) > 0 {
		query, args, _ := sqlx.In("l.purpose NOT IN (?)", excP)
		whereClauses = append(whereClauses, query)
		queryParams = append(queryParams, args...)
	}

	if filter.SearchQuery != "" {
		whereClauses = append(whereClauses, "(p.sku LIKE ? OR p.name LIKE ?)")
		queryParams = append(queryParams, "%"+filter.SearchQuery+"%", "%"+filter.SearchQuery+"%")
	}

	if filter.IsPackage != nil {
		if s, ok := filter.IsPackage.(string); ok && s != "" && s != "all" {
			whereClauses = append(whereClauses, "p.is_package = ?")
			queryParams = append(queryParams, s)
		}
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

	// sqlx.Rebind is useful if you used IN queries
	finalQuery = r.db.Rebind(finalQuery)

	var rows []analytics_dto.StockReportRow
	err := r.db.SelectContext(ctx, &rows, finalQuery, queryParams...)
	return rows, err
}
