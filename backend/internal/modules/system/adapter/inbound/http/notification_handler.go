package http

import (
	"log"
	"net/http"

	system_dto "github.com/dps-wmhris/backend/internal/modules/system/application/dto"
	"github.com/dps-wmhris/backend/internal/modules/system/port"
	"github.com/dps-wmhris/backend/internal/shared/utils"
	"github.com/gin-gonic/gin"
)

// NotificationHandler handles notification HTTP endpoints.
type NotificationHandler struct {
	notificationService port.NotificationService
}

// NewNotificationHandler creates a new NotificationHandler.
func NewNotificationHandler(notificationService port.NotificationService) *NotificationHandler {
	return &NotificationHandler{notificationService: notificationService}
}

// GetRecentPending handles GET /notifications/recent.
func (h *NotificationHandler) GetRecentPending(c *gin.Context) {
	userID, ok := utils.RequireUserID(c)
	if !ok {
		return
	}
	_, limit := utils.ParsePagination(c, 5)

	data, err := h.notificationService.FetchRecentPending(c.Request.Context(), userID, limit)
	if err != nil {
		log.Printf("[NOTIFICATION] GetRecentPending failed for user %d: %v", userID, err)
		utils.ErrorResponse(c, http.StatusInternalServerError, "system.notifications.fetch_recent_failed", "INTERNAL_SERVER_ERROR")
		return
	}

	utils.SuccessDataResponse(c, http.StatusOK, data)
}

// GetAll handles GET /notifications.
func (h *NotificationHandler) GetAll(c *gin.Context) {
	userID, ok := utils.RequireUserID(c)
	if !ok {
		return
	}
	filterType := c.DefaultQuery("type", "ALL")

	data, err := h.notificationService.FetchAll(c.Request.Context(), userID, filterType)
	if err != nil {
		log.Printf("[NOTIFICATION] GetAll failed for user %d: %v", userID, err)
		utils.ErrorResponse(c, http.StatusInternalServerError, "system.notifications.fetch_all_failed", "INTERNAL_SERVER_ERROR")
		return
	}

	utils.SuccessDataResponse(c, http.StatusOK, data)
}

// MarkAsDone handles PUT /notifications/:id/done (including :id = "all").
func (h *NotificationHandler) MarkAsDone(c *gin.Context) {
	userID, ok := utils.RequireUserID(c)
	if !ok {
		return
	}
	if c.Param("id") == "all" {
		if err := h.notificationService.MarkAllNotificationsAsDone(c.Request.Context(), userID); err != nil {
			log.Printf("[NOTIFICATION] MarkAllAsDone failed for user %d: %v", userID, err)
			utils.ErrorResponse(c, http.StatusInternalServerError, "system.notifications.mark_all_done_failed", "INTERNAL_SERVER_ERROR")
			return
		}
	} else {
		notificationID, ok := utils.ParseIntParam(c, "id")
		if !ok {
			return
		}
		if err := h.notificationService.MarkNotificationAsDone(c.Request.Context(), notificationID, userID); err != nil {
			log.Printf("[NOTIFICATION] MarkAsDone failed for user %d notification %d: %v", userID, notificationID, err)
			utils.ErrorResponse(c, http.StatusInternalServerError, "system.notifications.mark_done_failed", "INTERNAL_SERVER_ERROR")
			return
		}
	}

	utils.SuccessResponse(c, http.StatusOK, "system.notifications.mark_done_success", nil)
}

// GetPreferences handles GET /notifications/preferences.
func (h *NotificationHandler) GetPreferences(c *gin.Context) {
	userID, ok := utils.RequireUserID(c)
	if !ok {
		return
	}

	data, err := h.notificationService.FetchPreferences(c.Request.Context(), userID)
	if err != nil {
		log.Printf("[NOTIFICATION] GetPreferences failed for user %d: %v", userID, err)
		utils.ErrorResponse(c, http.StatusInternalServerError, "system.notifications.fetch_preferences_failed", "INTERNAL_SERVER_ERROR")
		return
	}

	utils.SuccessDataResponse(c, http.StatusOK, data)
}

// UpdatePreferences handles PUT /notifications/preferences.
func (h *NotificationHandler) UpdatePreferences(c *gin.Context) {
	userID, ok := utils.RequireUserID(c)
	if !ok {
		return
	}
	reqPtr, ok := utils.BindAndValidate[system_dto.UpdatePreferencesRequest](c)
	if !ok {
		return
	}
	req := *reqPtr

	if err := h.notificationService.UpdatePreferences(c.Request.Context(), userID, req.Preferences); err != nil {
		log.Printf("[NOTIFICATION] UpdatePreferences failed for user %d: %v", userID, err)
		utils.ErrorResponse(c, http.StatusInternalServerError, "system.notifications.update_preferences_failed", "INTERNAL_SERVER_ERROR")
		return
	}

	utils.SuccessResponse(c, http.StatusOK, "system.notifications.update_preferences_success", nil)
}

// ClaimNotification handles PUT /notifications/:id/claim.
func (h *NotificationHandler) ClaimNotification(c *gin.Context) {
	userID, ok := utils.RequireUserID(c)
	if !ok {
		return
	}
	notificationID, ok := utils.ParseIntParam(c, "id")
	if !ok {
		return
	}

	success, err := h.notificationService.ClaimNotification(c.Request.Context(), notificationID, userID)
	if err != nil {
		log.Printf("[NOTIFICATION] ClaimNotification failed for user %d notification %d: %v", userID, notificationID, err)
		utils.ErrorResponse(c, http.StatusInternalServerError, "system.notifications.claim_failed", "INTERNAL_SERVER_ERROR")
		return
	}

	if success {
		utils.SuccessResponse(c, http.StatusOK, "system.notifications.claim_success", nil)
	} else {
		utils.ErrorResponse(c, http.StatusConflict, "system.notifications.claim_conflict", "CONFLICT")
	}
}
