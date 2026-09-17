package hris_dto

// CreateShiftRequest represents the payload for creating a shift
type CreateShiftRequest struct {
	Name            string `json:"name" validate:"required"`
	StartTime       string `json:"start_time" validate:"required,datetime=15:04"` // HH:mm format
	EndTime         string `json:"end_time" validate:"required,datetime=15:04"`
	WorkDays        string `json:"work_days" validate:"required"` // e.g. "1,2,3,4,5"
	FlexibleMinutes int    `json:"flexible_minutes" validate:"min=0"`
	IsDefault       bool   `json:"is_default"`
}

// UpdateShiftRequest represents the payload for updating a shift
type UpdateShiftRequest struct {
	Name            string `json:"name" validate:"required"`
	StartTime       string `json:"start_time" validate:"required,datetime=15:04"`
	EndTime         string `json:"end_time" validate:"required,datetime=15:04"`
	WorkDays        string `json:"work_days" validate:"required"`
	FlexibleMinutes int    `json:"flexible_minutes" validate:"min=0"`
	IsDefault       bool   `json:"is_default"`
}
