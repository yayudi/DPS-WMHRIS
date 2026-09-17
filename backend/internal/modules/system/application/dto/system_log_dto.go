package system_dto

import "time"

type GetSystemLogsRequest struct {
	Page       int    `form:"page,default=1"`
	Limit      int    `form:"limit,default=20"`
	Search     string `form:"search"`
	Action     string `form:"action"`
	TargetType string `form:"targetType"`
	UserID     string `form:"userId"`
	StartDate  string `form:"startDate"`
	EndDate    string `form:"endDate"`
}

type SystemLogResponse struct {
	ID         int       `json:"id" db:"id"`
	UserID     int       `json:"user_id" db:"user_id"`
	Action     string    `json:"action" db:"action"`
	TargetType string    `json:"target_type" db:"target_type"`
	TargetID   string    `json:"target_id" db:"target_id"`
	Changes    *string   `json:"changes" db:"changes"`
	IPAddress  *string   `json:"ip_address" db:"ip_address"`
	UserAgent  *string   `json:"user_agent" db:"user_agent"`
	CreatedAt  time.Time `json:"created_at" db:"created_at"`

	Username   *string `json:"username" db:"username"`
	Nickname   *string `json:"nickname" db:"nickname"`
	Role       *string `json:"role" db:"role"`
	TargetName *string `json:"target_name" db:"target_name"`
}

type GetSystemLogsResponse struct {
	Data  []SystemLogResponse `json:"data"`
	Total int                 `json:"total"`
}

type CreateLogRequest struct {
	UserID     int     `json:"user_id"`
	Action     string  `json:"action"`
	TargetType string  `json:"target_type"`
	TargetID   string  `json:"target_id"`
	Changes    *string `json:"changes,omitempty"`
	IP         *string `json:"ip,omitempty"`
	UserAgent  *string `json:"user_agent,omitempty"`
}
