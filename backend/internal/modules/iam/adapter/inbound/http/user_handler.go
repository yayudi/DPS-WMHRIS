// Package http implements the Gin HTTP inbound adapters for the IAM module.
package http

import (
	"errors"
	"log"
	"net/http"

	iam_dto "github.com/dps-wmhris/backend/internal/modules/iam/application/dto"
	"github.com/dps-wmhris/backend/internal/modules/iam/domain"
	"github.com/dps-wmhris/backend/internal/modules/iam/port"
	"github.com/dps-wmhris/backend/internal/shared/config"
	"github.com/dps-wmhris/backend/internal/shared/i18n"
	"github.com/dps-wmhris/backend/internal/shared/utils"
	"github.com/gin-gonic/gin"
)

// UserHandler handles HTTP endpoints for user authentication, profile, locations, and preferences.
type UserHandler struct {
	userUseCase port.UserUseCase
}

// NewUserHandler constructs a UserHandler with the given UserUseCase.
func NewUserHandler(userUseCase port.UserUseCase) *UserHandler {
	return &UserHandler{userUseCase: userUseCase}
}

// Login authenticates a user and issues an HttpOnly JWT cookie alongside the JSON login payload.
func (h *UserHandler) Login(c *gin.Context) {
	reqPtr, ok := utils.BindAndValidate[iam_dto.LoginRequest](c)
	if !ok {
		return
	}
	req := *reqPtr

	log.Printf("[LOGIN] Attempting login for username: %s", req.Username)

	res, err := h.userUseCase.Login(c.Request.Context(), req)
	if err != nil {
		log.Printf("[LOGIN] Login failed for user %s: %v", req.Username, err)
		utils.HandleDomainError(c, err)
		return
	}

	log.Printf("[LOGIN] Login success for user: %s (ID: %d)", res.UserInfo.Username, res.UserInfo.ID)

	// Set JWT to HttpOnly Cookie with SameSite=Lax and 24-hour TTL matching JWT exp claim
	secureCookie := config.AppConfig.Env == "production"
	c.SetSameSite(http.SameSiteLaxMode)
	c.SetCookie("token", res.Token, 86400, "/", "", secureCookie, true)

	utils.RawResponse(c, http.StatusOK, gin.H{
		"success": true,
		"message": i18n.TranslateByLocale(c.Request.Context(), c.GetString(i18n.GinLocaleKey), "auth.login.success"),
		"token":   res.Token,
		"user":    res.UserInfo,
	})
}

// Logout clears the authentication token cookie.
func (h *UserHandler) Logout(c *gin.Context) {
	secureCookie := config.AppConfig.Env == "production"
	c.SetSameSite(http.SameSiteLaxMode)
	c.SetCookie("token", "", -1, "/", "", secureCookie, true)
	utils.SuccessResponse(c, http.StatusOK, "auth.login.logout_success", nil)
}

// GetProfile returns the authenticated user's profile, permissions, and preferences.
func (h *UserHandler) GetProfile(c *gin.Context) {
	userID, ok := utils.RequireUserID(c)
	if !ok {
		return
	}
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

// UpdateProfile updates the authenticated user's profile nickname or password.
func (h *UserHandler) UpdateProfile(c *gin.Context) {
	userID, ok := utils.RequireUserID(c)
	if !ok {
		return
	}

	reqPtr, ok := utils.BindAndValidate[iam_dto.UpdateProfileRequest](c)
	if !ok {
		return
	}
	req := *reqPtr

	updatedUser, err := h.userUseCase.UpdateProfile(c.Request.Context(), userID, req, c.ClientIP(), c.Request.UserAgent())
	if err != nil {
		utils.HandleDomainError(c, err)
		return
	}

	utils.SuccessResponse(c, http.StatusOK, "auth.profile.toast_account_updated", updatedUser)
}

// GetMyLocations returns the warehouse locations assigned to the authenticated user.
func (h *UserHandler) GetMyLocations(c *gin.Context) {
	userID, ok := utils.RequireUserID(c)
	if !ok {
		return
	}

	locations, err := h.userUseCase.GetMyLocations(c.Request.Context(), userID)
	if err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, "auth.profile.locations_fetch_failed", "INTERNAL_SERVER_ERROR")
		return
	}

	utils.SuccessDataResponse(c, http.StatusOK, locations)
}

// GetPreferences returns the UI preferences for the authenticated user.
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

// UpdatePreferences updates the UI preferences for the authenticated user.
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
