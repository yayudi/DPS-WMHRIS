// Package hris_dto defines request and response DTOs for the HRIS module.
package hris_dto

// GetHistoryRequest defines query parameters for fetching attendance history records.
type GetHistoryRequest struct {
	StartDate string `form:"startDate" binding:"required,datetime=2006-01-02"`
	EndDate   string `form:"endDate" binding:"required,datetime=2006-01-02"`
	Search    string `form:"search"`
}

// GetRangeDataRequest defines query parameters for fetching attendance summary data across a date range.
type GetRangeDataRequest struct {
	StartDate string `form:"startDate" binding:"required,datetime=2006-01-02"`
	EndDate   string `form:"endDate" binding:"required,datetime=2006-01-02"`
}

// UpdateLogRequest defines the JSON payload for manually updating a user's attendance log.
type UpdateLogRequest struct {
	Username          string  `json:"username" binding:"required"`
	Date              string  `json:"date" binding:"required,datetime=2006-01-02"`
	TimeIn            *string `json:"timeIn"`
	TimeOut           *string `json:"timeOut"`
	Status            string  `json:"status"`
	LatePardonMinutes *int    `json:"latePardonMinutes" binding:"omitempty,min=0"`
	Notes             *string `json:"notes"`
}

// AttendanceRangeResponse wraps active employee list, attendance log rows, and working-day calendar summary.
type AttendanceRangeResponse struct {
	AllUsers   []map[string]any `json:"allUsers"`
	LogRows    []map[string]any `json:"logRows"`
	GlobalInfo map[string]any   `json:"globalInfo"`
}
