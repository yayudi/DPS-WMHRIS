package model

import (
	database "github.com/dps-wmhris/backend/internal/shared/database"
)

type User struct {
	database.BaseEntity
	Username              string `db:"username" json:"username"`
	Nickname              string `db:"nickname" json:"nickname"`
	IsActive              bool   `db:"is_active" json:"is_active"`
	PasswordHash          string `db:"password_hash" json:"-"` // Tidak akan terekspos di output JSON
	RoleID                int    `db:"role_id" json:"role_id"`
	ShiftID               *int   `db:"shift_id" json:"shift_id"` // Menggunakan pointer untuk mendukung NULL secara native di Go
	ExcludeFromAttendance bool   `db:"exclude_from_attendance" json:"exclude_from_attendance"`
}
