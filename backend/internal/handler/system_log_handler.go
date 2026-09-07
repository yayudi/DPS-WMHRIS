package handler

import (
	"net/http"

	"github.com/dps-wmhris/backend/internal/dto"
	"github.com/dps-wmhris/backend/internal/service"
	"github.com/dps-wmhris/backend/internal/utils"
	"github.com/gin-gonic/gin"
)

type SystemLogHandler struct {
	systemLogService service.SystemLogService
}

func NewSystemLogHandler(systemLogService service.SystemLogService) *SystemLogHandler {
	return &SystemLogHandler{systemLogService: systemLogService}
}

func (h *SystemLogHandler) GetLogs(c *gin.Context) {
	req_ptr, ok := utils.BindQueryAndValidate[dto.GetSystemLogsRequest](c)
	if !ok {
		return
	}
	req := *req_ptr

	res, err := h.systemLogService.GetLogs(c.Request.Context(), req)
	if err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, "Gagal mengambil log sistem", "INTERNAL_SERVER_ERROR")
		return
	}

	utils.RawResponse(c, http.StatusOK, gin.H{
		"success": true,
		"data":    res.Data,
		"total":   res.Total,
	})
}
