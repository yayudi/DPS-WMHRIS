package handler

import (
	"github.com/dps-wmhris/backend/internal/utils"
	"log"
	"net/http"

	"github.com/dps-wmhris/backend/internal/dto"
	"github.com/dps-wmhris/backend/internal/service"
	"github.com/gin-gonic/gin"
)

type UserHandler struct {
	userService service.UserService
}

func NewUserHandler(userService service.UserService) *UserHandler {
	return &UserHandler{userService: userService}
}

func (h *UserHandler) Login(c *gin.Context) {
	req_ptr, ok := utils.BindAndValidate[dto.LoginRequest](c)
	if !ok {
		return
	}
	req := *req_ptr

	log.Printf("[LOGIN] Attempting login for username: %s", req.Username)

	res, err := h.userService.Login(c.Request.Context(), req)
	if err != nil {
		log.Printf("[LOGIN] Login failed for user %s: %v", req.Username, err)
		utils.ErrorResponse(c, http.StatusUnauthorized, err.Error(), "UNAUTHORIZED")
		return
	}

	log.Printf("[LOGIN] Login success for user: %s (ID: %d)", res.UserInfo.Username, res.UserInfo.ID)
	
	// Set JWT to HttpOnly Cookie
	c.SetCookie("token", res.Token, 86400*7, "/", "", false, true) // 7 days, HttpOnly

	utils.RawResponse(c, http.StatusOK, gin.H{
		"success": true,
		"message": "Login berhasil",
		"token":   res.Token,
		"user":    res.UserInfo,
	})
}

func (h *UserHandler) Logout(c *gin.Context) {
	c.SetCookie("token", "", -1, "/", "", false, true)
	utils.SuccessResponse(c, http.StatusOK, "Logged out", nil)
}

func (h *UserHandler) GetProfile(c *gin.Context) {
	userID := c.GetInt("user_id")
	log.Printf("[PROFILE] Fetching profile for user_id: %v", userID)
	
	user, err := h.userService.GetProfile(c.Request.Context(), userID)
	if err != nil {
		log.Printf("[PROFILE] Failed to fetch profile for user_id %d: %v", userID, err)
		utils.ErrorResponse(c, http.StatusNotFound, err.Error(), "NOT_FOUND")
		return
	}

	log.Printf("[PROFILE] Profile fetched successfully for user_id %d", userID)

	utils.SuccessResponse(c, http.StatusOK, "Data profil berhasil diambil.", user)
}

func (h *UserHandler) UpdateProfile(c *gin.Context) {
	userID := c.GetInt("user_id")
	
	req_ptr, ok := utils.BindAndValidate[dto.UpdateProfileRequest](c)
	if !ok {
		return
	}
	req := *req_ptr

	updatedUser, err := h.userService.UpdateProfile(c.Request.Context(), userID, req, c.ClientIP(), c.Request.UserAgent())
	if err != nil {
		utils.ErrorResponse(c, http.StatusBadRequest, err.Error(), "UPDATE_FAILED")
		return
	}

	utils.SuccessResponse(c, http.StatusOK, "Data akun berhasil diperbarui.", updatedUser)
}

func (h *UserHandler) GetMyLocations(c *gin.Context) {
	userID := c.GetInt("user_id")
	
	locations, err := h.userService.GetMyLocations(c.Request.Context(), userID)
	if err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, "Gagal mengambil data lokasi", "INTERNAL_SERVER_ERROR")
		return
	}

	utils.SuccessResponse(c, http.StatusOK, "Data lokasi berhasil diambil.", locations)
}
