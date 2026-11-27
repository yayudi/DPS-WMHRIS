// Package http implements Gin HTTP handlers for HRIS attendance, schedule, and shift endpoints.
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

// AttendanceHandler exposes HTTP endpoints for employee attendance summaries, history, edits, and CSV imports.
type AttendanceHandler struct {
	attendanceUseCase hris_port.AttendanceUseCase
	jobService        system_port.JobService
}

// NewAttendanceHandler creates a new AttendanceHandler.
func NewAttendanceHandler(attendanceUseCase hris_port.AttendanceUseCase, jobService system_port.JobService) *AttendanceHandler {
	return &AttendanceHandler{
		attendanceUseCase: attendanceUseCase,
		jobService:        jobService,
	}
}

// GetIndexes returns available year-to-months attendance index mappings in raw format for frontend compatibility.
func (h *AttendanceHandler) GetIndexes(c *gin.Context) {
	indexes, err := h.attendanceUseCase.GetIndexes(c.Request.Context())
	if err != nil {
		utils.HandleDomainError(c, err)
		return
	}
	utils.RawResponse(c, http.StatusOK, indexes)
}

// GetHistory returns filtered attendance history rows within the requested date range.
func (h *AttendanceHandler) GetHistory(c *gin.Context) {
	reqPtr, ok := utils.BindQueryAndValidate[hris_dto.GetHistoryRequest](c)
	if !ok {
		return
	}
	req := *reqPtr

	data, err := h.attendanceUseCase.GetHistory(c.Request.Context(), req.StartDate, req.EndDate, req.Search)
	if err != nil {
		utils.HandleDomainError(c, err)
		return
	}
	utils.SuccessDataResponse(c, http.StatusOK, data)
}

// GetRangeData returns attendance logs, active employees, and working-day calendar summary across a date range.
func (h *AttendanceHandler) GetRangeData(c *gin.Context) {
	reqPtr, ok := utils.BindQueryAndValidate[hris_dto.GetRangeDataRequest](c)
	if !ok {
		return
	}
	req := *reqPtr

	data, err := h.attendanceUseCase.GetRangeData(c.Request.Context(), req.StartDate, req.EndDate)
	if err != nil {
		utils.HandleDomainError(c, err)
		return
	}
	utils.RawResponse(c, http.StatusOK, data)
}

// GetMonthlyData returns attendance logs, active employees, and working-day calendar summary for a single month.
func (h *AttendanceHandler) GetMonthlyData(c *gin.Context) {
	year, ok := utils.ParseIntParam(c, "year")
	if !ok {
		return
	}
	month, ok := utils.ParseIntParam(c, "month")
	if !ok {
		return
	}

	data, err := h.attendanceUseCase.GetMonthlyData(c.Request.Context(), year, month)
	if err != nil {
		utils.HandleDomainError(c, err)
		return
	}
	utils.RawResponse(c, http.StatusOK, data)
}

// UpdateLog updates or inserts a single employee's daily attendance record.
func (h *AttendanceHandler) UpdateLog(c *gin.Context) {
	reqPtr, ok := utils.BindAndValidate[hris_dto.UpdateLogRequest](c)
	if !ok {
		return
	}
	req := *reqPtr

	if err := h.attendanceUseCase.UpdateLog(c.Request.Context(), req); err != nil {
		utils.HandleDomainError(c, err)
		return
	}
	utils.SuccessResponse(c, http.StatusOK, "hris.attendance.update_success", nil)
}

// UploadLogs queues an asynchronous attendance CSV import or dry-run simulation job.
func (h *AttendanceHandler) UploadLogs(c *gin.Context) {
	userID, ok := utils.RequireUserID(c)
	if !ok {
		return
	}

	savedPath, origName, ok := utils.SaveImportUpload(c, "file", "attendance")
	if !ok {
		return
	}

	jobType, finalNotes, isDryRun := utils.ParseImportJobMeta(c, "IMPORT_ATTENDANCE", "Import Absensi", "Simulasi Import Absensi (Dry Run)")

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

	msgKey := "hris.attendance.job_queued"
	if isDryRun {
		msgKey = "hris.attendance.simulation_queued"
	}

	utils.JobCreatedResponse(c, http.StatusOK, msgKey, jobID)
}
