package system_dto

type CreateImportJobRequest struct {
	UserID           int
	JobType          string
	OriginalFilename string
	FilePath         string
	Notes            *string
	Options          *string
}

type CreateExportJobRequest struct {
	UserID  int
	JobType string
	Filters *string
}
