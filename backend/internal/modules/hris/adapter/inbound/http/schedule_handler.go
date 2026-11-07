package http

import (
	system_dto "github.com/dps-wmhris/backend/internal/modules/system/application/dto"

	"net/http"
	"os"

	hris_dto "github.com/dps-wmhris/backend/internal/modules/hris/application/dto"

	system_usecase "github.com/dps-wmhris/backend/internal/modules/system/application/usecase"

	hris_port "github.com/dps-wmhris/backend/internal/modules/hris/port"

	"github.com/dps-wmhris/backend/internal/shared/middleware"
	"github.com/dps-wmhris/backend/internal/shared/utils"
	"github.com/gin-gonic/gin"
)

type ScheduleHandler struct {
	scheduleUseCase hris_port.ScheduleUseCase
	jobService      system_usecase.JobService
}

func NewScheduleHandler(scheduleUseCase hris_port.ScheduleUseCase, jobService system_usecase.JobService) *ScheduleHandler {
	return &ScheduleHandler{
		scheduleUseCase: scheduleUseCase,
		jobService:      jobService,
	}
}

func (h *ScheduleHandler) GetSchedules(c *gin.Context) {
	req_ptr, ok := utils.BindQueryAndValidate[hris_dto.GetSchedulesRequest](c)
	if !ok {
		return
	}
	req := *req_ptr

	schedules, err := h.scheduleUseCase.GetSchedules(c.Request.Context(), req.UserID, req.StartDate, req.EndDate)
	if err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, err.Error(), "INTERNAL_ERROR")
		return
	}

	utils.SuccessDataResponse(c, http.StatusOK, schedules)
}

func (h *ScheduleHandler) CreateSchedule(c *gin.Context) {
	req_ptr, ok := utils.BindAndValidate[hris_dto.CreateScheduleRequest](c)
	if !ok {
		return
	}
	req := *req_ptr

	var createdBy *int
	if userID := middleware.GetUserID(c); userID > 0 {
		createdBy = &userID
	}

	err := h.scheduleUseCase.CreateSchedule(c.Request.Context(), req, createdBy)
	if err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, err.Error(), "INTERNAL_ERROR")
		return
	}

	utils.SuccessResponse(c, http.StatusOK, "Schedule saved", nil)
}

func (h *ScheduleHandler) DeleteSchedule(c *gin.Context) {
	req_ptr, ok := utils.BindQueryAndValidate[hris_dto.DeleteScheduleRequest](c)
	if !ok {
		return
	}
	req := *req_ptr

	err := h.scheduleUseCase.DeleteSchedule(c.Request.Context(), req.UserID, req.Date)
	if err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, err.Error(), "INTERNAL_ERROR")
		return
	}

	utils.SuccessResponse(c, http.StatusOK, "Schedule deleted", nil)
}

func (h *ScheduleHandler) DownloadTemplate(c *gin.Context) {
	f, err := h.scheduleUseCase.GenerateTemplate(c.Request.Context())
	if err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, "Gagal generate template", "INTERNAL_ERROR")
		return
	}

	utils.WriteExcelResponse(c, f, "Template_Jadwal_Shift.xlsx")
}

func (h *ScheduleHandler) UploadImportSchedule(c *gin.Context) {
	savedPath, origName, ok := utils.SaveImportUpload(c, "file", "schedule")
	if !ok {
		return
	}

	userID := middleware.GetUserID(c)
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
		utils.ErrorResponse(c, http.StatusInternalServerError, err.Error(), "INTERNAL_ERROR")
		return
	}

	utils.JobCreatedResponse(c, http.StatusOK, "Import Jadwal sedang diproses di background.", jobID)
}
