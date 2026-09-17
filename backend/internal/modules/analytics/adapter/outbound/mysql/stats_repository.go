package mysql

import (
	"context"

	analytics_dto "github.com/dps-wmhris/backend/internal/modules/analytics/application/dto"

	"github.com/jmoiron/sqlx"
)

type StatsRepository interface {
	GetActivityKpi(ctx context.Context) (analytics_dto.KpiSummaryResponse, error)
	GetInventoryValueKpi(ctx context.Context) (float64, error)
}

type statsRepositoryImpl struct {
	db *sqlx.DB
}

func NewStatsRepository(db *sqlx.DB) StatsRepository {
	return &statsRepositoryImpl{db: db}
}

func (r *statsRepositoryImpl) GetActivityKpi(ctx context.Context) (analytics_dto.KpiSummaryResponse, error) {
	query := `
		SELECT
			COUNT(DISTINCT notes) AS listsCompletedToday,
			COALESCE(SUM(quantity), 0) AS itemsPickedToday,
			COUNT(DISTINCT user_id) AS usersActiveToday
		FROM
			stock_movements
		WHERE
			movement_type = 'SALE'
			AND DATE(created_at) = CURDATE()
	`

	var kpi struct {
		ListsCompletedToday int `db:"listsCompletedToday"`
		ItemsPickedToday    int `db:"itemsPickedToday"`
		UsersActiveToday    int `db:"usersActiveToday"`
	}

	err := r.db.GetContext(ctx, &kpi, query)
	if err != nil {
		return analytics_dto.KpiSummaryResponse{}, err
	}

	return analytics_dto.KpiSummaryResponse{
		ListsCompletedToday: kpi.ListsCompletedToday,
		ItemsPickedToday:    kpi.ItemsPickedToday,
		UsersActiveToday:    kpi.UsersActiveToday,
	}, nil
}

func (r *statsRepositoryImpl) GetInventoryValueKpi(ctx context.Context) (float64, error) {
	query := `
		SELECT
			COALESCE(SUM(sl.quantity * p.price), 0) AS totalInventoryValue
		FROM
			stock_locations sl
		JOIN
			products p ON sl.product_id = p.id
		WHERE
			p.is_active = 1 AND sl.quantity > 0
	`

	var total float64
	err := r.db.GetContext(ctx, &total, query)
	return total, err
}
