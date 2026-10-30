package domain

import (
	"github.com/dps-wmhris/backend/internal/shared/kernel"
)

// Shift represents the shifts table
type Shift struct {
	kernel.BaseEntity
	Name            string `json:"name" db:"name"`
	StartTime       string `json:"start_time" db:"start_time"`
	EndTime         string `json:"end_time" db:"end_time"`
	WorkDays        string `json:"work_days" db:"work_days"`
	FlexibleMinutes int    `json:"flexible_minutes" db:"flexible_minutes"`
	IsDefault       bool   `json:"is_default" db:"is_default"`
}
