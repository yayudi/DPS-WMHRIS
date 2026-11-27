package hris_dto

// CreateShiftRequest represents the JSON payload for creating a work shift.
type CreateShiftRequest struct {
	Name            string `json:"name" binding:"required"`
	StartTime       string `json:"start_time" binding:"required"` // HH:mm or HH:mm:ss (validated in domain)
	EndTime         string `json:"end_time" binding:"required"`
	WorkDays        string `json:"work_days" binding:"required"` // e.g. "1,2,3,4,5"
	FlexibleMinutes int    `json:"flexible_minutes" binding:"min=0"`
	IsDefault       bool   `json:"is_default"`
}

// UpdateShiftRequest represents the JSON payload for updating a work shift.
type UpdateShiftRequest struct {
	Name            string `json:"name" binding:"required"`
	StartTime       string `json:"start_time" binding:"required"`
	EndTime         string `json:"end_time" binding:"required"`
	WorkDays        string `json:"work_days" binding:"required"`
	FlexibleMinutes int    `json:"flexible_minutes" binding:"min=0"`
	IsDefault       bool   `json:"is_default"`
}
