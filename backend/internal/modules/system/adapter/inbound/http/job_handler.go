package http

import (
	"net/http"

	"github.com/dps-wmhris/backend/internal/modules/system/port"
	"github.com/dps-wmhris/backend/internal/shared/utils"
	"github.com/gin-gonic/gin"
)

// JobHandler handles HTTP endpoints for querying and cancelling background import/export jobs.
type JobHandler struct {
	jobService port.JobService
}

// NewJobHandler constructs a JobHandler with the given JobService.
func NewJobHandler(jobService port.JobService) *JobHandler {
	return &JobHandler{jobService: jobService}
}

// GetImportJobs returns paginated background import jobs scoped to the authenticated user (or all when all=true).
func (h *JobHandler) GetImportJobs(c *gin.Context) {
	userID, ok := utils.RequireUserID(c)
	if !ok {
		return
	}
	page, limit := utils.ParsePagination(c, 50)
	all := c.Query("all") == "true"

	var targetUserID *int
	if !all {
		targetUserID = &userID
	}

	result, err := h.jobService.GetImportJobs(c.Request.Context(), page, limit, targetUserID)
	if err != nil {
		utils.HandleDomainError(c, err)
		return
	}
	utils.PaginatedResponse(c, http.StatusOK, result.Data, result.Page, result.Limit, result.Total, result.TotalPages)
}

// CancelImportJob cancels a pending import job owned by the authenticated user.
func (h *JobHandler) CancelImportJob(c *gin.Context) {
	userID, ok := utils.RequireUserID(c)
	if !ok {
		return
	}
	id, ok := utils.ParseIntParam(c, "id")
	if !ok {
		return
	}

	if err := h.jobService.CancelImportJob(c.Request.Context(), id, &userID); err != nil {
		utils.HandleDomainError(c, err)
		return
	}
	utils.SuccessResponse(c, http.StatusOK, "system.jobs.import_cancelled", nil)
}

// GetExportJobs returns paginated background export jobs scoped to the authenticated user (or all when all=true).
func (h *JobHandler) GetExportJobs(c *gin.Context) {
	userID, ok := utils.RequireUserID(c)
	if !ok {
		return
	}
	page, limit := utils.ParsePagination(c, 50)
	all := c.Query("all") == "true"

	var targetUserID *int
	if !all {
		targetUserID = &userID
	}

	result, err := h.jobService.GetExportJobs(c.Request.Context(), page, limit, targetUserID)
	if err != nil {
		utils.HandleDomainError(c, err)
		return
	}
	utils.PaginatedResponse(c, http.StatusOK, result.Data, result.Page, result.Limit, result.Total, result.TotalPages)
}

// CancelExportJob cancels a pending export job owned by the authenticated user.
func (h *JobHandler) CancelExportJob(c *gin.Context) {
	userID, ok := utils.RequireUserID(c)
	if !ok {
		return
	}
	id, ok := utils.ParseIntParam(c, "id")
	if !ok {
		return
	}

	if err := h.jobService.CancelExportJob(c.Request.Context(), id, &userID); err != nil {
		utils.HandleDomainError(c, err)
		return
	}
	utils.SuccessResponse(c, http.StatusOK, "system.jobs.export_cancelled", nil)
}
