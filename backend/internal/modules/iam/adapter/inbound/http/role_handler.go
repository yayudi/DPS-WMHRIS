package http

import (
	"net/http"

	iam_dto "github.com/dps-wmhris/backend/internal/modules/iam/application/dto"

	"github.com/dps-wmhris/backend/internal/modules/iam/port"
	"github.com/dps-wmhris/backend/internal/shared/middleware"
	"github.com/dps-wmhris/backend/internal/shared/utils"
	"github.com/gin-gonic/gin"
)

type RoleHandler struct {
	roleUseCase port.RoleUseCase
}

func NewRoleHandler(roleUseCase port.RoleUseCase) *RoleHandler {
	return &RoleHandler{roleUseCase: roleUseCase}
}

func (h *RoleHandler) GetRoles(c *gin.Context) {
	roles, err := h.roleUseCase.GetRoles(c.Request.Context())
	if err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, "settings.roles.fetch_failed", "INTERNAL_SERVER_ERROR")
		return
	}

	utils.SuccessDataResponse(c, http.StatusOK, roles)
}

func (h *RoleHandler) GetPermissions(c *gin.Context) {
	permissions, err := h.roleUseCase.GetPermissions(c.Request.Context())
	if err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, "settings.roles.fetch_permissions_failed", "INTERNAL_SERVER_ERROR")
		return
	}

	utils.SuccessDataResponse(c, http.StatusOK, permissions)
}

func (h *RoleHandler) GetRolePermissions(c *gin.Context) {
	roleID, ok := utils.ParseIntParam(c, "id")
	if !ok {
		return
	}

	permissionIDs, err := h.roleUseCase.GetRolePermissions(c.Request.Context(), roleID)
	if err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, "settings.roles.fetch_role_permissions_failed", "INTERNAL_SERVER_ERROR")
		return
	}

	utils.SuccessDataResponse(c, http.StatusOK, permissionIDs)
}

func (h *RoleHandler) AssignPermissions(c *gin.Context) {
	roleID, ok := utils.ParseIntParam(c, "id")
	if !ok {
		return
	}

	req_ptr, ok := utils.BindAndValidate[iam_dto.AssignPermissionsRequest](c)
	if !ok {
		return
	}
	req := *req_ptr

	userID := middleware.GetUserID(c)
	err := h.roleUseCase.UpdateRolePermissions(c.Request.Context(), roleID, req, userID, c.ClientIP(), c.Request.UserAgent())
	if err != nil {
		utils.HandleDomainError(c, err)
		return
	}

	utils.SuccessResponse(c, http.StatusOK, "settings.roles.permissions_update_success", nil)
}

func (h *RoleHandler) CreateRole(c *gin.Context) {
	req_ptr, ok := utils.BindAndValidate[iam_dto.CreateRoleRequest](c)
	if !ok {
		return
	}
	req := *req_ptr

	userID := middleware.GetUserID(c)
	newID, err := h.roleUseCase.CreateRole(c.Request.Context(), req, userID, c.ClientIP(), c.Request.UserAgent())
	if err != nil {
		utils.HandleDomainError(c, err)
		return
	}

	utils.SuccessResponse(c, http.StatusCreated, "settings.roles.create_success", gin.H{
		"id": newID,
	})
}

func (h *RoleHandler) UpdateRole(c *gin.Context) {
	roleID, ok := utils.ParseIntParam(c, "id")
	if !ok {
		return
	}

	req_ptr, ok := utils.BindAndValidate[iam_dto.CreateRoleRequest](c)
	if !ok {
		return
	}
	req := *req_ptr

	userID := middleware.GetUserID(c)
	err := h.roleUseCase.UpdateRole(c.Request.Context(), roleID, req, userID, c.ClientIP(), c.Request.UserAgent())
	if err != nil {
		utils.HandleDomainError(c, err)
		return
	}

	utils.SuccessResponse(c, http.StatusOK, "settings.roles.update_success", nil)
}

func (h *RoleHandler) DeleteRole(c *gin.Context) {
	roleID, ok := utils.ParseIntParam(c, "id")
	if !ok {
		return
	}

	userID := middleware.GetUserID(c)
	err := h.roleUseCase.DeleteRole(c.Request.Context(), roleID, userID, c.ClientIP(), c.Request.UserAgent())
	if err != nil {
		utils.HandleDomainError(c, err)
		return
	}

	utils.SuccessResponse(c, http.StatusOK, "settings.roles.delete_success", nil)
}
