package http

import (
	"net/http"

	system_dto "github.com/dps-wmhris/backend/internal/modules/system/application/dto"

	system_usecase "github.com/dps-wmhris/backend/internal/modules/system/application/usecase"
	"github.com/dps-wmhris/backend/internal/shared/utils"
	"github.com/gin-gonic/gin"
)

type SystemLogHandler struct {
	systemLogService system_usecase.SystemLogService
}

func NewSystemLogHandler(systemLogService system_usecase.SystemLogService) *SystemLogHandler {
	return &SystemLogHandler{systemLogService: systemLogService}
}

func (h *SystemLogHandler) GetLogs(c *gin.Context) {
	req_ptr, ok := utils.BindQueryAndValidate[system_dto.GetSystemLogsRequest](c)
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
