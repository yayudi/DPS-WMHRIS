package handler

import (
	"net/http"
	"strconv"

	"github.com/dps-wmhris/backend/internal/utils"

	"github.com/dps-wmhris/backend/internal/service"
	"github.com/gin-gonic/gin"
)

type JobHandler struct {
	jobService service.JobService
}

func NewJobHandler(jobService service.JobService) *JobHandler {
	return &JobHandler{jobService: jobService}
}

func (h *JobHandler) GetImportJobs(c *gin.Context) {
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "50"))
	offset, _ := strconv.Atoi(c.DefaultQuery("offset", "0"))

	jobs, err := h.jobService.GetImportJobs(c.Request.Context(), limit, offset)
	if err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, err.Error(), "INTERNAL_ERROR")
		return
	}
	utils.SuccessDataResponse(c, http.StatusOK, jobs)
}

func (h *JobHandler) CancelImportJob(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		utils.ErrorResponse(c, http.StatusBadRequest, "Invalid ID", "VALIDATION_ERROR")
		return
	}

	err = h.jobService.CancelImportJob(c.Request.Context(), id)
	if err != nil {
		utils.ErrorResponse(c, http.StatusBadRequest, err.Error(), "BAD_REQUEST")
		return
	}
	utils.SuccessResponse(c, http.StatusOK, "Import job cancelled", nil)
}

func (h *JobHandler) GetExportJobs(c *gin.Context) {
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "50"))
	offset, _ := strconv.Atoi(c.DefaultQuery("offset", "0"))

	jobs, err := h.jobService.GetExportJobs(c.Request.Context(), limit, offset)
	if err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, err.Error(), "INTERNAL_ERROR")
		return
	}
	utils.SuccessDataResponse(c, http.StatusOK, jobs)
}

func (h *JobHandler) CancelExportJob(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		utils.ErrorResponse(c, http.StatusBadRequest, "Invalid ID", "VALIDATION_ERROR")
		return
	}

	err = h.jobService.CancelExportJob(c.Request.Context(), id)
	if err != nil {
		utils.ErrorResponse(c, http.StatusBadRequest, err.Error(), "BAD_REQUEST")
		return
	}
	utils.SuccessResponse(c, http.StatusOK, "Export job cancelled", nil)
}
