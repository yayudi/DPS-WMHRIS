package iam_dto

// CreateRoleRequest defines the payload for creating or updating a security role.
type CreateRoleRequest struct {
	Name        string  `json:"name" binding:"required"`
	Description *string `json:"description"`
}

// AssignPermissionsRequest defines the payload for assigning permission IDs to a role.
type AssignPermissionsRequest struct {
	PermissionIDs []int `json:"permissionIds"`
}

// RoleResponse represents a role entry returned by role management endpoints.
type RoleResponse struct {
	ID          int     `json:"id" db:"id"`
	Name        string  `json:"name" db:"name"`
	Description *string `json:"description" db:"description"`
}

// PermissionResponse represents a permission entry returned by RBAC endpoints.
type PermissionResponse struct {
	ID          int     `json:"id" db:"id"`
	Name        string  `json:"name" db:"name"`
	Description *string `json:"description" db:"description"`
	Group       *string `json:"group" db:"group"`
}
