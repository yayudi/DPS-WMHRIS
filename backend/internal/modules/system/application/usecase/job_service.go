package usecase

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"

	system_dto "github.com/dps-wmhris/backend/internal/modules/system/application/dto"
	system_domain "github.com/dps-wmhris/backend/internal/modules/system/domain"

	system_mysql "github.com/dps-wmhris/backend/internal/modules/system/adapter/outbound/mysql"
	"github.com/dps-wmhris/backend/internal/shared/apperror"
	"github.com/dps-wmhris/backend/internal/shared/i18n"
	"github.com/dps-wmhris/backend/internal/shared/utils"
)

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

type jobServiceImpl struct {
	jobRepo system_mysql.JobRepository
}

func NewJobService(jobRepo system_mysql.JobRepository) JobService {
	return &jobServiceImpl{jobRepo: jobRepo}
}

func injectLocaleIntoJSON(rawJSON *string, locale string) *string {
	if locale == "" {
		locale = i18n.DefaultLocale
	}
	m := make(map[string]any)
	if rawJSON != nil && strings.TrimSpace(*rawJSON) != "" {
		_ = json.Unmarshal([]byte(*rawJSON), &m)
	}
	m["_locale"] = locale
	bytes, err := json.Marshal(m)
	if err != nil {
		str := fmt.Sprintf(`{"_locale":"%s"}`, locale)
		return &str
	}
	res := string(bytes)
	return &res
}

func (s *jobServiceImpl) CreateImportJob(ctx context.Context, req system_dto.CreateImportJobRequest) (int, error) {
	locale := i18n.GetLocaleFromContext(ctx)
	options := injectLocaleIntoJSON(req.Options, locale)

	job := &system_domain.ImportJob{
		UserID:           req.UserID,
		JobType:          req.JobType,
		OriginalFilename: &req.OriginalFilename,
		FilePath:         req.FilePath,
		Notes:            req.Notes,
		Options:          options,
	}
	return s.jobRepo.CreateImportJob(ctx, job)
}

func (s *jobServiceImpl) GetImportJobs(ctx context.Context, page int, limit int, userID *int) (utils.PaginatedResult[system_domain.ImportJob], error) {
	return s.jobRepo.GetImportJobs(ctx, page, limit, userID)
}

func (s *jobServiceImpl) CancelImportJob(ctx context.Context, id int, userID *int) error {
	job, err := s.jobRepo.GetImportJobByID(ctx, id)
	if err != nil {
		return err
	}
	if userID != nil && *userID > 0 && job.UserID != *userID {
		return apperror.Forbidden("system.jobs.err_cancel_forbidden", "Tidak diizinkan membatalkan job milik pengguna lain", nil)
	}
	if job.Status != "PENDING" {
		return apperror.Conflict("system.jobs.err_cancel_not_pending", "Hanya job berstatus PENDING yang dapat dibatalkan", nil)
	}
	return s.jobRepo.UpdateImportJobStatus(ctx, id, "CANCELLED", nil, nil)
}

func (s *jobServiceImpl) UpdateImportJobStatus(ctx context.Context, id int, status string) error {
	return s.jobRepo.UpdateImportJobStatus(ctx, id, status, nil, nil)
}

func (s *jobServiceImpl) UpdateImportJobStatusWithSummary(ctx context.Context, id int, status string, logSummary string) error {
	return s.jobRepo.UpdateImportJobStatus(ctx, id, status, &logSummary, nil)
}

func (s *jobServiceImpl) UpdateImportJobStatusWithLog(ctx context.Context, id int, status string, logSummary string, errorLog string) error {
	return s.jobRepo.UpdateImportJobStatus(ctx, id, status, &logSummary, &errorLog)
}

func (s *jobServiceImpl) UpdateImportJobProgress(ctx context.Context, id int, processed int, total int) error {
	return s.jobRepo.UpdateImportJobProgress(ctx, id, processed, total)
}

func (s *jobServiceImpl) CreateExportJob(ctx context.Context, req system_dto.CreateExportJobRequest) (int, error) {
	locale := i18n.GetLocaleFromContext(ctx)
	filters := injectLocaleIntoJSON(req.Filters, locale)

	job := &system_domain.ExportJob{
		UserID:  req.UserID,
		JobType: req.JobType,
		Filters: filters,
	}
	return s.jobRepo.CreateExportJob(ctx, job)
}

func (s *jobServiceImpl) GetExportJobs(ctx context.Context, page int, limit int, userID *int) (utils.PaginatedResult[system_domain.ExportJob], error) {
	return s.jobRepo.GetExportJobs(ctx, page, limit, userID)
}

func (s *jobServiceImpl) GetExportJobByID(ctx context.Context, id int) (*system_domain.ExportJob, error) {
	return s.jobRepo.GetExportJobByID(ctx, id)
}

func (s *jobServiceImpl) CancelExportJob(ctx context.Context, id int, userID *int) error {
	job, err := s.jobRepo.GetExportJobByID(ctx, id)
	if err != nil {
		return err
	}
	if userID != nil && *userID > 0 && job.UserID != *userID {
		return apperror.Forbidden("system.jobs.err_cancel_forbidden", "Tidak diizinkan membatalkan job milik pengguna lain", nil)
	}
	if job.Status != "PENDING" {
		return apperror.Conflict("system.jobs.err_cancel_not_pending", "Hanya job berstatus PENDING yang dapat dibatalkan", nil)
	}
	return s.jobRepo.UpdateExportJobStatus(ctx, id, "FAILED", nil, nil) // or CANCELLED if schema enum allowed it, but export_jobs only has PENDING, PROCESSING, COMPLETED, FAILED. We'll use FAILED for cancellation.
}

func (s *jobServiceImpl) UpdateExportJobStatus(ctx context.Context, id int, status string, fileURL *string, errorLog *string) error {
	return s.jobRepo.UpdateExportJobStatus(ctx, id, status, fileURL, errorLog)
}
