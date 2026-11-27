// Package mysql implements MySQL outbound repository adapters for the system module.
package mysql

import (
	"context"
	"database/sql"
	"errors"

	system_domain "github.com/dps-wmhris/backend/internal/modules/system/domain"
	"github.com/dps-wmhris/backend/internal/modules/system/port"
	database "github.com/dps-wmhris/backend/internal/shared/database"
	"github.com/dps-wmhris/backend/internal/shared/utils"
	"github.com/jmoiron/sqlx"
)

// JobRepository aliases the hexagonal outbound port for backward compatibility.
type JobRepository = port.JobRepository

type jobRepositoryImpl struct {
	db *sqlx.DB
}

// NewJobRepository constructs a MySQL-backed JobRepository.
func NewJobRepository(db *sqlx.DB) port.JobRepository {
	return &jobRepositoryImpl{db: db}
}

// --- Import Jobs ---
func (r *jobRepositoryImpl) CreateImportJob(ctx context.Context, job *system_domain.ImportJob) (int, error) {
	query := `
		INSERT INTO import_jobs (user_id, job_type, original_filename, file_path, notes, options, status)
		VALUES (?, ?, ?, ?, ?, ?, 'PENDING')
	`
	ext := database.GetExt(ctx, r.db)
	res, err := ext.ExecContext(ctx, query, job.UserID, job.JobType, job.OriginalFilename, job.FilePath, job.Notes, job.Options)
	if err != nil {
		return 0, err
	}
	id, err := res.LastInsertId()
	return int(id), err
}

func (r *jobRepositoryImpl) GetImportJobs(ctx context.Context, page int, limit int, userID *int) (utils.PaginatedResult[system_domain.ImportJob], error) {
	query := `SELECT * FROM import_jobs`
	var args []any
	if userID != nil && *userID > 0 {
		query += ` WHERE user_id = ?`
		args = append(args, *userID)
	}
	query += ` ORDER BY id DESC`
	return database.FetchPaginated[system_domain.ImportJob](ctx, r.db, query, page, limit, args...)
}

func (r *jobRepositoryImpl) GetImportJobByID(ctx context.Context, id int) (*system_domain.ImportJob, error) {
	query := `SELECT * FROM import_jobs WHERE id = ?`
	var job system_domain.ImportJob
	ext := database.GetExt(ctx, r.db)
	err := ext.GetContext(ctx, &job, query, id)
	if err != nil {
		return nil, err
	}
	return &job, nil
}

func (r *jobRepositoryImpl) UpdateImportJobStatus(ctx context.Context, id int, status string, logSummary *string, errorLog *string) error {
	query := `
		UPDATE import_jobs 
		SET status = ?, log_summary = ?, error_log = ?, updated_at = CURRENT_TIMESTAMP
		WHERE id = ?
	`
	ext := database.GetExt(ctx, r.db)
	_, err := ext.ExecContext(ctx, query, status, logSummary, errorLog, id)
	return err
}

func (r *jobRepositoryImpl) UpdateImportJobProgress(ctx context.Context, id int, processed int, total int) error {
	ext := database.GetExt(ctx, r.db)
	_, err := ext.ExecContext(ctx,
		"UPDATE import_jobs SET processed_records = ?, total_records = ?, status = 'PROCESSING' WHERE id = ?",
		processed, total, id)
	return err
}

func (r *jobRepositoryImpl) GetPendingImportJobs(ctx context.Context) ([]system_domain.ImportJob, error) {
	query := `SELECT * FROM import_jobs WHERE status IN ('PENDING', 'PROCESSING') ORDER BY created_at ASC`
	var jobs []system_domain.ImportJob
	ext := database.GetExt(ctx, r.db)
	err := ext.SelectContext(ctx, &jobs, query)
	return jobs, err
}

func (r *jobRepositoryImpl) ClaimNextImportJob(ctx context.Context) (*system_domain.ImportJob, error) {
	var job system_domain.ImportJob
	query := `SELECT * FROM import_jobs WHERE status = 'PENDING' ORDER BY created_at ASC LIMIT 1 FOR UPDATE SKIP LOCKED`
	ext := database.GetExt(ctx, r.db)
	err := ext.GetContext(ctx, &job, query)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, nil
		}
		return nil, err
	}
	_, err = ext.ExecContext(ctx,
		"UPDATE import_jobs SET status = 'PROCESSING', processing_started_at = NOW() WHERE id = ?", job.ID)
	if err != nil {
		return nil, err
	}
	job.Status = system_domain.JobStatusProcessing
	return &job, nil
}

func (r *jobRepositoryImpl) RecoverStuckImportJobs(ctx context.Context) (int, error) {
	query := `UPDATE import_jobs 
		SET status = 'FAILED', log_summary = 'Timeout: proses melebihi batas waktu (15 menit)' 
		WHERE status = 'PROCESSING' 
		AND processing_started_at < NOW() - INTERVAL 15 MINUTE`
	ext := database.GetExt(ctx, r.db)
	res, err := ext.ExecContext(ctx, query)
	if err != nil {
		return 0, err
	}
	affected, _ := res.RowsAffected()
	return int(affected), nil
}

// --- Export Jobs ---

func (r *jobRepositoryImpl) CreateExportJob(ctx context.Context, job *system_domain.ExportJob) (int, error) {
	query := `
		INSERT INTO export_jobs (user_id, job_type, filters, status)
		VALUES (?, ?, ?, 'PENDING')
	`
	ext := database.GetExt(ctx, r.db)
	res, err := ext.ExecContext(ctx, query, job.UserID, job.JobType, job.Filters)
	if err != nil {
		return 0, err
	}
	id, err := res.LastInsertId()
	return int(id), err
}

func (r *jobRepositoryImpl) GetExportJobs(ctx context.Context, page int, limit int, userID *int) (utils.PaginatedResult[system_domain.ExportJob], error) {
	query := `SELECT * FROM export_jobs`
	var args []any
	if userID != nil && *userID > 0 {
		query += ` WHERE user_id = ?`
		args = append(args, *userID)
	}
	query += ` ORDER BY id DESC`
	return database.FetchPaginated[system_domain.ExportJob](ctx, r.db, query, page, limit, args...)
}

func (r *jobRepositoryImpl) GetExportJobByID(ctx context.Context, id int) (*system_domain.ExportJob, error) {
	query := `SELECT * FROM export_jobs WHERE id = ?`
	var job system_domain.ExportJob
	ext := database.GetExt(ctx, r.db)
	err := ext.GetContext(ctx, &job, query, id)
	if err != nil {
		return nil, err
	}
	return &job, nil
}

func (r *jobRepositoryImpl) UpdateExportJobStatus(ctx context.Context, id int, status string, filePath *string, errorMessage *string) error {
	query := `
		UPDATE export_jobs 
		SET status = ?, file_path = ?, error_message = ?
		WHERE id = ?
	`
	ext := database.GetExt(ctx, r.db)
	_, err := ext.ExecContext(ctx, query, status, filePath, errorMessage, id)
	return err
}

func (r *jobRepositoryImpl) GetPendingExportJobs(ctx context.Context) ([]system_domain.ExportJob, error) {
	query := `SELECT * FROM export_jobs WHERE status = 'PENDING' ORDER BY created_at ASC`
	var jobs []system_domain.ExportJob
	ext := database.GetExt(ctx, r.db)
	err := ext.SelectContext(ctx, &jobs, query)
	return jobs, err
}

func (r *jobRepositoryImpl) ClaimNextExportJob(ctx context.Context) (*system_domain.ExportJob, error) {
	var job system_domain.ExportJob
	query := `SELECT * FROM export_jobs WHERE status = 'PENDING' ORDER BY created_at ASC LIMIT 1 FOR UPDATE SKIP LOCKED`
	ext := database.GetExt(ctx, r.db)
	err := ext.GetContext(ctx, &job, query)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, nil
		}
		return nil, err
	}
	_, err = ext.ExecContext(ctx,
		"UPDATE export_jobs SET status = 'PROCESSING', processing_started_at = NOW() WHERE id = ?", job.ID)
	if err != nil {
		return nil, err
	}
	job.Status = system_domain.JobStatusProcessing
	return &job, nil
}

func (r *jobRepositoryImpl) RecoverStuckExportJobs(ctx context.Context) (int, error) {
	query := `UPDATE export_jobs 
		SET status = 'FAILED', error_message = 'Timeout: proses melebihi batas waktu (15 menit)' 
		WHERE status = 'PROCESSING' 
		AND processing_started_at < NOW() - INTERVAL 15 MINUTE`
	ext := database.GetExt(ctx, r.db)
	res, err := ext.ExecContext(ctx, query)
	if err != nil {
		return 0, err
	}
	affected, _ := res.RowsAffected()
	return int(affected), nil
}
