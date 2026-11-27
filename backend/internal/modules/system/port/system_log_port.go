package port

import (
	"context"

	system_dto "github.com/dps-wmhris/backend/internal/modules/system/application/dto"
	system_domain "github.com/dps-wmhris/backend/internal/modules/system/domain"
	"github.com/dps-wmhris/backend/internal/shared/utils"
)

// SystemLogRepository defines outbound persistence operations for system audit logs.
type SystemLogRepository interface {
	Create(ctx context.Context, log *system_domain.SystemLog) error
	GetLogs(ctx context.Context, req system_dto.GetSystemLogsRequest) (utils.PaginatedResult[system_dto.SystemLogResponse], error)
}

// SystemLogService defines inbound application operations for recording and querying audit logs.
type SystemLogService interface {
	CreateLog(ctx context.Context, req system_dto.CreateLogRequest) error
	GetLogs(ctx context.Context, req system_dto.GetSystemLogsRequest) (*system_dto.GetSystemLogsResponse, error)
}
