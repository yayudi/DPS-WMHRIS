package usecase

import (
	"context"

	system_dto "github.com/dps-wmhris/backend/internal/modules/system/application/dto"
	system_domain "github.com/dps-wmhris/backend/internal/modules/system/domain"
	"github.com/dps-wmhris/backend/internal/modules/system/port"
)

const maxSystemLogPageLimit = 200

// SystemLogService aliases the hexagonal inbound port for backward compatibility.
type SystemLogService = port.SystemLogService

type systemLogServiceImpl struct {
	systemLogRepo port.SystemLogRepository
}

// NewSystemLogService constructs a SystemLogService backed by SystemLogRepository.
func NewSystemLogService(systemLogRepo port.SystemLogRepository) port.SystemLogService {
	return &systemLogServiceImpl{
		systemLogRepo: systemLogRepo,
	}
}

// GetLogs retrieves filtered, paginated system audit logs with bounded page size.
func (s *systemLogServiceImpl) GetLogs(ctx context.Context, req system_dto.GetSystemLogsRequest) (*system_dto.GetSystemLogsResponse, error) {
	if req.Page < 1 {
		req.Page = 1
	}
	if req.Limit < 1 {
		req.Limit = 20
	}
	if req.Limit > maxSystemLogPageLimit {
		req.Limit = maxSystemLogPageLimit
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

// CreateLog persists a single immutable system audit log entry.
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
