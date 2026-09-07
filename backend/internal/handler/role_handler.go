package handler

import (
	"net/http"
	"strconv"

	"github.com/dps-wmhris/backend/internal/dto"
	"github.com/dps-wmhris/backend/internal/service"
	"github.com/dps-wmhris/backend/internal/utils"
	"github.com/gin-gonic/gin"
)

type RoleHandler struct {
	roleService service.RoleService
}

func NewRoleHandler(roleService service.RoleService) *RoleHandler {
	return &RoleHandler{roleService: roleService}
}

func (h *RoleHandler) GetRoles(c *gin.Context) {
	roles, err := h.roleService.GetRoles(c.Request.Context())
	if err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, "Gagal mengambil data peran", "INTERNAL_SERVER_ERROR")
		return
	}

	utils.SuccessDataResponse(c, http.StatusOK, roles)
}

func (h *RoleHandler) GetPermissions(c *gin.Context) {
	permissions, err := h.roleService.GetPermissions(c.Request.Context())
	if err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, "Gagal mengambil data izin", "INTERNAL_SERVER_ERROR")
		return
	}

	utils.SuccessDataResponse(c, http.StatusOK, permissions)
}

func (h *RoleHandler) GetRolePermissions(c *gin.Context) {
	roleID, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		utils.ErrorResponse(c, http.StatusBadRequest, "ID Peran tidak valid", "INVALID_ID")
		return
	}

	permissionIDs, err := h.roleService.GetRolePermissions(c.Request.Context(), roleID)
	if err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, "Gagal mengambil izin peran", "INTERNAL_SERVER_ERROR")
		return
	}

	utils.SuccessDataResponse(c, http.StatusOK, permissionIDs)
}

func (h *RoleHandler) AssignPermissions(c *gin.Context) {
	roleID, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		utils.ErrorResponse(c, http.StatusBadRequest, "ID Peran tidak valid", "INVALID_ID")
		return
	}

	req_ptr, ok := utils.BindAndValidate[dto.AssignPermissionsRequest](c)
	if !ok {
		return
	}
	req := *req_ptr

	userID := c.GetInt("user_id")
	err = h.roleService.UpdateRolePermissions(c.Request.Context(), roleID, req, userID, c.ClientIP(), c.Request.UserAgent())
	if err != nil {
		utils.ErrorResponse(c, http.StatusBadRequest, "Gagal memperbarui izin. " + err.Error(), "UPDATE_FAILED")
		return
	}

	utils.SuccessResponse(c, http.StatusOK, "Izin berhasil diperbarui", nil)
}

func (h *RoleHandler) CreateRole(c *gin.Context) {
	req_ptr, ok := utils.BindAndValidate[dto.CreateRoleRequest](c)
	if !ok {
		return
	}
	req := *req_ptr

	userID := c.GetInt("user_id")
	newID, err := h.roleService.CreateRole(c.Request.Context(), req, userID, c.ClientIP(), c.Request.UserAgent())
	if err != nil {
		utils.ErrorResponse(c, http.StatusBadRequest, "Gagal membuat peran", "CREATE_FAILED")
		return
	}

	utils.RawResponse(c, http.StatusCreated, gin.H{
		"success": true,
		"message": "Peran berhasil dibuat",
		"data": gin.H{
			"id": newID,
		},
	})
}

func (h *RoleHandler) UpdateRole(c *gin.Context) {
	roleID, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		utils.ErrorResponse(c, http.StatusBadRequest, "ID Peran tidak valid", "INVALID_ID")
		return
	}

	req_ptr, ok := utils.BindAndValidate[dto.CreateRoleRequest](c)
	if !ok {
		return
	}
	req := *req_ptr

	userID := c.GetInt("user_id")
	err = h.roleService.UpdateRole(c.Request.Context(), roleID, req, userID, c.ClientIP(), c.Request.UserAgent())
	if err != nil {
		utils.ErrorResponse(c, http.StatusBadRequest, err.Error(), "UPDATE_FAILED")
		return
	}

	utils.SuccessResponse(c, http.StatusOK, "Peran berhasil diperbarui", nil)
}

func (h *RoleHandler) DeleteRole(c *gin.Context) {
	roleID, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		utils.ErrorResponse(c, http.StatusBadRequest, "ID Peran tidak valid", "INVALID_ID")
		return
	}

	userID := c.GetInt("user_id")
	err = h.roleService.DeleteRole(c.Request.Context(), roleID, userID, c.ClientIP(), c.Request.UserAgent())
	if err != nil {
		utils.ErrorResponse(c, http.StatusBadRequest, "Gagal menghapus peran (mungkin sedang digunakan).", "DELETE_FAILED")
		return
	}

	utils.SuccessResponse(c, http.StatusOK, "Peran berhasil dihapus", nil)
}
