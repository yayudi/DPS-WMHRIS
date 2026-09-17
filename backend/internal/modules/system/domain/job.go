package domain

import "time"

// ImportJob represents the import_jobs table
type ImportJob struct {
	ID                  int        `json:"id" db:"id"`
	UserID              int        `json:"user_id" db:"user_id"`
	JobType             string     `json:"job_type" db:"job_type"`
	OriginalFilename    *string    `json:"original_filename" db:"original_filename"`
	FilePath            string     `json:"file_path" db:"file_path"`
	Status              string     `json:"status" db:"status"` // PENDING, PROCESSING, COMPLETED, FAILED, CANCELLED, COMPLETED_WITH_ERRORS
	LogSummary          *string    `json:"log_summary" db:"log_summary"`
	Notes               *string    `json:"notes" db:"notes"`
	ErrorLog            *string    `json:"error_log" db:"error_log"`
	CreatedAt           *time.Time `json:"created_at" db:"created_at"`
	UpdatedAt           *time.Time `json:"updated_at" db:"updated_at"`
	ProcessingStartedAt *time.Time `json:"processing_started_at" db:"processing_started_at"`
	TotalRecords        int        `json:"total_records" db:"total_records"`
	ProcessedRecords    int        `json:"processed_records" db:"processed_records"`
	Options             *string    `json:"options" db:"options"`
	RetryCount          int        `json:"retry_count" db:"retry_count"`
}

// ExportJob represents the export_jobs table
type ExportJob struct {
	ID                  int        `json:"id" db:"id"`
	UserID              int        `json:"user_id" db:"user_id"`
	Status              string     `json:"status" db:"status"` // PENDING, PROCESSING, COMPLETED, FAILED
	Filters             *string    `json:"filters" db:"filters"`
	JobType             string     `json:"job_type" db:"job_type"`
	FilePath            *string    `json:"file_path" db:"file_path"`
	ErrorMessage        *string    `json:"error_message" db:"error_message"`
	CreatedAt           *time.Time `json:"created_at" db:"created_at"`
	ProcessingStartedAt *time.Time `json:"processing_started_at" db:"processing_started_at"`
}
