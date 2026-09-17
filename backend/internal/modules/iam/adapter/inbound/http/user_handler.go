package http

import (
	"log"
	"net/http"

	iam_dto "github.com/dps-wmhris/backend/internal/modules/iam/application/dto"

	"github.com/dps-wmhris/backend/internal/modules/iam/port"
	"github.com/dps-wmhris/backend/internal/shared/utils"
	"github.com/gin-gonic/gin"
)

type UserHandler struct {
	userUseCase port.UserUseCase
}

func NewUserHandler(userUseCase port.UserUseCase) *UserHandler {
	return &UserHandler{userUseCase: userUseCase}
}

func (h *UserHandler) Login(c *gin.Context) {
	req_ptr, ok := utils.BindAndValidate[iam_dto.LoginRequest](c)
	if !ok {
		return
	}
	req := *req_ptr

	log.Printf("[LOGIN] Attempting login for username: %s", req.Username)

	res, err := h.userUseCase.Login(c.Request.Context(), req)
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

	user, err := h.userUseCase.GetProfile(c.Request.Context(), userID)
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

	req_ptr, ok := utils.BindAndValidate[iam_dto.UpdateProfileRequest](c)
	if !ok {
		return
	}
	req := *req_ptr

	updatedUser, err := h.userUseCase.UpdateProfile(c.Request.Context(), userID, req, c.ClientIP(), c.Request.UserAgent())
	if err != nil {
		utils.ErrorResponse(c, http.StatusBadRequest, err.Error(), "UPDATE_FAILED")
		return
	}

	utils.SuccessResponse(c, http.StatusOK, "Data akun berhasil diperbarui.", updatedUser)
}

func (h *UserHandler) GetMyLocations(c *gin.Context) {
	userID := c.GetInt("user_id")

	locations, err := h.userUseCase.GetMyLocations(c.Request.Context(), userID)
	if err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, "Gagal mengambil data lokasi", "INTERNAL_SERVER_ERROR")
		return
	}

	utils.SuccessResponse(c, http.StatusOK, "Data lokasi berhasil diambil.", locations)
}
