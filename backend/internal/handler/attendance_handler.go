package handler

import (
	"github.com/dps-wmhris/backend/internal/utils"
	"net/http"
	"os"
	"path/filepath"
	"strconv"

	"github.com/dps-wmhris/backend/internal/config"
	"github.com/dps-wmhris/backend/internal/dto"
	"github.com/dps-wmhris/backend/internal/service"
	"github.com/gin-gonic/gin"
)

type AttendanceHandler struct {
	attendanceService service.AttendanceService
	jobService        service.JobService
}

func NewAttendanceHandler(attendanceService service.AttendanceService, jobService service.JobService) *AttendanceHandler {
	return &AttendanceHandler{
		attendanceService: attendanceService,
		jobService:        jobService,
	}
}

func (h *AttendanceHandler) GetIndexes(c *gin.Context) {
	indexes, err := h.attendanceService.GetIndexes(c.Request.Context())
	if err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, err.Error(), "INTERNAL_ERROR")
		return
	}
	utils.RawResponse(c, http.StatusOK, indexes) // In Node.js, this returned raw indexes
}

func (h *AttendanceHandler) GetHistory(c *gin.Context) {
	req_ptr, ok := utils.BindQueryAndValidate[dto.GetHistoryRequest](c)
	if !ok {
		return
	}
	req := *req_ptr

	data, err := h.attendanceService.GetHistory(c.Request.Context(), req.StartDate, req.EndDate, req.Search)
	if err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, err.Error(), "INTERNAL_ERROR")
		return
	}
	utils.SuccessDataResponse(c, http.StatusOK, data)
}

func (h *AttendanceHandler) GetRangeData(c *gin.Context) {
	req_ptr, ok := utils.BindQueryAndValidate[dto.GetRangeDataRequest](c)
	if !ok {
		return
	}
	req := *req_ptr

	data, err := h.attendanceService.GetRangeData(c.Request.Context(), req.StartDate, req.EndDate)
	if err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, err.Error(), "INTERNAL_ERROR")
		return
	}
	utils.RawResponse(c, http.StatusOK, data) // In Node.js, returned raw responseJson
}

func (h *AttendanceHandler) GetMonthlyData(c *gin.Context) {
	yearStr := c.Param("year")
	monthStr := c.Param("month")
	
	year, err := strconv.Atoi(yearStr)
	if err != nil {
		utils.ErrorResponse(c, http.StatusBadRequest, "Invalid year", "VALIDATION_ERROR")
		return
	}
	month, err := strconv.Atoi(monthStr)
	if err != nil {
		utils.ErrorResponse(c, http.StatusBadRequest, "Invalid month", "VALIDATION_ERROR")
		return
	}

	data, err := h.attendanceService.GetMonthlyData(c.Request.Context(), year, month)
	if err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, err.Error(), "INTERNAL_ERROR")
		return
	}
	utils.RawResponse(c, http.StatusOK, data)
}

func (h *AttendanceHandler) UpdateLog(c *gin.Context) {
	req_ptr, ok := utils.BindAndValidate[dto.UpdateLogRequest](c)
	if !ok {
		return
	}
	req := *req_ptr

	err := h.attendanceService.UpdateLog(c.Request.Context(), req)
	if err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, err.Error(), "INTERNAL_ERROR")
		return
	}
	utils.SuccessResponse(c, http.StatusOK, "Data updated successfully", nil)
}

func (h *AttendanceHandler) UploadLogs(c *gin.Context) {
	file, err := c.FormFile("file")
	if err != nil {
		utils.ErrorResponse(c, http.StatusBadRequest, "No file uploaded", "VALIDATION_ERROR")
		return
	}

	userID := getUserID(c)

	dryRunStr := c.PostForm("dryRun")
	isDryRun := dryRunStr == "true" || dryRunStr == "1"

	jobType := "IMPORT_ATTENDANCE"
	if isDryRun {
		jobType = "IMPORT_ATTENDANCE_DRY_RUN"
	}

	notes := c.PostForm("notes")
	defaultNotes := "Import Absensi"
	if isDryRun {
		defaultNotes = "Simulasi Import Absensi (Dry Run)"
	}
	finalNotes := defaultNotes
	if notes != "" {
		finalNotes = defaultNotes + " | " + notes
	}

	uploadDir := filepath.Join(config.AppConfig.StoragePath, "uploads", "attendance") + string(filepath.Separator)
	// Ensure directory exists
	os.MkdirAll(uploadDir, os.ModePerm)
	
	filepath := uploadDir + file.Filename
	
	if err := c.SaveUploadedFile(file, filepath); err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, "Failed to save file", "INTERNAL_ERROR")
		return
	}

	req := dto.CreateImportJobRequest{
		UserID:           userID,
		JobType:          jobType,
		OriginalFilename: file.Filename,
		FilePath:         filepath,
		Notes:            &finalNotes,
	}

	jobID, err := h.jobService.CreateImportJob(c.Request.Context(), req)
	if err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, err.Error(), "INTERNAL_ERROR")
		return
	}

	msg := "File masuk antrian pemrosesan."
	if isDryRun {
		msg = "Simulasi validasi berjalan di background..."
	}

	utils.RawResponse(c, http.StatusOK, gin.H{
		"success": true,
		"message": msg,
		"jobId":   jobID,
	})
}
