// Package system_dto defines request, filter, and response DTOs for the system module.
package system_dto

// CreateImportJobRequest carries metadata to enqueue a background import job.
type CreateImportJobRequest struct {
	UserID           int
	JobType          string
	OriginalFilename string
	FilePath         string
	Notes            *string
	Options          *string
}

// CreateExportJobRequest carries metadata and JSON filter criteria to enqueue an export job.
type CreateExportJobRequest struct {
	UserID  int
	JobType string
	Filters *string
}
