package usecase

import (
	system_domain "github.com/dps-wmhris/backend/internal/modules/system/domain"

	"context"

	system_dto "github.com/dps-wmhris/backend/internal/modules/system/application/dto"

	system_mysql "github.com/dps-wmhris/backend/internal/modules/system/adapter/outbound/mysql"
)

type SystemLogService interface {
	CreateLog(ctx context.Context, req system_dto.CreateLogRequest) error
	GetLogs(ctx context.Context, req system_dto.GetSystemLogsRequest) (*system_dto.GetSystemLogsResponse, error)
}

type systemLogServiceImpl struct {
	systemLogRepo system_mysql.SystemLogRepository
}

func NewSystemLogService(systemLogRepo system_mysql.SystemLogRepository) SystemLogService {
	return &systemLogServiceImpl{
		systemLogRepo: systemLogRepo,
	}
}

func (s *systemLogServiceImpl) GetLogs(ctx context.Context, req system_dto.GetSystemLogsRequest) (*system_dto.GetSystemLogsResponse, error) {
	if req.Page < 1 {
		req.Page = 1
	}
	if req.Limit < 1 {
		req.Limit = 20
	}

	result, err := s.systemLogRepo.GetLogs(ctx, req)
	if err != nil {
		return nil, err
	}

	return &system_dto.GetSystemLogsResponse{
		Data:  result.Data,
		Total: result.Total,
	}, nil
}

func (s *systemLogServiceImpl) CreateLog(ctx context.Context, req system_dto.CreateLogRequest) error {
	logEntry := &system_domain.SystemLog{
		UserID:     req.UserID,
		Action:     req.Action,
		TargetType: req.TargetType,
		TargetID:   req.TargetID,
		Changes:    req.Changes,
		IP:         req.IP,
		UserAgent:  req.UserAgent,
	}
	return s.systemLogRepo.Create(ctx, logEntry)
}
