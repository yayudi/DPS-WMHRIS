package usecase

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"strings"

	system_dto "github.com/dps-wmhris/backend/internal/modules/system/application/dto"
	system_domain "github.com/dps-wmhris/backend/internal/modules/system/domain"
	"github.com/dps-wmhris/backend/internal/modules/system/port"
	"github.com/dps-wmhris/backend/internal/shared/apperror"
	"github.com/dps-wmhris/backend/internal/shared/i18n"
	"github.com/dps-wmhris/backend/internal/shared/utils"
)

// JobService aliases the hexagonal inbound port for backward compatibility.
type JobService = port.JobService

type jobServiceImpl struct {
	jobRepo port.JobRepository
}

// NewJobService constructs a JobService backed by the given JobRepository.
func NewJobService(jobRepo port.JobRepository) port.JobService {
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

// CreateImportJob enqueues a new background import job with the request locale persisted in Options.
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

// GetImportJobs returns paginated import jobs optionally scoped to a specific user.
func (s *jobServiceImpl) GetImportJobs(ctx context.Context, page int, limit int, userID *int) (utils.PaginatedResult[system_domain.ImportJob], error) {
	return s.jobRepo.GetImportJobs(ctx, page, limit, userID)
}

// CancelImportJob cancels a pending import job after verifying ownership.
func (s *jobServiceImpl) CancelImportJob(ctx context.Context, id int, userID *int) error {
	job, err := s.jobRepo.GetImportJobByID(ctx, id)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return apperror.NotFound("system.jobs.not_found", "job tidak ditemukan")
		}
		return err
	}
	if job == nil {
		return apperror.NotFound("system.jobs.not_found", "job tidak ditemukan")
	}
	if userID != nil && *userID > 0 && job.UserID != *userID {
		return apperror.Forbidden("system.jobs.err_cancel_forbidden", "Tidak diizinkan membatalkan job milik pengguna lain")
	}
	if job.Status != system_domain.JobStatusPending {
		return apperror.Conflict("system.jobs.err_cancel_not_pending", "Hanya job berstatus PENDING yang dapat dibatalkan")
	}
	return s.jobRepo.UpdateImportJobStatus(ctx, id, system_domain.JobStatusCancelled, nil, nil)
}

// UpdateImportJobStatus updates the status of an import job.
func (s *jobServiceImpl) UpdateImportJobStatus(ctx context.Context, id int, status string) error {
	return s.jobRepo.UpdateImportJobStatus(ctx, id, status, nil, nil)
}

// UpdateImportJobStatusWithSummary updates an import job's status and log summary.
func (s *jobServiceImpl) UpdateImportJobStatusWithSummary(ctx context.Context, id int, status string, logSummary string) error {
	return s.jobRepo.UpdateImportJobStatus(ctx, id, status, &logSummary, nil)
}

// UpdateImportJobStatusWithLog updates an import job's status, log summary, and detailed error log.
func (s *jobServiceImpl) UpdateImportJobStatusWithLog(ctx context.Context, id int, status string, logSummary string, errorLog string) error {
	return s.jobRepo.UpdateImportJobStatus(ctx, id, status, &logSummary, &errorLog)
}

// UpdateImportJobProgress updates processed and total record counters for a running import job.
func (s *jobServiceImpl) UpdateImportJobProgress(ctx context.Context, id int, processed int, total int) error {
	return s.jobRepo.UpdateImportJobProgress(ctx, id, processed, total)
}

// CreateExportJob enqueues a new background export job with the request locale persisted in Filters.
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

// GetExportJobs returns paginated export jobs optionally scoped to a specific user.
func (s *jobServiceImpl) GetExportJobs(ctx context.Context, page int, limit int, userID *int) (utils.PaginatedResult[system_domain.ExportJob], error) {
	return s.jobRepo.GetExportJobs(ctx, page, limit, userID)
}

// GetExportJobByID fetches a single export job by ID.
func (s *jobServiceImpl) GetExportJobByID(ctx context.Context, id int) (*system_domain.ExportJob, error) {
	job, err := s.jobRepo.GetExportJobByID(ctx, id)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, apperror.NotFound("system.jobs.not_found", "job tidak ditemukan")
		}
		return nil, err
	}
	if job == nil {
		return nil, apperror.NotFound("system.jobs.not_found", "job tidak ditemukan")
	}
	return job, nil
}

// CancelExportJob marks a pending export job as FAILED with a cancellation message after verifying ownership.
func (s *jobServiceImpl) CancelExportJob(ctx context.Context, id int, userID *int) error {
	job, err := s.jobRepo.GetExportJobByID(ctx, id)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return apperror.NotFound("system.jobs.not_found", "job tidak ditemukan")
		}
		return err
	}
	if job == nil {
		return apperror.NotFound("system.jobs.not_found", "job tidak ditemukan")
	}
	if userID != nil && *userID > 0 && job.UserID != *userID {
		return apperror.Forbidden("system.jobs.err_cancel_forbidden", "Tidak diizinkan membatalkan job milik pengguna lain")
	}
	if job.Status != system_domain.JobStatusPending {
		return apperror.Conflict("system.jobs.err_cancel_not_pending", "Hanya job berstatus PENDING yang dapat dibatalkan")
	}
	cancelMsg := "Dibatalkan oleh pengguna"
	return s.jobRepo.UpdateExportJobStatus(ctx, id, system_domain.JobStatusFailed, nil, &cancelMsg)
}

// UpdateExportJobStatus updates an export job's status, output file path, and optional error message.
func (s *jobServiceImpl) UpdateExportJobStatus(ctx context.Context, id int, status string, fileURL *string, errorLog *string) error {
	return s.jobRepo.UpdateExportJobStatus(ctx, id, status, fileURL, errorLog)
}
