package http

import (
	system_dto "github.com/dps-wmhris/backend/internal/modules/system/application/dto"

	"net/http"
	"os"
	"path/filepath"

	hris_dto "github.com/dps-wmhris/backend/internal/modules/hris/application/dto"

	system_usecase "github.com/dps-wmhris/backend/internal/modules/system/application/usecase"

	hris_port "github.com/dps-wmhris/backend/internal/modules/hris/port"

	"github.com/dps-wmhris/backend/internal/shared/config"
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

	// createdBy could be obtained from JWT token if available in context, for now we pass nil or parse it.
	// We'll extract UserID from context if middleware sets it. Assuming it's set as float64 by some JWT middlewares.
	var createdBy *int
	if userID, exists := c.Get("userID"); exists {
		if idF, ok := userID.(float64); ok {
			idInt := int(idF)
			createdBy = &idInt
		}
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

	c.Header("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
	c.Header("Content-Disposition", "attachment; filename=Template_Jadwal_Shift.xlsx")

	if err := f.Write(c.Writer); err != nil {
		// Log error, but headers might already be sent
	}
}

func (h *ScheduleHandler) UploadImportSchedule(c *gin.Context) {
	file, err := c.FormFile("file")
	if err != nil {
		utils.ErrorResponse(c, http.StatusBadRequest, "File Excel wajib diupload.", "VALIDATION_ERROR")
		return
	}

	userID := getUserID(c)

	// Create temp directory for uploads if not exists
	uploadDir := filepath.Join(config.AppConfig.StoragePath, "uploads", "schedule") + string(filepath.Separator)
	_ = os.MkdirAll(uploadDir, 0750) // #nosec G104
	filepath := uploadDir + file.Filename

	if err := c.SaveUploadedFile(file, filepath); err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, "Failed to save file", "INTERNAL_ERROR")
		return
	}

	req := system_dto.CreateImportJobRequest{
		UserID:           userID,
		JobType:          "IMPORT_SCHEDULES",
		OriginalFilename: file.Filename,
		FilePath:         filepath,
	}

	jobID, err := h.jobService.CreateImportJob(c.Request.Context(), req)
	if err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, err.Error(), "INTERNAL_ERROR")
		return
	}

	utils.RawResponse(c, http.StatusOK, gin.H{
		"success": true,
		"message": "Import Jadwal sedang diproses di background.",
		"data": gin.H{
			"jobId": jobID,
		},
	})
}
