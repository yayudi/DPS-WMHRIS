package http

import (
	"net/http"

	iam_dto "github.com/dps-wmhris/backend/internal/modules/iam/application/dto"

	"github.com/dps-wmhris/backend/internal/modules/iam/port"
	"github.com/dps-wmhris/backend/internal/shared/middleware"
	"github.com/dps-wmhris/backend/internal/shared/utils"
	"github.com/gin-gonic/gin"
)

type AdminUserHandler struct {
	adminUserUseCase port.AdminUserUseCase
}

func NewAdminUserHandler(adminUserUseCase port.AdminUserUseCase) *AdminUserHandler {
	return &AdminUserHandler{adminUserUseCase: adminUserUseCase}
}

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

// GetRoles acts as a proxy/alias for frontend compatibility
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

func (h *AdminUserHandler) CreateUser(c *gin.Context) {
	req_ptr, ok := utils.BindAndValidate[iam_dto.AdminCreateUserRequest](c)
	if !ok {
		return
	}
	req := *req_ptr

	adminID := middleware.GetUserID(c)
	newUser, err := h.adminUserUseCase.CreateUser(c.Request.Context(), req, adminID, c.ClientIP(), c.Request.UserAgent())
	if err != nil {
		utils.HandleDomainError(c, err)
		return
	}

	utils.SuccessResponse(c, http.StatusCreated, "settings.user.create_success", newUser)
}

func (h *AdminUserHandler) UpdateUser(c *gin.Context) {
	targetID, ok := utils.ParseIntParam(c, "id")
	if !ok {
		return
	}

	req_ptr, ok := utils.BindAndValidate[iam_dto.AdminUpdateUserRequest](c)
	if !ok {
		return
	}
	req := *req_ptr

	adminID := middleware.GetUserID(c)
	err := h.adminUserUseCase.UpdateUser(c.Request.Context(), targetID, req, adminID, c.ClientIP(), c.Request.UserAgent())
	if err != nil {
		utils.HandleDomainError(c, err)
		return
	}

	utils.SuccessResponse(c, http.StatusOK, "settings.user.update_success", nil)
}

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

func (h *AdminUserHandler) UpdateUserLocations(c *gin.Context) {
	targetID, ok := utils.ParseIntParam(c, "id")
	if !ok {
		return
	}

	req_ptr, ok := utils.BindAndValidate[iam_dto.AdminUpdateUserLocationsRequest](c)
	if !ok {
		return
	}
	req := *req_ptr

	adminID := middleware.GetUserID(c)
	err := h.adminUserUseCase.UpdateUserLocations(c.Request.Context(), targetID, req, adminID, c.ClientIP(), c.Request.UserAgent())
	if err != nil {
		utils.HandleDomainError(c, err)
		return
	}

	utils.SuccessResponse(c, http.StatusOK, "settings.user.update_locations_success", nil)
}
