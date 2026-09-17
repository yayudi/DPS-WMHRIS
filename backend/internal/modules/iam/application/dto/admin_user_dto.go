package iam_dto

type AdminCreateUserRequest struct {
	Username              string  `json:"username" binding:"required"`
	Password              string  `json:"password" binding:"required"`
	RoleID                int     `json:"role_id" binding:"required"`
	Nickname              *string `json:"nickname"`
	ShiftID               *int    `json:"shift_id"`
	ExcludeFromAttendance bool    `json:"exclude_from_attendance"`
}

type AdminUpdateUserRequest struct {
	Username              *string `json:"username"`
	Nickname              *string `json:"nickname"`
	NewPassword           *string `json:"newPassword"`
	RoleID                *int    `json:"role_id"`
	ShiftID               *int    `json:"shift_id"`
	ExcludeFromAttendance *bool   `json:"exclude_from_attendance"`
}

type AdminUpdateUserLocationsRequest struct {
	LocationIDs []int `json:"locationIds"`
}

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
