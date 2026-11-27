// Package iam_dto defines data transfer objects for the IAM application and adapter layers.
package iam_dto

// LoginRequest represents credentials submitted to POST /api/auth/login.
type LoginRequest struct {
	Username string `json:"username" binding:"required"`
	Password string `json:"password" binding:"required"`
}

// LoginResponse contains the signed JWT token and authenticated user profile.
type LoginResponse struct {
	Token    string      `json:"token"`
	UserInfo UserProfile `json:"user_info"`
}

// UserProfile represents the authenticated user's profile, permissions, and preferences.
type UserProfile struct {
	ID          int                `json:"id"`
	Username    string             `json:"username"`
	Nickname    string             `json:"nickname"`
	RoleID      int                `json:"role_id"`
	Permissions []string           `json:"permissions"`
	Preferences *UserPreferenceDTO `json:"preferences,omitempty"`
}

// UpdateProfileRequest represents the payload for self-service profile updates.
type UpdateProfileRequest struct {
	CurrentPassword string  `json:"currentPassword" binding:"required"`
	Nickname        *string `json:"nickname"`
	NewPassword     *string `json:"newPassword"`
}

// UserLocationResponse represents a warehouse location assigned to a user.
type UserLocationResponse struct {
	ID       int    `json:"id" db:"id"`
	Code     string `json:"code" db:"code"`
	Building string `json:"building" db:"building"`
	Floor    string `json:"floor" db:"floor"`
	Name     string `json:"name" db:"name"`
}
