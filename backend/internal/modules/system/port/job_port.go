package port

import (
	"context"

	system_dto "github.com/dps-wmhris/backend/internal/modules/system/application/dto"
	system_domain "github.com/dps-wmhris/backend/internal/modules/system/domain"
	"github.com/dps-wmhris/backend/internal/shared/utils"
)

// JobRepository defines outbound persistence operations for background import and export jobs.
type JobRepository interface {
	// Import Jobs
	CreateImportJob(ctx context.Context, job *system_domain.ImportJob) (int, error)
	GetImportJobs(ctx context.Context, page int, limit int, userID *int) (utils.PaginatedResult[system_domain.ImportJob], error)
	GetImportJobByID(ctx context.Context, id int) (*system_domain.ImportJob, error)
	UpdateImportJobStatus(ctx context.Context, id int, status string, logSummary *string, errorLog *string) error
	UpdateImportJobProgress(ctx context.Context, id int, processed int, total int) error
	GetPendingImportJobs(ctx context.Context) ([]system_domain.ImportJob, error)
	ClaimNextImportJob(ctx context.Context) (*system_domain.ImportJob, error)
	RecoverStuckImportJobs(ctx context.Context) (int, error)

	// Export Jobs
	CreateExportJob(ctx context.Context, job *system_domain.ExportJob) (int, error)
	GetExportJobs(ctx context.Context, page int, limit int, userID *int) (utils.PaginatedResult[system_domain.ExportJob], error)
	GetExportJobByID(ctx context.Context, id int) (*system_domain.ExportJob, error)
	UpdateExportJobStatus(ctx context.Context, id int, status string, filePath *string, errorMessage *string) error
	GetPendingExportJobs(ctx context.Context) ([]system_domain.ExportJob, error)
	ClaimNextExportJob(ctx context.Context) (*system_domain.ExportJob, error)
	RecoverStuckExportJobs(ctx context.Context) (int, error)
}

// JobService defines inbound application operations for managing background import and export jobs.
type JobService interface {
	CreateImportJob(ctx context.Context, req system_dto.CreateImportJobRequest) (int, error)
	GetImportJobs(ctx context.Context, page int, limit int, userID *int) (utils.PaginatedResult[system_domain.ImportJob], error)
	CancelImportJob(ctx context.Context, id int, userID *int) error
	UpdateImportJobStatus(ctx context.Context, id int, status string) error
	UpdateImportJobStatusWithSummary(ctx context.Context, id int, status string, logSummary string) error
	UpdateImportJobStatusWithLog(ctx context.Context, id int, status string, logSummary string, errorLog string) error
	UpdateImportJobProgress(ctx context.Context, id int, processed int, total int) error

	CreateExportJob(ctx context.Context, req system_dto.CreateExportJobRequest) (int, error)
	GetExportJobs(ctx context.Context, page int, limit int, userID *int) (utils.PaginatedResult[system_domain.ExportJob], error)
	GetExportJobByID(ctx context.Context, id int) (*system_domain.ExportJob, error)
	CancelExportJob(ctx context.Context, id int, userID *int) error
	UpdateExportJobStatus(ctx context.Context, id int, status string, fileURL *string, errorLog *string) error
}
