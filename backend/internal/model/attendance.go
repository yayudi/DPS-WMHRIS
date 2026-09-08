package model

import "time"

type AttendanceLog struct {
	ID              int        `json:"id" db:"id"`
	Username        string     `json:"username" db:"username"`
	Date            string     `json:"date" db:"date"`
	CheckIn         *string    `json:"check_in" db:"check_in"`
	CheckOut        *string    `json:"check_out" db:"check_out"`
	LatenessMinutes   int        `json:"lateness_minutes" db:"lateness_minutes"`
	OvertimeMinutes   int        `json:"overtime_minutes" db:"overtime_minutes"`
	LatePardonMinutes int        `json:"late_pardon_minutes" db:"late_pardon_minutes"`
	Status            *string    `json:"status" db:"status"`
	Notes           *string    `json:"notes" db:"notes"`
}

type AttendanceRawLog struct {
	ID              int    `json:"id" db:"id"`
	AttendanceLogID int    `json:"attendance_log_id" db:"attendance_log_id"`
	LogTime         string `json:"log_time" db:"log_time"`
	LogType         string `json:"log_type" db:"log_type"`
}

type Holiday struct {
	Date time.Time `json:"date" db:"date"`
	Name string    `json:"name" db:"name"`
}
