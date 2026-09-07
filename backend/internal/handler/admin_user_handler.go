package handler

import (
	"net/http"
	"strconv"
	"strings"

	"github.com/dps-wmhris/backend/internal/dto"
	"github.com/dps-wmhris/backend/internal/service"
	"github.com/dps-wmhris/backend/internal/utils"
	"github.com/gin-gonic/gin"
)

type AdminUserHandler struct {
	adminUserService service.AdminUserService
}

func NewAdminUserHandler(adminUserService service.AdminUserService) *AdminUserHandler {
	return &AdminUserHandler{adminUserService: adminUserService}
}

func (h *AdminUserHandler) GetUsers(c *gin.Context) {
	users, err := h.adminUserService.GetAllUsers(c.Request.Context())
	if err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, "Gagal mengambil data user", "INTERNAL_SERVER_ERROR")
		return
	}

	utils.RawResponse(c, http.StatusOK, gin.H{
		"success": true,
		"users":   users,
	})
}

// GetRoles acts as a proxy/alias for frontend compatibility
func (h *AdminUserHandler) GetRoles(c *gin.Context) {
	roles, err := h.adminUserService.GetRoles(c.Request.Context())
	if err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, "Gagal mengambil data role", "INTERNAL_SERVER_ERROR")
		return
	}

	utils.RawResponse(c, http.StatusOK, gin.H{
		"success": true,
		"roles":   roles, // Note: frontend might expect "roles" instead of "data" based on Node.js controller
	})
}

func (h *AdminUserHandler) CreateUser(c *gin.Context) {
	req_ptr, ok := utils.BindAndValidate[dto.AdminCreateUserRequest](c)
	if !ok {
		return
	}
	req := *req_ptr

	adminID := c.GetInt("user_id")
	newUser, err := h.adminUserService.CreateUser(c.Request.Context(), req, adminID, c.ClientIP(), c.Request.UserAgent())
	if err != nil {
		if strings.Contains(err.Error(), "1062") || strings.Contains(err.Error(), "Duplicate") {
			utils.ErrorResponse(c, http.StatusConflict, "Username sudah digunakan.", "CONFLICT")
			return
		}
		utils.ErrorResponse(c, http.StatusInternalServerError, "Gagal membuat pengguna", "CREATE_FAILED")
		return
	}

	utils.SuccessResponse(c, http.StatusCreated, "Pengguna berhasil dibuat.", newUser)
}

func (h *AdminUserHandler) UpdateUser(c *gin.Context) {
	targetID, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		utils.ErrorResponse(c, http.StatusBadRequest, "ID Pengguna tidak valid", "INVALID_ID")
		return
	}

	req_ptr, ok := utils.BindAndValidate[dto.AdminUpdateUserRequest](c)
	if !ok {
		return
	}
	req := *req_ptr

	adminID := c.GetInt("user_id")
	err = h.adminUserService.UpdateUser(c.Request.Context(), targetID, req, adminID, c.ClientIP(), c.Request.UserAgent())
	if err != nil {
		if strings.Contains(err.Error(), "1062") || strings.Contains(err.Error(), "Duplicate") {
			utils.ErrorResponse(c, http.StatusConflict, "Username sudah digunakan.", "CONFLICT")
			return
		}
		utils.ErrorResponse(c, http.StatusInternalServerError, "Gagal memperbarui data pengguna: " + err.Error(), "UPDATE_FAILED")
		return
	}

	utils.SuccessResponse(c, http.StatusOK, "Data pengguna berhasil diperbarui.", nil)
}

func (h *AdminUserHandler) DeleteUser(c *gin.Context) {
	targetID, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		utils.ErrorResponse(c, http.StatusBadRequest, "ID Pengguna tidak valid", "INVALID_ID")
		return
	}

	adminID := c.GetInt("user_id")
	err = h.adminUserService.DeleteUser(c.Request.Context(), targetID, adminID, c.ClientIP(), c.Request.UserAgent())
	if err != nil {
		status := http.StatusInternalServerError
		if err.Error() == "anda tidak bisa menghapus akun anda sendiri" || err.Error() == "user tidak ditemukan" {
			status = http.StatusBadRequest
		}
		c.JSON(status, gin.H{
			"success": false,
			"message": err.Error(),
			"error_code": "DELETE_FAILED",
		})
		return
	}

	utils.SuccessResponse(c, http.StatusOK, "User berhasil dihapus.", nil)
}

func (h *AdminUserHandler) GetUserLocations(c *gin.Context) {
	targetID, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		utils.ErrorResponse(c, http.StatusBadRequest, "ID Pengguna tidak valid", "INVALID_ID")
		return
	}

	locationIDs, err := h.adminUserService.GetUserLocations(c.Request.Context(), targetID)
	if err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, "Gagal mengambil lokasi user", "INTERNAL_SERVER_ERROR")
		return
	}

	utils.SuccessDataResponse(c, http.StatusOK, locationIDs)
}

func (h *AdminUserHandler) UpdateUserLocations(c *gin.Context) {
	targetID, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		utils.ErrorResponse(c, http.StatusBadRequest, "ID Pengguna tidak valid", "INVALID_ID")
		return
	}

	req_ptr, ok := utils.BindAndValidate[dto.AdminUpdateUserLocationsRequest](c)
	if !ok {
		return
	}
	req := *req_ptr

	adminID := c.GetInt("user_id")
	err = h.adminUserService.UpdateUserLocations(c.Request.Context(), targetID, req, adminID, c.ClientIP(), c.Request.UserAgent())
	if err != nil {
		if strings.Contains(err.Error(), "1452") || strings.Contains(err.Error(), "foreign key") {
			utils.ErrorResponse(c, http.StatusBadRequest, "Satu atau lebih ID lokasi tidak valid.", "INVALID_REFERENCE")
			return
		}
		utils.ErrorResponse(c, http.StatusInternalServerError, "Gagal memperbarui izin lokasi pengguna", "UPDATE_FAILED")
		return
	}

	utils.SuccessResponse(c, http.StatusOK, "Izin lokasi pengguna berhasil diperbarui.", nil)
}
