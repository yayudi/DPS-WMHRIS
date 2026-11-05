package iam_dto

import "time"

// UserPreferenceDTO represents the public output format for a user's preferences.
type UserPreferenceDTO struct {
	UserID     int       `json:"user_id"`
	Locale     string    `json:"locale"`
	Theme      string    `json:"theme"`
	Timezone   string    `json:"timezone"`
	DateFormat string    `json:"date_format"`
	UpdatedAt  time.Time `json:"updated_at"`
}

// UpdatePreferenceRequest defines the payload for updating personal preferences.
type UpdatePreferenceRequest struct {
	Locale     *string `json:"locale" binding:"omitempty,min=2,max=10"`
	Theme      *string `json:"theme" binding:"omitempty,oneof=light dark system"`
	Timezone   *string `json:"timezone" binding:"omitempty,max=50"`
	DateFormat *string `json:"date_format" binding:"omitempty,max=20"`
}

