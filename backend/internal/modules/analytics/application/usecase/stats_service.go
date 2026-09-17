package usecase

import (
	"context"

	analytics_dto "github.com/dps-wmhris/backend/internal/modules/analytics/application/dto"

	analytics_mysql "github.com/dps-wmhris/backend/internal/modules/analytics/adapter/outbound/mysql"
)

type StatsService interface {
	GetKpiSummary(ctx context.Context) (analytics_dto.KpiSummaryResponse, error)
}

type statsServiceImpl struct {
	statsRepo analytics_mysql.StatsRepository
}

func NewStatsService(statsRepo analytics_mysql.StatsRepository) StatsService {
	return &statsServiceImpl{statsRepo: statsRepo}
}

func (s *statsServiceImpl) GetKpiSummary(ctx context.Context) (analytics_dto.KpiSummaryResponse, error) {
	activity, err := s.statsRepo.GetActivityKpi(ctx)
	if err != nil {
		return analytics_dto.KpiSummaryResponse{}, err
	}

	inventoryValue, err := s.statsRepo.GetInventoryValueKpi(ctx)
	if err != nil {
		return analytics_dto.KpiSummaryResponse{}, err
	}

	activity.TotalInventoryValue = inventoryValue
	return activity, nil
}
