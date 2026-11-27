package http

import (
	"log"
	"net/http"

	system_dto "github.com/dps-wmhris/backend/internal/modules/system/application/dto"
	"github.com/dps-wmhris/backend/internal/modules/system/port"
	"github.com/dps-wmhris/backend/internal/shared/utils"
	"github.com/gin-gonic/gin"
)

// SystemLogHandler handles HTTP endpoints for querying system audit logs.
type SystemLogHandler struct {
	systemLogService port.SystemLogService
}

// NewSystemLogHandler constructs a SystemLogHandler with the given SystemLogService.
func NewSystemLogHandler(systemLogService port.SystemLogService) *SystemLogHandler {
	return &SystemLogHandler{systemLogService: systemLogService}
}

// GetLogs returns filtered audit logs along with total count for frontend pagination.
func (h *SystemLogHandler) GetLogs(c *gin.Context) {
	reqPtr, ok := utils.BindQueryAndValidate[system_dto.GetSystemLogsRequest](c)
	if !ok {
		return
	}
	req := *reqPtr

	res, err := h.systemLogService.GetLogs(c.Request.Context(), req)
	if err != nil {
		log.Printf("[SYSTEM_LOG] GetLogs failed: %v", err)
		utils.ErrorResponse(c, http.StatusInternalServerError, "system.logs.fetch_failed", "INTERNAL_SERVER_ERROR")
		return
	}

	utils.RawResponse(c, http.StatusOK, gin.H{
		"success": true,
		"data":    res.Data,
		"total":   res.Total,
	})
}
