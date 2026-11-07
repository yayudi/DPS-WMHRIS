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

type AttendanceHandler struct {
	attendanceUseCase hris_port.AttendanceUseCase
	jobService        system_usecase.JobService
}

func NewAttendanceHandler(attendanceUseCase hris_port.AttendanceUseCase, jobService system_usecase.JobService) *AttendanceHandler {
	return &AttendanceHandler{
		attendanceUseCase: attendanceUseCase,
		jobService:        jobService,
	}
}

func (h *AttendanceHandler) GetIndexes(c *gin.Context) {
	indexes, err := h.attendanceUseCase.GetIndexes(c.Request.Context())
	if err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, err.Error(), "INTERNAL_ERROR")
		return
	}
	utils.RawResponse(c, http.StatusOK, indexes) // In Node.js, this returned raw indexes
}

func (h *AttendanceHandler) GetHistory(c *gin.Context) {
	req_ptr, ok := utils.BindQueryAndValidate[hris_dto.GetHistoryRequest](c)
	if !ok {
		return
	}
	req := *req_ptr

	data, err := h.attendanceUseCase.GetHistory(c.Request.Context(), req.StartDate, req.EndDate, req.Search)
	if err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, err.Error(), "INTERNAL_ERROR")
		return
	}
	utils.SuccessDataResponse(c, http.StatusOK, data)
}

func (h *AttendanceHandler) GetRangeData(c *gin.Context) {
	req_ptr, ok := utils.BindQueryAndValidate[hris_dto.GetRangeDataRequest](c)
	if !ok {
		return
	}
	req := *req_ptr

	data, err := h.attendanceUseCase.GetRangeData(c.Request.Context(), req.StartDate, req.EndDate)
	if err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, err.Error(), "INTERNAL_ERROR")
		return
	}
	utils.RawResponse(c, http.StatusOK, data) // In Node.js, returned raw responseJson
}

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
		utils.ErrorResponse(c, http.StatusInternalServerError, err.Error(), "INTERNAL_ERROR")
		return
	}
	utils.RawResponse(c, http.StatusOK, data)
}

func (h *AttendanceHandler) UpdateLog(c *gin.Context) {
	req_ptr, ok := utils.BindAndValidate[hris_dto.UpdateLogRequest](c)
	if !ok {
		return
	}
	req := *req_ptr

	err := h.attendanceUseCase.UpdateLog(c.Request.Context(), req)
	if err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, err.Error(), "INTERNAL_ERROR")
		return
	}
	utils.SuccessResponse(c, http.StatusOK, "Data updated successfully", nil)
}

func (h *AttendanceHandler) UploadLogs(c *gin.Context) {
	savedPath, origName, ok := utils.SaveImportUpload(c, "file", "attendance")
	if !ok {
		return
	}

	userID := middleware.GetUserID(c)
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
		utils.ErrorResponse(c, http.StatusInternalServerError, err.Error(), "INTERNAL_ERROR")
		return
	}

	msg := "File masuk antrian pemrosesan."
	if isDryRun {
		msg = "Simulasi validasi berjalan di background..."
	}

	utils.JobCreatedResponse(c, http.StatusOK, msg, jobID)
}
