package http

import (
	"net/http"

	system_dto "github.com/dps-wmhris/backend/internal/modules/system/application/dto"

	system_usecase "github.com/dps-wmhris/backend/internal/modules/system/application/usecase"
	"github.com/dps-wmhris/backend/internal/shared/middleware"
	"github.com/dps-wmhris/backend/internal/shared/utils"
	"github.com/gin-gonic/gin"
)

// NotificationHandler handles notification HTTP endpoints.
type NotificationHandler struct {
	notificationService system_usecase.NotificationService
}

// NewNotificationHandler creates a new NotificationHandler.
func NewNotificationHandler(notificationService system_usecase.NotificationService) *NotificationHandler {
	return &NotificationHandler{notificationService: notificationService}
}

// GetRecentPending handles GET /notifications/recent
func (h *NotificationHandler) GetRecentPending(c *gin.Context) {
	userID := middleware.GetUserID(c)
	_, limit := utils.ParsePagination(c, 5)

	data, err := h.notificationService.FetchRecentPending(c.Request.Context(), userID, limit)
	if err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, "system.notifications.fetch_recent_failed", "INTERNAL_SERVER_ERROR")
		return
	}

	utils.SuccessDataResponse(c, http.StatusOK, data)
}

// GetAll handles GET /notifications
func (h *NotificationHandler) GetAll(c *gin.Context) {
	userID := middleware.GetUserID(c)
	filterType := c.DefaultQuery("type", "ALL")

	data, err := h.notificationService.FetchAll(c.Request.Context(), userID, filterType)
	if err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, "system.notifications.fetch_all_failed", "INTERNAL_SERVER_ERROR")
		return
	}

	utils.SuccessDataResponse(c, http.StatusOK, data)
}

// MarkAsDone handles PUT /notifications/:id/done
func (h *NotificationHandler) MarkAsDone(c *gin.Context) {
	userID := middleware.GetUserID(c)
	if c.Param("id") == "all" {
		err := h.notificationService.MarkAllNotificationsAsDone(c.Request.Context(), userID)
		if err != nil {
			utils.ErrorResponse(c, http.StatusInternalServerError, "system.notifications.mark_all_done_failed", "INTERNAL_SERVER_ERROR")
			return
		}
	} else {
		notificationID, ok := utils.ParseIntParam(c, "id")
		if !ok {
			return
		}
		err := h.notificationService.MarkNotificationAsDone(c.Request.Context(), notificationID, userID)
		if err != nil {
			utils.ErrorResponse(c, http.StatusInternalServerError, "system.notifications.mark_done_failed", "INTERNAL_SERVER_ERROR")
			return
		}
	}

	utils.SuccessResponse(c, http.StatusOK, "system.notifications.mark_done_success", nil)
}

// GetPreferences handles GET /notifications/preferences
func (h *NotificationHandler) GetPreferences(c *gin.Context) {
	userID := middleware.GetUserID(c)

	data, err := h.notificationService.FetchPreferences(c.Request.Context(), userID)
	if err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, "system.notifications.fetch_preferences_failed", "INTERNAL_SERVER_ERROR")
		return
	}

	utils.SuccessDataResponse(c, http.StatusOK, data)
}

// UpdatePreferences handles PUT /notifications/preferences
func (h *NotificationHandler) UpdatePreferences(c *gin.Context) {
	userID := middleware.GetUserID(c)
	req_ptr, ok := utils.BindAndValidate[system_dto.UpdatePreferencesRequest](c)
	if !ok {
		return
	}
	req := *req_ptr

	err := h.notificationService.UpdatePreferences(c.Request.Context(), userID, req.Preferences)
	if err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, "system.notifications.update_preferences_failed", "INTERNAL_SERVER_ERROR")
		return
	}

	utils.SuccessResponse(c, http.StatusOK, "system.notifications.update_preferences_success", nil)
}

// ClaimNotification handles PUT /notifications/:id/claim
func (h *NotificationHandler) ClaimNotification(c *gin.Context) {
	userID := middleware.GetUserID(c)
	notificationID, ok := utils.ParseIntParam(c, "id")
	if !ok {
		return
	}

	success, err := h.notificationService.ClaimNotification(c.Request.Context(), notificationID, userID)
	if err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, "system.notifications.claim_failed", "INTERNAL_SERVER_ERROR")
		return
	}

	if success {
		utils.SuccessResponse(c, http.StatusOK, "system.notifications.claim_success", nil)
	} else {
		utils.ErrorResponse(c, http.StatusBadRequest, "system.notifications.claim_conflict", "")
	}
}
