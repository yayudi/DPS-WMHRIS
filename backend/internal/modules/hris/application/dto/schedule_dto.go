package hris_dto

// CreateScheduleRequest defines the JSON payload for creating or overriding a user's shift on a date.
type CreateScheduleRequest struct {
	UserID  int    `json:"userId" binding:"required,min=1"`
	ShiftID int    `json:"shiftId" binding:"required,min=1"`
	Date    string `json:"date" binding:"required,datetime=2006-01-02"` // YYYY-MM-DD
}

// GetSchedulesRequest defines query parameters for fetching a user's schedules in a date range.
type GetSchedulesRequest struct {
	UserID    string `form:"userId" binding:"required"`
	StartDate string `form:"startDate" binding:"required,datetime=2006-01-02"`
	EndDate   string `form:"endDate" binding:"required,datetime=2006-01-02"`
}

// DeleteScheduleRequest defines query parameters for removing a user's schedule override on a date.
type DeleteScheduleRequest struct {
	UserID string `form:"userId" binding:"required"`
	Date   string `form:"date" binding:"required,datetime=2006-01-02"`
}

// ScheduleResponse represents a user schedule joined with its shift details.
type ScheduleResponse struct {
	ID              int    `json:"id" db:"id"`
	UserID          int    `json:"user_id" db:"user_id"`
	ShiftID         int    `json:"shift_id" db:"shift_id"`
	Date            string `json:"date" db:"date"`
	ShiftName       string `json:"shift_name" db:"shift_name"`
	StartTime       string `json:"start_time" db:"start_time"`
	EndTime         string `json:"end_time" db:"end_time"`
	FlexibleMinutes int    `json:"flexible_minutes" db:"flexible_minutes"`
}
