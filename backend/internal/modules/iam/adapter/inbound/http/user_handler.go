package http

import (
	"errors"
	"log"
	"net/http"

	iam_dto "github.com/dps-wmhris/backend/internal/modules/iam/application/dto"
	"github.com/dps-wmhris/backend/internal/modules/iam/domain"
	"github.com/dps-wmhris/backend/internal/modules/iam/port"
	"github.com/dps-wmhris/backend/internal/shared/i18n"
	"github.com/dps-wmhris/backend/internal/shared/middleware"
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
		utils.HandleDomainError(c, err)
		return
	}

	log.Printf("[LOGIN] Login success for user: %s (ID: %d)", res.UserInfo.Username, res.UserInfo.ID)

	// Set JWT to HttpOnly Cookie
	c.SetCookie("token", res.Token, 86400*7, "/", "", false, true) // 7 days, HttpOnly

	utils.RawResponse(c, http.StatusOK, gin.H{
		"success": true,
		"message": i18n.TranslateByLocale(c.Request.Context(), c.GetString(i18n.GinLocaleKey), "auth.login.success"),
		"token":   res.Token,
		"user":    res.UserInfo,
	})
}

func (h *UserHandler) Logout(c *gin.Context) {
	c.SetCookie("token", "", -1, "/", "", false, true)
	utils.SuccessResponse(c, http.StatusOK, "auth.login.logout_success", nil)
}

func (h *UserHandler) GetProfile(c *gin.Context) {
	userID := middleware.GetUserID(c)
	log.Printf("[PROFILE] Fetching profile for user_id: %v", userID)

	user, err := h.userUseCase.GetProfile(c.Request.Context(), userID)
	if err != nil {
		log.Printf("[PROFILE] Failed to fetch profile for user_id %d: %v", userID, err)
		utils.HandleDomainError(c, err)
		return
	}

	log.Printf("[PROFILE] Profile fetched successfully for user_id %d", userID)

	utils.SuccessDataResponse(c, http.StatusOK, user)
}

func (h *UserHandler) UpdateProfile(c *gin.Context) {
	userID := middleware.GetUserID(c)

	req_ptr, ok := utils.BindAndValidate[iam_dto.UpdateProfileRequest](c)
	if !ok {
		return
	}
	req := *req_ptr

	updatedUser, err := h.userUseCase.UpdateProfile(c.Request.Context(), userID, req, c.ClientIP(), c.Request.UserAgent())
	if err != nil {
		utils.HandleDomainError(c, err)
		return
	}

	utils.SuccessResponse(c, http.StatusOK, "auth.profile.toast_account_updated", updatedUser)
}

func (h *UserHandler) GetMyLocations(c *gin.Context) {
	userID := middleware.GetUserID(c)

	locations, err := h.userUseCase.GetMyLocations(c.Request.Context(), userID)
	if err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, "auth.profile.locations_fetch_failed", "INTERNAL_SERVER_ERROR")
		return
	}

	utils.SuccessDataResponse(c, http.StatusOK, locations)
}

func (h *UserHandler) GetPreferences(c *gin.Context) {
	userID, ok := utils.RequireUserID(c)
	if !ok {
		return
	}

	pref, err := h.userUseCase.GetPreferences(c.Request.Context(), userID)
	if err != nil {
		log.Printf("[USER] GetPreferences failed for user %d: %v", userID, err)
		utils.ErrorResponse(c, http.StatusInternalServerError, "settings.preference.fetch_failed", "INTERNAL_SERVER_ERROR")
		return
	}

	utils.SuccessDataResponse(c, http.StatusOK, pref)
}

func (h *UserHandler) UpdatePreferences(c *gin.Context) {
	userID, ok := utils.RequireUserID(c)
	if !ok {
		return
	}

	reqPtr, ok := utils.BindAndValidate[iam_dto.UpdatePreferenceRequest](c)
	if !ok {
		return
	}

	updated, err := h.userUseCase.UpdatePreferences(c.Request.Context(), userID, *reqPtr)
	if err != nil {
		if errors.Is(err, domain.ErrInvalidPreferenceLocale) ||
			errors.Is(err, domain.ErrInvalidPreferenceTimezone) ||
			errors.Is(err, domain.ErrInvalidPreferenceDateFormat) {
			utils.HandleDomainError(c, err)
			return
		}

		// Mask unexpected database/system errors
		log.Printf("[USER] UpdatePreferences failed for user %d: %v", userID, err)
		utils.ErrorResponse(c, http.StatusInternalServerError, "settings.preference.update_failed", "INTERNAL_SERVER_ERROR")
		return
	}

	utils.SuccessResponse(c, http.StatusOK, "auth.profile.toast_preferences_saved", updated)
}
