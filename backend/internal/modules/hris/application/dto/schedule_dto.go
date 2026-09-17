package hris_dto

type CreateScheduleRequest struct {
	UserID  int    `json:"userId" validate:"required,min=1"`
	ShiftID int    `json:"shiftId" validate:"required,min=1"`
	Date    string `json:"date" validate:"required,datetime=2006-01-02"` // YYYY-MM-DD
}

type GetSchedulesRequest struct {
	UserID    string `form:"userId" validate:"required"`
	StartDate string `form:"startDate" validate:"required,datetime=2006-01-02"`
	EndDate   string `form:"endDate" validate:"required,datetime=2006-01-02"`
}

type DeleteScheduleRequest struct {
	UserID string `form:"userId" validate:"required"`
	Date   string `form:"date" validate:"required,datetime=2006-01-02"`
}

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
