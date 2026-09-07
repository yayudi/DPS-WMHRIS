package handler

import (
	"net/http"
	"os"
	"path/filepath"

	"github.com/dps-wmhris/backend/internal/utils"

	"github.com/dps-wmhris/backend/internal/config"
	"github.com/dps-wmhris/backend/internal/dto"
	"github.com/dps-wmhris/backend/internal/service"
	"github.com/gin-gonic/gin"
)

type ScheduleHandler struct {
	scheduleService service.ScheduleService
	jobService      service.JobService
}

func NewScheduleHandler(scheduleService service.ScheduleService, jobService service.JobService) *ScheduleHandler {
	return &ScheduleHandler{
		scheduleService: scheduleService,
		jobService:      jobService,
	}
}

func (h *ScheduleHandler) GetSchedules(c *gin.Context) {
	req_ptr, ok := utils.BindQueryAndValidate[dto.GetSchedulesRequest](c)
	if !ok {
		return
	}
	req := *req_ptr

	schedules, err := h.scheduleService.GetSchedules(c.Request.Context(), req.UserID, req.StartDate, req.EndDate)
	if err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, err.Error(), "INTERNAL_ERROR")
		return
	}

	utils.SuccessDataResponse(c, http.StatusOK, schedules)
}

func (h *ScheduleHandler) CreateSchedule(c *gin.Context) {
	req_ptr, ok := utils.BindAndValidate[dto.CreateScheduleRequest](c)
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

	err := h.scheduleService.CreateSchedule(c.Request.Context(), req, createdBy)
	if err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, err.Error(), "INTERNAL_ERROR")
		return
	}

	utils.SuccessResponse(c, http.StatusOK, "Schedule saved", nil)
}

func (h *ScheduleHandler) DeleteSchedule(c *gin.Context) {
	req_ptr, ok := utils.BindQueryAndValidate[dto.DeleteScheduleRequest](c)
	if !ok {
		return
	}
	req := *req_ptr

	err := h.scheduleService.DeleteSchedule(c.Request.Context(), req.UserID, req.Date)
	if err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, err.Error(), "INTERNAL_ERROR")
		return
	}

	utils.SuccessResponse(c, http.StatusOK, "Schedule deleted", nil)
}

func (h *ScheduleHandler) DownloadTemplate(c *gin.Context) {
	f, err := h.scheduleService.GenerateTemplate(c.Request.Context())
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
	os.MkdirAll(uploadDir, os.ModePerm)
	filepath := uploadDir + file.Filename
	
	if err := c.SaveUploadedFile(file, filepath); err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, "Failed to save file", "INTERNAL_ERROR")
		return
	}

	req := dto.CreateImportJobRequest{
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
