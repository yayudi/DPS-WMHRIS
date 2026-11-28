// Package mysql provides MySQL implementations for analytics repositories.
package mysql

import (
	"context"

	analytics_dto "github.com/dps-wmhris/backend/internal/modules/analytics/application/dto"
	analytics_port "github.com/dps-wmhris/backend/internal/modules/analytics/port"
	"github.com/dps-wmhris/backend/internal/shared/database"

	"github.com/jmoiron/sqlx"
)

// StatsRepository is a compatibility alias for analytics/port.StatsRepository.
type StatsRepository = analytics_port.StatsRepository

type statsRepositoryImpl struct {
	db *sqlx.DB
}

// NewStatsRepository creates a new MySQL-backed StatsRepository.
func NewStatsRepository(db *sqlx.DB) StatsRepository {
	return &statsRepositoryImpl{db: db}
}

// GetOperationalPulseKpi retrieves today vs yesterday movement pulses, active users, pending stock requests, and active SKU counts.
func (r *statsRepositoryImpl) GetOperationalPulseKpi(ctx context.Context) (analytics_dto.OperationalPulseDTO, error) {
	ext := database.GetExt(ctx, r.db)
	movementQuery := `
		SELECT
			COALESCE(SUM(CASE WHEN DATE(created_at) = CURDATE() AND movement_type IN ('SALE', 'OUT') THEN quantity ELSE 0 END), 0) AS outbound_today,
			COALESCE(SUM(CASE WHEN DATE(created_at) = DATE_SUB(CURDATE(), INTERVAL 1 DAY) AND movement_type IN ('SALE', 'OUT') THEN quantity ELSE 0 END), 0) AS outbound_yesterday,
			COALESCE(SUM(CASE WHEN DATE(created_at) = CURDATE() AND movement_type = 'INBOUND' THEN quantity ELSE 0 END), 0) AS inbound_today,
			COALESCE(SUM(CASE WHEN DATE(created_at) = DATE_SUB(CURDATE(), INTERVAL 1 DAY) AND movement_type = 'INBOUND' THEN quantity ELSE 0 END), 0) AS inbound_yesterday,
			COALESCE(SUM(CASE WHEN DATE(created_at) = CURDATE() AND movement_type = 'TRANSFER' THEN quantity ELSE 0 END), 0) AS transfer_today,
			COUNT(DISTINCT CASE WHEN DATE(created_at) = CURDATE() AND movement_type IN ('SALE', 'OUT') THEN notes END) AS lists_completed_today,
			COUNT(DISTINCT CASE WHEN DATE(created_at) = DATE_SUB(CURDATE(), INTERVAL 1 DAY) AND movement_type IN ('SALE', 'OUT') THEN notes END) AS lists_completed_yesterday,
			COUNT(DISTINCT CASE WHEN DATE(created_at) = CURDATE() THEN user_id END) AS users_active_today
		FROM stock_movements
		WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL 1 DAY)
	`

	var row struct {
		OutboundToday           float64 `db:"outbound_today"`
		OutboundYesterday       float64 `db:"outbound_yesterday"`
		InboundToday            float64 `db:"inbound_today"`
		InboundYesterday        float64 `db:"inbound_yesterday"`
		TransferToday           float64 `db:"transfer_today"`
		ListsCompletedToday     int     `db:"lists_completed_today"`
		ListsCompletedYesterday int     `db:"lists_completed_yesterday"`
		UsersActiveToday        int     `db:"users_active_today"`
	}

	if err := ext.GetContext(ctx, &row, movementQuery); err != nil {
		return analytics_dto.OperationalPulseDTO{}, err
	}

	var pendingStockRequests int
	if err := ext.GetContext(ctx, &pendingStockRequests, `
		SELECT COUNT(*) FROM stock_requests WHERE status IN ('PENDING', 'APPROVED', 'SHIPPED')
	`); err != nil {
		return analytics_dto.OperationalPulseDTO{}, err
	}

	var totalActiveSkus int
	if err := ext.GetContext(ctx, &totalActiveSkus, `
		SELECT COUNT(*) FROM products WHERE is_active = 1 AND deleted_at IS NULL AND is_package = 0
	`); err != nil {
		return analytics_dto.OperationalPulseDTO{}, err
	}

	return analytics_dto.OperationalPulseDTO{
		OutboundToday:           row.OutboundToday,
		OutboundYesterday:       row.OutboundYesterday,
		InboundToday:            row.InboundToday,
		InboundYesterday:        row.InboundYesterday,
		TransferToday:           row.TransferToday,
		ListsCompletedToday:     row.ListsCompletedToday,
		ListsCompletedYesterday: row.ListsCompletedYesterday,
		UsersActiveToday:        row.UsersActiveToday,
		PendingStockRequests:    pendingStockRequests,
		TotalActiveSkus:         totalActiveSkus,
	}, nil
}

// GetInventoryValueKpi calculates total valuation across active, non-deleted products and stock locations.
func (r *statsRepositoryImpl) GetInventoryValueKpi(ctx context.Context) (float64, error) {
	ext := database.GetExt(ctx, r.db)
	query := `
		SELECT
			COALESCE(SUM(sl.quantity * p.price), 0) AS totalInventoryValue
		FROM stock_locations sl
		JOIN products p ON sl.product_id = p.id
		JOIN locations l ON sl.location_id = l.id
		WHERE p.is_active = 1 AND p.deleted_at IS NULL AND l.deleted_at IS NULL AND sl.quantity > 0
	`

	var total float64
	err := ext.GetContext(ctx, &total, query)
	return total, err
}

// GetSkuHealthRows retrieves current physical stock and 30-day outbound velocity for active, non-deleted non-package SKUs.
func (r *statsRepositoryImpl) GetSkuHealthRows(ctx context.Context) ([]analytics_dto.SkuHealthInputRow, error) {
	ext := database.GetExt(ctx, r.db)
	query := `
		SELECT
			p.id AS product_id,
			p.sku,
			p.name,
			COALESCE(s_loc.current_stock, 0) AS current_stock,
			COALESCE(s_mov.sold_30d, 0) AS sold_30d
		FROM products p
		LEFT JOIN (
			SELECT sl.product_id, SUM(sl.quantity) AS current_stock
			FROM stock_locations sl
			JOIN locations l ON sl.location_id = l.id
			WHERE l.deleted_at IS NULL
			GROUP BY sl.product_id
		) s_loc ON p.id = s_loc.product_id
		LEFT JOIN (
			SELECT product_id, SUM(quantity) AS sold_30d
			FROM stock_movements
			WHERE movement_type IN ('SALE', 'OUT')
				AND created_at >= DATE_SUB(CURDATE(), INTERVAL 29 DAY)
			GROUP BY product_id
		) s_mov ON p.id = s_mov.product_id
		WHERE p.is_active = 1 AND p.deleted_at IS NULL AND p.is_package = 0
	`

	var rows []analytics_dto.SkuHealthInputRow
	if err := ext.SelectContext(ctx, &rows, query); err != nil {
		return nil, err
	}
	if rows == nil {
		rows = []analytics_dto.SkuHealthInputRow{}
	}
	return rows, nil
}

// GetDuplicateLocationWatchlist returns top active, non-deleted SKUs scattered across multiple locations with the same purpose.
func (r *statsRepositoryImpl) GetDuplicateLocationWatchlist(ctx context.Context, limit int) ([]analytics_dto.DuplicateProductLocation, error) {
	ext := database.GetExt(ctx, r.db)
	query := `
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
		WHERE p.is_active = 1 AND p.deleted_at IS NULL AND l.is_active = 1 AND l.deleted_at IS NULL AND sl.quantity > 0
		GROUP BY p.id, p.sku, p.name, l.purpose
		HAVING location_count > 1
		ORDER BY CASE WHEN l.purpose = 'DISPLAY' THEN 0 ELSE 1 END, location_count DESC, p.sku ASC
		LIMIT ?
	`

	var rows []analytics_dto.DuplicateProductLocation
	if err := ext.SelectContext(ctx, &rows, query, limit); err != nil {
		return nil, err
	}
	if rows == nil {
		rows = []analytics_dto.DuplicateProductLocation{}
	}
	return rows, nil
}

// GetTopLoadedLocationWatchlist returns the top active, non-deleted warehouse locations ranked by stock quantity and weight.
func (r *statsRepositoryImpl) GetTopLoadedLocationWatchlist(ctx context.Context, limit int) ([]analytics_dto.TopLocationWatchItem, error) {
	ext := database.GetExt(ctx, r.db)
	query := `
		SELECT
			l.id AS location_id,
			l.code,
			l.building,
			l.purpose,
			COUNT(DISTINCT CASE WHEN sl.quantity > 0 THEN sl.product_id END) AS total_products,
			COALESCE(SUM(CASE WHEN sl.quantity > 0 THEN sl.quantity ELSE 0 END), 0) AS total_quantity,
			COALESCE(SUM(CASE WHEN sl.quantity > 0 THEN sl.quantity ELSE 0 END * COALESCE(p.weight, 0)), 0) / 1000 AS total_weight_kg
		FROM locations l
		JOIN stock_locations sl ON l.id = sl.location_id
		JOIN products p ON sl.product_id = p.id
		WHERE l.is_active = 1 AND l.deleted_at IS NULL AND p.deleted_at IS NULL AND sl.quantity > 0
		GROUP BY l.id, l.code, l.building, l.purpose
		ORDER BY total_quantity DESC, total_weight_kg DESC
		LIMIT ?
	`

	var rows []analytics_dto.TopLocationWatchItem
	if err := ext.SelectContext(ctx, &rows, query, limit); err != nil {
		return nil, err
	}
	if rows == nil {
		rows = []analytics_dto.TopLocationWatchItem{}
	}
	return rows, nil
}

// GetDailyMovementTrend aggregates daily inbound, outbound, and transfer volumes for the past N days.
func (r *statsRepositoryImpl) GetDailyMovementTrend(ctx context.Context, days int) ([]analytics_dto.DailyMovementPointDTO, error) {
	ext := database.GetExt(ctx, r.db)
	if days <= 0 {
		days = 14
	}
	lookbackDays := days - 1
	query := `
		SELECT
			DATE_FORMAT(created_at, '%Y-%m-%d') AS date,
			COALESCE(SUM(CASE WHEN movement_type = 'INBOUND' THEN quantity ELSE 0 END), 0) AS total_inbound,
			COALESCE(SUM(CASE WHEN movement_type IN ('SALE', 'OUT') THEN quantity ELSE 0 END), 0) AS total_outbound,
			COALESCE(SUM(CASE WHEN movement_type = 'TRANSFER' THEN quantity ELSE 0 END), 0) AS total_transfer
		FROM stock_movements
		WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
		GROUP BY DATE_FORMAT(created_at, '%Y-%m-%d')
		ORDER BY date ASC
	`

	var rows []analytics_dto.DailyMovementPointDTO
	if err := ext.SelectContext(ctx, &rows, query, lookbackDays); err != nil {
		return nil, err
	}
	if rows == nil {
		rows = []analytics_dto.DailyMovementPointDTO{}
	}
	return rows, nil
}

// GetBuildingDistribution summarizes location counts, active SKU counts, and quantities per active, non-deleted building.
func (r *statsRepositoryImpl) GetBuildingDistribution(ctx context.Context) ([]analytics_dto.BuildingStockSummaryDTO, error) {
	ext := database.GetExt(ctx, r.db)
	query := `
		SELECT
			l.building,
			COUNT(DISTINCT l.id) AS total_locations,
			COUNT(DISTINCT CASE WHEN p.id IS NOT NULL AND sl.quantity > 0 THEN sl.product_id END) AS total_skus,
			COALESCE(SUM(CASE WHEN p.id IS NOT NULL AND sl.quantity > 0 THEN sl.quantity ELSE 0 END), 0) AS total_quantity
		FROM locations l
		LEFT JOIN stock_locations sl ON l.id = sl.location_id AND sl.quantity > 0
		LEFT JOIN products p ON sl.product_id = p.id AND p.deleted_at IS NULL
		WHERE l.is_active = 1 AND l.deleted_at IS NULL AND l.building != ''
		GROUP BY l.building
		ORDER BY total_quantity DESC, l.building ASC
	`

	var rows []analytics_dto.BuildingStockSummaryDTO
	if err := ext.SelectContext(ctx, &rows, query); err != nil {
		return nil, err
	}
	if rows == nil {
		rows = []analytics_dto.BuildingStockSummaryDTO{}
	}
	return rows, nil
}
