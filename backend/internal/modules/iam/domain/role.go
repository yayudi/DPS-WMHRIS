package domain

// SuperAdminRoleID is the canonical role ID for the system Super Admin account.
const SuperAdminRoleID = 1

// Role represents a security role in the roles table (which has no created_at/updated_at columns).
type Role struct {
	ID          int     `db:"id" json:"id"`
	Name        string  `db:"name" json:"name"`
	Description *string `db:"description" json:"description"`
}
