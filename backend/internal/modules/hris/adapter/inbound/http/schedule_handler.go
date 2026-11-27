package http

import (
	"net/http"
	"os"

	hris_dto "github.com/dps-wmhris/backend/internal/modules/hris/application/dto"
	hris_port "github.com/dps-wmhris/backend/internal/modules/hris/port"
	system_dto "github.com/dps-wmhris/backend/internal/modules/system/application/dto"
	system_port "github.com/dps-wmhris/backend/internal/modules/system/port"
	"github.com/dps-wmhris/backend/internal/shared/utils"
	"github.com/gin-gonic/gin"
)

// ScheduleHandler exposes HTTP endpoints for per-date employee shift overrides and bulk schedule imports.
type ScheduleHandler struct {
	scheduleUseCase hris_port.ScheduleUseCase
	jobService      system_port.JobService
}

// NewScheduleHandler creates a new ScheduleHandler.
func NewScheduleHandler(scheduleUseCase hris_port.ScheduleUseCase, jobService system_port.JobService) *ScheduleHandler {
	return &ScheduleHandler{
		scheduleUseCase: scheduleUseCase,
		jobService:      jobService,
	}
}

// GetSchedules returns a user's shift schedule overrides within the specified date range.
func (h *ScheduleHandler) GetSchedules(c *gin.Context) {
	reqPtr, ok := utils.BindQueryAndValidate[hris_dto.GetSchedulesRequest](c)
	if !ok {
		return
	}
	req := *reqPtr

	schedules, err := h.scheduleUseCase.GetSchedules(c.Request.Context(), req.UserID, req.StartDate, req.EndDate)
	if err != nil {
		utils.HandleDomainError(c, err)
		return
	}

	utils.SuccessDataResponse(c, http.StatusOK, schedules)
}

// CreateSchedule creates or updates a single shift schedule override for an employee on a specific date.
func (h *ScheduleHandler) CreateSchedule(c *gin.Context) {
	userID, ok := utils.RequireUserID(c)
	if !ok {
		return
	}

	reqPtr, ok := utils.BindAndValidate[hris_dto.CreateScheduleRequest](c)
	if !ok {
		return
	}
	req := *reqPtr

	if err := h.scheduleUseCase.CreateSchedule(c.Request.Context(), req, &userID); err != nil {
		utils.HandleDomainError(c, err)
		return
	}

	utils.SuccessResponse(c, http.StatusOK, "hris.schedule.save_success", nil)
}

// DeleteSchedule removes a user's shift schedule override for a specific date.
func (h *ScheduleHandler) DeleteSchedule(c *gin.Context) {
	reqPtr, ok := utils.BindQueryAndValidate[hris_dto.DeleteScheduleRequest](c)
	if !ok {
		return
	}
	req := *reqPtr

	if err := h.scheduleUseCase.DeleteSchedule(c.Request.Context(), req.UserID, req.Date); err != nil {
		utils.HandleDomainError(c, err)
		return
	}

	utils.SuccessResponse(c, http.StatusOK, "hris.schedule.delete_success", nil)
}

// DownloadTemplate generates and streams an Excel shift schedule import template with dropdown validations.
func (h *ScheduleHandler) DownloadTemplate(c *gin.Context) {
	f, err := h.scheduleUseCase.GenerateTemplate(c.Request.Context())
	if err != nil {
		utils.HandleDomainError(c, err)
		return
	}
	defer func() {
		_ = f.Close()
	}()

	utils.WriteExcelResponse(c, f, "Template_Jadwal_Shift.xlsx")
}

// UploadImportSchedule queues an asynchronous Excel shift schedule import job.
func (h *ScheduleHandler) UploadImportSchedule(c *gin.Context) {
	userID, ok := utils.RequireUserID(c)
	if !ok {
		return
	}

	savedPath, origName, ok := utils.SaveImportUpload(c, "file", "schedule")
	if !ok {
		return
	}

	jobType, finalNotes, _ := utils.ParseImportJobMeta(c, "IMPORT_SCHEDULES", "Import Jadwal Shift", "")

	req := system_dto.CreateImportJobRequest{
		UserID:           userID,
		JobType:          jobType,
		OriginalFilename: origName,
		FilePath:         savedPath,
		Notes:            &finalNotes,
	}

	jobID, err := h.jobService.CreateImportJob(c.Request.Context(), req)
	if err != nil {
		_ = os.Remove(savedPath)
		utils.HandleDomainError(c, err)
		return
	}

	utils.JobCreatedResponse(c, http.StatusOK, "hris.schedule.job_queued", jobID)
}
