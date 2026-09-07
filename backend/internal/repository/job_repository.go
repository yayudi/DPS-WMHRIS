package repository

import (
	"context"

	"github.com/dps-wmhris/backend/internal/model"
	"github.com/dps-wmhris/backend/internal/utils"
	"github.com/jmoiron/sqlx"
)

type JobRepository interface {
	// Import Jobs
	CreateImportJob(ctx context.Context, job *model.ImportJob) (int, error)
	GetImportJobs(ctx context.Context, page int, limit int) (utils.PaginatedResult[model.ImportJob], error)
	GetImportJobByID(ctx context.Context, id int) (*model.ImportJob, error)
	UpdateImportJobStatus(ctx context.Context, id int, status string, logSummary *string, errorLog *string) error
	UpdateImportJobProgress(ctx context.Context, id int, processed int, total int) error
	GetPendingImportJobs(ctx context.Context) ([]model.ImportJob, error)
	ClaimNextImportJob(ctx context.Context, tx *sqlx.Tx) (*model.ImportJob, error)
	RecoverStuckImportJobs(ctx context.Context) (int, error)

	// Export Jobs
	CreateExportJob(ctx context.Context, job *model.ExportJob) (int, error)
	GetExportJobs(ctx context.Context, page int, limit int) (utils.PaginatedResult[model.ExportJob], error)
	GetExportJobByID(ctx context.Context, id int) (*model.ExportJob, error)
	UpdateExportJobStatus(ctx context.Context, id int, status string, filePath *string, errorMessage *string) error
	GetPendingExportJobs(ctx context.Context) ([]model.ExportJob, error)
	ClaimNextExportJob(ctx context.Context, tx *sqlx.Tx) (*model.ExportJob, error)
	RecoverStuckExportJobs(ctx context.Context) (int, error)
}

type jobRepositoryImpl struct {
	db *sqlx.DB
}

func NewJobRepository(db *sqlx.DB) JobRepository {
	return &jobRepositoryImpl{db: db}
}

// --- Import Jobs ---

func (r *jobRepositoryImpl) CreateImportJob(ctx context.Context, job *model.ImportJob) (int, error) {
	query := `
		INSERT INTO import_jobs (user_id, job_type, original_filename, file_path, notes, options, status)
		VALUES (?, ?, ?, ?, ?, ?, 'PENDING')
	`
	res, err := r.db.ExecContext(ctx, query, job.UserID, job.JobType, job.OriginalFilename, job.FilePath, job.Notes, job.Options)
	if err != nil {
		return 0, err
	}
	id, err := res.LastInsertId()
	return int(id), err
}

func (r *jobRepositoryImpl) GetImportJobs(ctx context.Context, page int, limit int) (utils.PaginatedResult[model.ImportJob], error) {
	query := `SELECT * FROM import_jobs ORDER BY created_at DESC`
	return utils.FetchPaginated[model.ImportJob](ctx, r.db, query, page, limit)
}

func (r *jobRepositoryImpl) GetImportJobByID(ctx context.Context, id int) (*model.ImportJob, error) {
	query := `SELECT * FROM import_jobs WHERE id = ?`
	var job model.ImportJob
	err := r.db.GetContext(ctx, &job, query, id)
	return &job, err
}

func (r *jobRepositoryImpl) UpdateImportJobStatus(ctx context.Context, id int, status string, logSummary *string, errorLog *string) error {
	query := `
		UPDATE import_jobs 
		SET status = ?, log_summary = ?, error_log = ?, updated_at = CURRENT_TIMESTAMP
		WHERE id = ?
	`
	_, err := r.db.ExecContext(ctx, query, status, logSummary, errorLog, id)
	return err
}

func (r *jobRepositoryImpl) UpdateImportJobProgress(ctx context.Context, id int, processed int, total int) error {
	_, err := r.db.ExecContext(ctx,
		"UPDATE import_jobs SET processed_records = ?, total_records = ?, status = 'PROCESSING' WHERE id = ?",
		processed, total, id)
	return err
}

func (r *jobRepositoryImpl) GetPendingImportJobs(ctx context.Context) ([]model.ImportJob, error) {
	query := `SELECT * FROM import_jobs WHERE status IN ('PENDING', 'PROCESSING') ORDER BY created_at ASC`
	var jobs []model.ImportJob
	err := r.db.SelectContext(ctx, &jobs, query)
	return jobs, err
}

func (r *jobRepositoryImpl) ClaimNextImportJob(ctx context.Context, tx *sqlx.Tx) (*model.ImportJob, error) {
	var job model.ImportJob
	query := `SELECT * FROM import_jobs WHERE status = 'PENDING' ORDER BY created_at ASC LIMIT 1 FOR UPDATE SKIP LOCKED`
	err := tx.GetContext(ctx, &job, query)
	if err != nil {
		return nil, err
	}
	_, err = tx.ExecContext(ctx, 
		"UPDATE import_jobs SET status = 'PROCESSING', processing_started_at = NOW() WHERE id = ?", job.ID)
	if err != nil {
		return nil, err
	}
	return &job, nil
}

func (r *jobRepositoryImpl) RecoverStuckImportJobs(ctx context.Context) (int, error) {
	query := `UPDATE import_jobs 
		SET status = 'FAILED', log_summary = 'Timeout: proses melebihi batas waktu (15 menit)' 
		WHERE status = 'PROCESSING' 
		AND processing_started_at < NOW() - INTERVAL 15 MINUTE`
	res, err := r.db.ExecContext(ctx, query)
	if err != nil {
		return 0, err
	}
	affected, _ := res.RowsAffected()
	return int(affected), nil
}

// --- Export Jobs ---

func (r *jobRepositoryImpl) CreateExportJob(ctx context.Context, job *model.ExportJob) (int, error) {
	query := `
		INSERT INTO export_jobs (user_id, job_type, filters, status)
		VALUES (?, ?, ?, 'PENDING')
	`
	res, err := r.db.ExecContext(ctx, query, job.UserID, job.JobType, job.Filters)
	if err != nil {
		return 0, err
	}
	id, err := res.LastInsertId()
	return int(id), err
}

func (r *jobRepositoryImpl) GetExportJobs(ctx context.Context, page int, limit int) (utils.PaginatedResult[model.ExportJob], error) {
	query := `SELECT * FROM export_jobs ORDER BY created_at DESC`
	return utils.FetchPaginated[model.ExportJob](ctx, r.db, query, page, limit)
}

func (r *jobRepositoryImpl) GetExportJobByID(ctx context.Context, id int) (*model.ExportJob, error) {
	query := `SELECT * FROM export_jobs WHERE id = ?`
	var job model.ExportJob
	err := r.db.GetContext(ctx, &job, query, id)
	return &job, err
}

func (r *jobRepositoryImpl) UpdateExportJobStatus(ctx context.Context, id int, status string, filePath *string, errorMessage *string) error {
	query := `
		UPDATE export_jobs 
		SET status = ?, file_path = ?, error_message = ?
		WHERE id = ?
	`
	_, err := r.db.ExecContext(ctx, query, status, filePath, errorMessage, id)
	return err
}

func (r *jobRepositoryImpl) GetPendingExportJobs(ctx context.Context) ([]model.ExportJob, error) {
	query := `SELECT * FROM export_jobs WHERE status = 'PENDING' ORDER BY created_at ASC`
	var jobs []model.ExportJob
	err := r.db.SelectContext(ctx, &jobs, query)
	return jobs, err
}

func (r *jobRepositoryImpl) ClaimNextExportJob(ctx context.Context, tx *sqlx.Tx) (*model.ExportJob, error) {
	var job model.ExportJob
	query := `SELECT * FROM export_jobs WHERE status = 'PENDING' ORDER BY created_at ASC LIMIT 1 FOR UPDATE SKIP LOCKED`
	err := tx.GetContext(ctx, &job, query)
	if err != nil {
		return nil, err
	}
	_, err = tx.ExecContext(ctx, 
		"UPDATE export_jobs SET status = 'PROCESSING', processing_started_at = NOW() WHERE id = ?", job.ID)
	if err != nil {
		return nil, err
	}
	return &job, nil
}

func (r *jobRepositoryImpl) RecoverStuckExportJobs(ctx context.Context) (int, error) {
	query := `UPDATE export_jobs 
		SET status = 'FAILED', error_message = 'Timeout: proses melebihi batas waktu (15 menit)' 
		WHERE status = 'PROCESSING' 
		AND processing_started_at < NOW() - INTERVAL 15 MINUTE`
	res, err := r.db.ExecContext(ctx, query)
	if err != nil {
		return 0, err
	}
	affected, _ := res.RowsAffected()
	return int(affected), nil
}
