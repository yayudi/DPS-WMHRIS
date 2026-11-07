package http

import (
	"net/http"

	system_usecase "github.com/dps-wmhris/backend/internal/modules/system/application/usecase"
	"github.com/dps-wmhris/backend/internal/shared/middleware"
	"github.com/dps-wmhris/backend/internal/shared/utils"

	"github.com/gin-gonic/gin"
)

type JobHandler struct {
	jobService system_usecase.JobService
}

func NewJobHandler(jobService system_usecase.JobService) *JobHandler {
	return &JobHandler{jobService: jobService}
}

func (h *JobHandler) GetImportJobs(c *gin.Context) {
	page, limit := utils.ParsePagination(c, 50)
	userID := middleware.GetUserID(c)
	all := c.Query("all") == "true"

	var targetUserID *int
	if !all && userID > 0 {
		targetUserID = &userID
	}

	result, err := h.jobService.GetImportJobs(c.Request.Context(), page, limit, targetUserID)
	if err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, err.Error(), "INTERNAL_ERROR")
		return
	}
	utils.PaginatedResponse(c, http.StatusOK, result.Data, result.Page, result.Limit, result.Total, result.TotalPages)
}

func (h *JobHandler) CancelImportJob(c *gin.Context) {
	id, ok := utils.ParseIntParam(c, "id")
	if !ok {
		return
	}
	userID := middleware.GetUserID(c)
	var targetUserID *int
	if userID > 0 {
		targetUserID = &userID
	}

	err := h.jobService.CancelImportJob(c.Request.Context(), id, targetUserID)
	if err != nil {
		utils.ErrorResponse(c, http.StatusBadRequest, err.Error(), "BAD_REQUEST")
		return
	}
	utils.SuccessResponse(c, http.StatusOK, "Import job cancelled", nil)
}

func (h *JobHandler) GetExportJobs(c *gin.Context) {
	page, limit := utils.ParsePagination(c, 50)
	userID := middleware.GetUserID(c)
	all := c.Query("all") == "true"

	var targetUserID *int
	if !all && userID > 0 {
		targetUserID = &userID
	}

	result, err := h.jobService.GetExportJobs(c.Request.Context(), page, limit, targetUserID)
	if err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, err.Error(), "INTERNAL_ERROR")
		return
	}
	utils.PaginatedResponse(c, http.StatusOK, result.Data, result.Page, result.Limit, result.Total, result.TotalPages)
}

func (h *JobHandler) CancelExportJob(c *gin.Context) {
	id, ok := utils.ParseIntParam(c, "id")
	if !ok {
		return
	}
	userID := middleware.GetUserID(c)
	var targetUserID *int
	if userID > 0 {
		targetUserID = &userID
	}

	err := h.jobService.CancelExportJob(c.Request.Context(), id, targetUserID)
	if err != nil {
		utils.ErrorResponse(c, http.StatusBadRequest, err.Error(), "BAD_REQUEST")
		return
	}
	utils.SuccessResponse(c, http.StatusOK, "Export job cancelled", nil)
}
