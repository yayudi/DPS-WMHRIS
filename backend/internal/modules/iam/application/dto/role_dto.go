package iam_dto

type CreateRoleRequest struct {
	Name        string  `json:"name" binding:"required"`
	Description *string `json:"description"`
}

type AssignPermissionsRequest struct {
	PermissionIDs []int `json:"permissionIds"` // Should not be strictly required as it can be empty to remove all
}

type RoleResponse struct {
	ID          int     `json:"id" db:"id"`
	Name        string  `json:"name" db:"name"`
	Description *string `json:"description" db:"description"`
}

type PermissionResponse struct {
	ID          int     `json:"id" db:"id"`
	Name        string  `json:"name" db:"name"`
	Description *string `json:"description" db:"description"`
	Group       *string `json:"group" db:"group"`
}
