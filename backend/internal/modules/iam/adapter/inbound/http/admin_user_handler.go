package http

import (
	"net/http"

	iam_dto "github.com/dps-wmhris/backend/internal/modules/iam/application/dto"

	"github.com/dps-wmhris/backend/internal/modules/iam/port"
	"github.com/dps-wmhris/backend/internal/shared/middleware"
	"github.com/dps-wmhris/backend/internal/shared/utils"
	"github.com/gin-gonic/gin"
)

// AdminUserHandler handles administrative HTTP endpoints for managing user accounts and location assignments.
type AdminUserHandler struct {
	adminUserUseCase port.AdminUserUseCase
}

// NewAdminUserHandler constructs an AdminUserHandler with the given AdminUserUseCase.
func NewAdminUserHandler(adminUserUseCase port.AdminUserUseCase) *AdminUserHandler {
	return &AdminUserHandler{adminUserUseCase: adminUserUseCase}
}

// GetUsers returns all active user accounts for administrative management.
func (h *AdminUserHandler) GetUsers(c *gin.Context) {
	users, err := h.adminUserUseCase.GetAllUsers(c.Request.Context())
	if err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, "settings.user.fetch_failed", "INTERNAL_SERVER_ERROR")
		return
	}

	utils.RawResponse(c, http.StatusOK, gin.H{
		"success": true,
		"users":   users,
	})
}

// GetRoles returns all available roles for the user management dropdown (frontend compatibility alias).
func (h *AdminUserHandler) GetRoles(c *gin.Context) {
	roles, err := h.adminUserUseCase.GetRoles(c.Request.Context())
	if err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, "settings.roles.fetch_failed", "INTERNAL_SERVER_ERROR")
		return
	}

	utils.RawResponse(c, http.StatusOK, gin.H{
		"success": true,
		"roles":   roles, // Note: frontend might expect "roles" instead of "data" based on Node.js controller
	})
}

// CreateUser creates a new user account and publishes an audit log.
func (h *AdminUserHandler) CreateUser(c *gin.Context) {
	reqPtr, ok := utils.BindAndValidate[iam_dto.AdminCreateUserRequest](c)
	if !ok {
		return
	}
	req := *reqPtr

	adminID := middleware.GetUserID(c)
	newUser, err := h.adminUserUseCase.CreateUser(c.Request.Context(), req, adminID, c.ClientIP(), c.Request.UserAgent())
	if err != nil {
		utils.HandleDomainError(c, err)
		return
	}

	utils.SuccessResponse(c, http.StatusCreated, "settings.user.create_success", newUser)
}

// UpdateUser updates an existing user account by ID.
func (h *AdminUserHandler) UpdateUser(c *gin.Context) {
	targetID, ok := utils.ParseIntParam(c, "id")
	if !ok {
		return
	}

	reqPtr, ok := utils.BindAndValidate[iam_dto.AdminUpdateUserRequest](c)
	if !ok {
		return
	}
	req := *reqPtr

	adminID := middleware.GetUserID(c)
	err := h.adminUserUseCase.UpdateUser(c.Request.Context(), targetID, req, adminID, c.ClientIP(), c.Request.UserAgent())
	if err != nil {
		utils.HandleDomainError(c, err)
		return
	}

	utils.SuccessResponse(c, http.StatusOK, "settings.user.update_success", nil)
}

// DeleteUser soft-deletes a user account by ID.
func (h *AdminUserHandler) DeleteUser(c *gin.Context) {
	targetID, ok := utils.ParseIntParam(c, "id")
	if !ok {
		return
	}

	adminID := middleware.GetUserID(c)
	err := h.adminUserUseCase.DeleteUser(c.Request.Context(), targetID, adminID, c.ClientIP(), c.Request.UserAgent())
	if err != nil {
		utils.HandleDomainError(c, err)
		return
	}

	utils.SuccessResponse(c, http.StatusOK, "settings.user.delete_success", nil)
}

// GetUserLocations returns the list of warehouse location IDs assigned to a user.
func (h *AdminUserHandler) GetUserLocations(c *gin.Context) {
	targetID, ok := utils.ParseIntParam(c, "id")
	if !ok {
		return
	}

	locationIDs, err := h.adminUserUseCase.GetUserLocations(c.Request.Context(), targetID)
	if err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, "settings.user.fetch_locations_failed", "INTERNAL_SERVER_ERROR")
		return
	}

	utils.SuccessDataResponse(c, http.StatusOK, locationIDs)
}

// UpdateUserLocations replaces the warehouse location assignments for a user.
func (h *AdminUserHandler) UpdateUserLocations(c *gin.Context) {
	targetID, ok := utils.ParseIntParam(c, "id")
	if !ok {
		return
	}

	reqPtr, ok := utils.BindAndValidate[iam_dto.AdminUpdateUserLocationsRequest](c)
	if !ok {
		return
	}
	req := *reqPtr

	adminID := middleware.GetUserID(c)
	err := h.adminUserUseCase.UpdateUserLocations(c.Request.Context(), targetID, req, adminID, c.ClientIP(), c.Request.UserAgent())
	if err != nil {
		utils.HandleDomainError(c, err)
		return
	}

	utils.SuccessResponse(c, http.StatusOK, "settings.user.update_locations_success", nil)
}
