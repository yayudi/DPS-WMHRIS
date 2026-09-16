package model

// UserSchedule represents the user_schedules table
type UserSchedule struct {
	ID      int    `json:"id" db:"id"`
	UserID  int    `json:"user_id" db:"user_id"`
	ShiftID int    `json:"shift_id" db:"shift_id"`
	Date    string `json:"date" db:"date"`
}
