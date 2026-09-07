package service

import (
	"context"
	"errors"

	"github.com/dps-wmhris/backend/internal/dto"
	"github.com/dps-wmhris/backend/internal/model"
	"github.com/dps-wmhris/backend/internal/repository"
	"github.com/dps-wmhris/backend/internal/utils"
)

type JobService interface {
	CreateImportJob(ctx context.Context, req dto.CreateImportJobRequest) (int, error)
	GetImportJobs(ctx context.Context, page int, limit int) (utils.PaginatedResult[model.ImportJob], error)
	CancelImportJob(ctx context.Context, id int) error
	UpdateImportJobStatus(ctx context.Context, id int, status string) error
	UpdateImportJobStatusWithSummary(ctx context.Context, id int, status string, logSummary string) error
	UpdateImportJobProgress(ctx context.Context, id int, processed int, total int) error

	CreateExportJob(ctx context.Context, req dto.CreateExportJobRequest) (int, error)
	GetExportJobs(ctx context.Context, page int, limit int) (utils.PaginatedResult[model.ExportJob], error)
	CancelExportJob(ctx context.Context, id int) error
	UpdateExportJobStatus(ctx context.Context, id int, status string, fileURL *string, errorLog *string) error
}

type jobServiceImpl struct {
	jobRepo repository.JobRepository
}

func NewJobService(jobRepo repository.JobRepository) JobService {
	return &jobServiceImpl{jobRepo: jobRepo}
}

func (s *jobServiceImpl) CreateImportJob(ctx context.Context, req dto.CreateImportJobRequest) (int, error) {
	job := &model.ImportJob{
		UserID:           req.UserID,
		JobType:          req.JobType,
		OriginalFilename: &req.OriginalFilename,
		FilePath:         req.FilePath,
		Notes:            req.Notes,
		Options:          req.Options,
	}
	return s.jobRepo.CreateImportJob(ctx, job)
}

func (s *jobServiceImpl) GetImportJobs(ctx context.Context, page int, limit int) (utils.PaginatedResult[model.ImportJob], error) {
	return s.jobRepo.GetImportJobs(ctx, page, limit)
}

func (s *jobServiceImpl) CancelImportJob(ctx context.Context, id int) error {
	job, err := s.jobRepo.GetImportJobByID(ctx, id)
	if err != nil {
		return err
	}
	if job.Status != "PENDING" {
		return errors.New("only PENDING jobs can be cancelled")
	}
	return s.jobRepo.UpdateImportJobStatus(ctx, id, "CANCELLED", nil, nil)
}

func (s *jobServiceImpl) UpdateImportJobStatus(ctx context.Context, id int, status string) error {
	return s.jobRepo.UpdateImportJobStatus(ctx, id, status, nil, nil)
}

func (s *jobServiceImpl) UpdateImportJobStatusWithSummary(ctx context.Context, id int, status string, logSummary string) error {
	return s.jobRepo.UpdateImportJobStatus(ctx, id, status, &logSummary, nil)
}

func (s *jobServiceImpl) UpdateImportJobProgress(ctx context.Context, id int, processed int, total int) error {
	return s.jobRepo.UpdateImportJobProgress(ctx, id, processed, total)
}

func (s *jobServiceImpl) CreateExportJob(ctx context.Context, req dto.CreateExportJobRequest) (int, error) {
	job := &model.ExportJob{
		UserID:  req.UserID,
		JobType: req.JobType,
		Filters: req.Filters,
	}
	return s.jobRepo.CreateExportJob(ctx, job)
}

func (s *jobServiceImpl) GetExportJobs(ctx context.Context, page int, limit int) (utils.PaginatedResult[model.ExportJob], error) {
	return s.jobRepo.GetExportJobs(ctx, page, limit)
}

func (s *jobServiceImpl) CancelExportJob(ctx context.Context, id int) error {
	job, err := s.jobRepo.GetExportJobByID(ctx, id)
	if err != nil {
		return err
	}
	if job.Status != "PENDING" {
		return errors.New("only PENDING jobs can be cancelled")
	}
	return s.jobRepo.UpdateExportJobStatus(ctx, id, "FAILED", nil, nil) // or CANCELLED if schema enum allowed it, but export_jobs only has PENDING, PROCESSING, COMPLETED, FAILED. We'll use FAILED for cancellation.
}

func (s *jobServiceImpl) UpdateExportJobStatus(ctx context.Context, id int, status string, fileURL *string, errorLog *string) error {
	return s.jobRepo.UpdateExportJobStatus(ctx, id, status, fileURL, errorLog)
}
