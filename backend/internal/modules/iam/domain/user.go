// Package domain contains core entities, value objects, and domain invariants for the IAM bounded context.
package domain

import (
	"github.com/dps-wmhris/backend/internal/shared/kernel"
)

// User represents an application account in the users table.
type User struct {
	kernel.BaseEntity
	Username              string `db:"username" json:"username"`
	Nickname              string `db:"nickname" json:"nickname"`
	IsActive              bool   `db:"is_active" json:"is_active"`
	PasswordHash          string `db:"password_hash" json:"-"`
	RoleID                int    `db:"role_id" json:"role_id"`
	ShiftID               *int   `db:"shift_id" json:"shift_id"`
	ExcludeFromAttendance bool   `db:"exclude_from_attendance" json:"exclude_from_attendance"`
}

// UserUpdateParams defines typed mutable fields for administrative user updates,
// keeping raw SQL column expressions out of the application use-case layer.
type UserUpdateParams struct {
	Username              *string
	Nickname              *string
	PasswordHash          *string
	RoleID                *int
	ShiftID               *int
	ExcludeFromAttendance *bool
}

// HasUpdates reports whether at least one field in UserUpdateParams is set for modification.
func (p UserUpdateParams) HasUpdates() bool {
	return p.Username != nil ||
		p.Nickname != nil ||
		p.PasswordHash != nil ||
		p.RoleID != nil ||
		p.ShiftID != nil ||
		p.ExcludeFromAttendance != nil
}
