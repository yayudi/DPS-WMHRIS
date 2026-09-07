package handler

import (
	"github.com/dps-wmhris/backend/internal/utils"
	"net/http"
	"strconv"

	"github.com/dps-wmhris/backend/internal/dto"
	"github.com/dps-wmhris/backend/internal/service"
	"github.com/gin-gonic/gin"
)

// NotificationHandler handles notification HTTP endpoints.
type NotificationHandler struct {
	notificationService service.NotificationService
}

// NewNotificationHandler creates a new NotificationHandler.
func NewNotificationHandler(notificationService service.NotificationService) *NotificationHandler {
	return &NotificationHandler{notificationService: notificationService}
}

// GetRecentPending handles GET /notifications/recent
func (h *NotificationHandler) GetRecentPending(c *gin.Context) {
	userID := c.GetInt("userID")
	limit := 5
	if l := c.Query("limit"); l != "" {
		if parsed, err := strconv.Atoi(l); err == nil && parsed > 0 {
			limit = parsed
		}
	}

	data, err := h.notificationService.FetchRecentPending(c.Request.Context(), userID, limit)
	if err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, "Gagal mengambil notifikasi terbaru", "INTERNAL_SERVER_ERROR")
		return
	}

	utils.SuccessResponse(c, http.StatusOK, "Recent pending notifications fetched", data)
}

// GetAll handles GET /notifications
func (h *NotificationHandler) GetAll(c *gin.Context) {
	userID := c.GetInt("userID")
	filterType := c.DefaultQuery("type", "ALL")

	data, err := h.notificationService.FetchAll(c.Request.Context(), userID, filterType)
	if err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, "Gagal mengambil notifikasi", "INTERNAL_SERVER_ERROR")
		return
	}

	utils.SuccessResponse(c, http.StatusOK, "Notifications fetched", data)
}

// MarkAsDone handles PUT /notifications/:id/done
func (h *NotificationHandler) MarkAsDone(c *gin.Context) {
	userID := c.GetInt("userID")
	notificationIDStr := c.Param("id")

	if notificationIDStr == "all" {
		err := h.notificationService.MarkAllNotificationsAsDone(c.Request.Context(), userID)
		if err != nil {
			utils.ErrorResponse(c, http.StatusInternalServerError, "Gagal menandai semua notifikasi sebagai selesai", "INTERNAL_SERVER_ERROR")
			return
		}
	} else {
		notificationID, err := strconv.Atoi(notificationIDStr)
		if err != nil {
			utils.ErrorResponse(c, http.StatusBadRequest, "ID notifikasi tidak valid", "VALIDATION_ERROR")
			return
		}
		err = h.notificationService.MarkNotificationAsDone(c.Request.Context(), notificationID, userID)
		if err != nil {
			utils.ErrorResponse(c, http.StatusInternalServerError, "Gagal menandai notifikasi sebagai selesai", "INTERNAL_SERVER_ERROR")
			return
		}
	}

	utils.SuccessResponse(c, http.StatusOK, "Marked as done", nil)
}

// GetPreferences handles GET /notifications/preferences
func (h *NotificationHandler) GetPreferences(c *gin.Context) {
	userID := c.GetInt("userID")

	data, err := h.notificationService.FetchPreferences(c.Request.Context(), userID)
	if err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, "Gagal mengambil preferensi notifikasi", "INTERNAL_SERVER_ERROR")
		return
	}

	utils.SuccessResponse(c, http.StatusOK, "Preferences fetched", data)
}

// UpdatePreferences handles PUT /notifications/preferences
func (h *NotificationHandler) UpdatePreferences(c *gin.Context) {
	userID := c.GetInt("userID")
	req_ptr, ok := utils.BindAndValidate[dto.UpdatePreferencesRequest](c)
	if !ok {
		return
	}
	req := *req_ptr

	err := h.notificationService.UpdatePreferences(c.Request.Context(), userID, req.Preferences)
	if err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, "Gagal memperbarui preferensi notifikasi", "INTERNAL_SERVER_ERROR")
		return
	}

	utils.SuccessResponse(c, http.StatusOK, "Preferences updated successfully", nil)
}

// ClaimNotification handles PUT /notifications/:id/claim
func (h *NotificationHandler) ClaimNotification(c *gin.Context) {
	userID := c.GetInt("userID")
	notificationID, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		utils.ErrorResponse(c, http.StatusBadRequest, "ID notifikasi tidak valid", "VALIDATION_ERROR")
		return
	}

	success, err := h.notificationService.ClaimNotification(c.Request.Context(), notificationID, userID)
	if err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, "Gagal mengambil tugas", "INTERNAL_SERVER_ERROR")
		return
	}

	if success {
		utils.SuccessResponse(c, http.StatusOK, "Tugas berhasil diambil", nil)
	} else {
		utils.ErrorResponse(c, http.StatusBadRequest, "Tugas sudah diambil oleh orang lain atau sudah selesai", "")
	}
}
