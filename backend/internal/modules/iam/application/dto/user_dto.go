package iam_dto

type LoginRequest struct {
	Username string `json:"username" binding:"required"`
	Password string `json:"password" binding:"required"`
}

type LoginResponse struct {
	Token    string      `json:"token"`
	UserInfo UserProfile `json:"user_info"`
}

type UserProfile struct {
	ID          int      `json:"id"`
	Username    string   `json:"username"`
	Nickname    string   `json:"nickname"`
	RoleID      int      `json:"role_id"`
	Permissions []string `json:"permissions"`
}

type UpdateProfileRequest struct {
	CurrentPassword string  `json:"currentPassword" binding:"required"`
	Nickname        *string `json:"nickname"`
	NewPassword     *string `json:"newPassword"`
}

type UserLocationResponse struct {
	ID       int    `json:"id" db:"id"`
	Code     string `json:"code" db:"code"`
	Building string `json:"building" db:"building"`
	Floor    string `json:"floor" db:"floor"`
	Name     string `json:"name" db:"name"`
}
