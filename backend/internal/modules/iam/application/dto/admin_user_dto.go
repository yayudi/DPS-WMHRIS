package iam_dto

// AdminCreateUserRequest defines the payload for creating a new user via admin endpoints.
type AdminCreateUserRequest struct {
	Username              string  `json:"username" binding:"required"`
	Password              string  `json:"password" binding:"required"`
	RoleID                int     `json:"role_id" binding:"required"`
	Nickname              *string `json:"nickname"`
	ShiftID               *int    `json:"shift_id"`
	ExcludeFromAttendance bool    `json:"exclude_from_attendance"`
}

// AdminUpdateUserRequest defines the payload for updating an existing user via admin endpoints.
type AdminUpdateUserRequest struct {
	Username              *string `json:"username"`
	Nickname              *string `json:"nickname"`
	NewPassword           *string `json:"newPassword"`
	RoleID                *int    `json:"role_id"`
	ShiftID               *int    `json:"shift_id"`
	ExcludeFromAttendance *bool   `json:"exclude_from_attendance"`
}

// AdminUpdateUserLocationsRequest defines the payload for replacing a user's assigned location IDs.
type AdminUpdateUserLocationsRequest struct {
	LocationIDs []int `json:"locationIds"`
}

// AdminUserResponse represents a user row enriched with role and shift metadata for admin listings.
type AdminUserResponse struct {
	ID                    int     `json:"id" db:"id"`
	Username              string  `json:"username" db:"username"`
	Nickname              *string `json:"nickname" db:"nickname"`
	RoleID                int     `json:"role_id" db:"role_id"`
	RoleName              *string `json:"role_name" db:"role_name"`
	ShiftID               *int    `json:"shift_id" db:"shift_id"`
	ShiftName             *string `json:"shift_name" db:"shift_name"`
	ExcludeFromAttendance bool    `json:"exclude_from_attendance" db:"exclude_from_attendance"`
}
