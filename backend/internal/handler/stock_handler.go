package handler

import (
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"path/filepath"

	"github.com/dps-wmhris/backend/internal/utils"

	"github.com/dps-wmhris/backend/internal/config"

	"github.com/dps-wmhris/backend/internal/dto"
	"github.com/dps-wmhris/backend/internal/service"
	"github.com/gin-gonic/gin"
)

type StockHandler struct {
	stockService service.StockService
	jobService   service.JobService
}

func NewStockHandler(stockService service.StockService, jobService service.JobService) *StockHandler {
	return &StockHandler{
		stockService: stockService,
		jobService:   jobService,
	}
}

func (h *StockHandler) MoveStock(c *gin.Context) {
	req_ptr, ok := utils.BindAndValidate[dto.MoveStockRequest](c)
	if !ok {
		return
	}
	req := *req_ptr

	userID := getUserID(c) // Menggunakan helper yang sama
	if userID == 0 {
		utils.ErrorResponse(c, http.StatusUnauthorized, "Tidak ada sesi pengguna", "UNAUTHORIZED")
		return
	}

	err := h.stockService.MoveStock(c.Request.Context(), userID, req)
	if err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, err.Error(), "INTERNAL_SERVER_ERROR")
		return
	}

	utils.SuccessResponse(c, http.StatusOK, "Mutasi stok berhasil dieksekusi secara atomik", nil)
}

func (h *StockHandler) ImportBatchInbound(c *gin.Context) {
	file, err := c.FormFile("file")
	if err != nil {
		utils.ErrorResponse(c, http.StatusBadRequest, "Tidak ada file yang diunggah.", "VALIDATION_ERROR")
		return
	}

	userID := getUserID(c)
	notes := c.PostForm("notes")
	finalNotes := "Batch Stock Inbound"
	if notes != "" {
		finalNotes += " | " + notes
	}

	uploadDir := filepath.Join(config.AppConfig.StoragePath, "uploads", "stock") + string(filepath.Separator)
	os.MkdirAll(uploadDir, os.ModePerm)
	filepath := uploadDir + file.Filename

	if err := c.SaveUploadedFile(file, filepath); err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, "Failed to save file", "INTERNAL_ERROR")
		return
	}

	req := dto.CreateImportJobRequest{
		UserID:           userID,
		JobType:          "IMPORT_STOCK_INBOUND",
		OriginalFilename: file.Filename,
		FilePath:         filepath,
		Notes:            &finalNotes,
	}

	jobID, err := h.jobService.CreateImportJob(c.Request.Context(), req)
	if err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, err.Error(), "INTERNAL_ERROR")
		return
	}

	utils.SuccessResponse(c, http.StatusOK, "File inbound masuk antrian.", jobID)
}

func (h *StockHandler) GetAllStocks(c *gin.Context) {
	stocks, err := h.stockService.GetAllStocks(c.Request.Context())
	if err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, err.Error(), "")
		return
	}
	utils.SuccessDataResponse(c, http.StatusOK, stocks)
}

func (h *StockHandler) TransferStock(c *gin.Context) {
	req_ptr, ok := utils.BindAndValidate[dto.TransferStockRequest](c)
	if !ok {
		return
	}
	req := *req_ptr

	userID := getUserID(c)
	if userID == 0 {
		utils.ErrorResponse(c, http.StatusUnauthorized, "Tidak ada sesi pengguna", "")
		return
	}

	// Membungkus panggilan ke MoveStock
	moveReq := dto.MoveStockRequest{
		ProductID:      req.ProductID,
		Quantity:       req.Quantity,
		MovementType:   "TRANSFER",
		FromLocationID: &req.FromLocationID,
		ToLocationID:   &req.ToLocationID,
		Notes:          req.Notes,
	}

	if err := h.stockService.MoveStock(c.Request.Context(), userID, moveReq); err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, err.Error(), "")
		return
	}

	utils.SuccessResponse(c, http.StatusOK, "Transfer stok berhasil.", nil)
}

func (h *StockHandler) AdjustStock(c *gin.Context) {
	req_ptr, ok := utils.BindAndValidate[dto.AdjustStockRequest](c)
	if !ok {
		return
	}
	req := *req_ptr

	userID := getUserID(c)
	if userID == 0 {
		utils.ErrorResponse(c, http.StatusUnauthorized, "Tidak ada sesi pengguna", "")
		return
	}

	// Konversi input logic berdasarkan type
	movementType := "ADJUST_PLUS"
	qty := req.Quantity
	var fromLocationID, toLocationID *int

	if req.Type == "ADJUST_MINUS" || req.Type == "OUT" {
		movementType = "ADJUST_MINUS"
		if qty > 0 {
			qty = -qty
		}
	} else if req.Type == "ADJUST_PLUS" || req.Type == "IN" {
		movementType = "ADJUST_PLUS"
		if qty < 0 {
			qty = -qty
		}
	}

	if qty > 0 {
		toLocationID = &req.LocationID
	} else if qty < 0 {
		fromLocationID = &req.LocationID
	} else {
		utils.ErrorResponse(c, http.StatusBadRequest, "Quantity tidak boleh 0", "")
		return
	}
	
	// abs the quantity for moveReq because MoveStock expects positive quantity
	absQty := qty
	if absQty < 0 {
		absQty = -absQty
	}

	moveReq := dto.MoveStockRequest{
		ProductID:      req.ProductID,
		Quantity:       absQty,
		MovementType:   movementType,
		FromLocationID: fromLocationID,
		ToLocationID:   toLocationID,
		Notes:          req.Notes,
	}

	if err := h.stockService.MoveStock(c.Request.Context(), userID, moveReq); err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, err.Error(), "")
		return
	}

	utils.SuccessResponse(c, http.StatusOK, "Penyesuaian stok berhasil.", nil)
}

func (h *StockHandler) BatchProcess(c *gin.Context) {
	req_ptr, ok := utils.BindAndValidate[dto.BatchProcessRequest](c)
	if !ok {
		return
	}
	req := *req_ptr

	userID := c.GetInt("user_id")
	userRoleID := c.GetInt("role_id")

	err := h.stockService.ProcessBatchMovements(c.Request.Context(), req, userID, userRoleID)
	if err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, err.Error(), "")
		return
	}
	
	utils.RawResponse(c, http.StatusOK, gin.H{"success": true, "message": fmt.Sprintf("Batch %s berhasil.", req.Type)})
}

func (h *StockHandler) GetMovementTypes(c *gin.Context) {
	types, err := h.stockService.GetMovementTypes(c.Request.Context())
	if err != nil {
		utils.RawResponse(c, http.StatusInternalServerError, gin.H{"success": false, "message": "Gagal mengambil tipe pergerakan stok", "error": err.Error()})
		return
	}
	utils.SuccessDataResponse(c, http.StatusOK, types)
}

func (h *StockHandler) GetBatchLogs(c *gin.Context) {
	filter_ptr, ok := utils.BindQueryAndValidate[dto.BatchLogFilter](c)
	if !ok {
		return
	}
	filter := *filter_ptr

	// Set default start/end dates if not provided
	if filter.StartDate == "" || filter.EndDate == "" {
		utils.ErrorResponse(c, http.StatusBadRequest, "Tanggal mulai dan selesai harus diisi", "")
		return
	}

	logs, total, err := h.stockService.GetBatchLogs(c.Request.Context(), filter)
	if err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, "Gagal mengambil log stok: "+err.Error(), "")
		return
	}

	utils.RawResponse(c, http.StatusOK, gin.H{
		"success": true, 
		"data": logs,
		"pagination": gin.H{
			"page": filter.Page,
			"limit": filter.Limit,
			"total": total,
		},
	})
}

func (h *StockHandler) GetStockHistory(c *gin.Context) {
	var filter dto.StockHistoryFilter
	if err := c.ShouldBindUri(&filter); err != nil {
		utils.ErrorResponse(c, http.StatusBadRequest, "ID produk tidak valid: "+err.Error(), "VALIDATION_ERROR")
		return
	}
	if err := c.ShouldBindQuery(&filter); err != nil {
		utils.ErrorResponse(c, http.StatusBadRequest, "Filter tidak valid: "+err.Error(), "VALIDATION_ERROR")
		return
	}

	result, err := h.stockService.GetStockHistory(c.Request.Context(), filter)
	if err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, "Gagal mengambil riwayat stok: "+err.Error(), "")
		return
	}

	utils.RawResponse(c, http.StatusOK, gin.H{
		"success": true,
		"data": result.Data,
		"pagination": result.Pagination,
	})
}

func (h *StockHandler) BatchTransfer(c *gin.Context) {
	req_ptr, ok := utils.BindAndValidate[dto.BatchTransferRequest](c)
	if !ok {
		return
	}
	req := *req_ptr
	userID := getUserID(c)
	roleID := c.GetInt("role_id")
	if userID == 0 {
		utils.ErrorResponse(c, http.StatusUnauthorized, "Unauthorized", "")
		return
	}

	processReq := dto.BatchProcessRequest{
		Type:           "TRANSFER",
		FromLocationID: &req.FromLocationID,
		ToLocationID:   &req.ToLocationID,
		Movements:      req.Movements,
	}

	err := h.stockService.ProcessBatchMovements(c.Request.Context(), processReq, userID, roleID)
	if err != nil {
		utils.ErrorResponse(c, http.StatusBadRequest, err.Error(), "")
		return
	}
	utils.SuccessResponse(c, http.StatusOK, "Batch transfer berhasil.", nil)
}

func (h *StockHandler) ValidateReturn(c *gin.Context) {
	req_ptr, ok := utils.BindAndValidate[dto.ValidateReturnRequest](c)
	if !ok {
		return
	}
	req := *req_ptr
	userID := getUserID(c)
	if userID == 0 {
		utils.ErrorResponse(c, http.StatusUnauthorized, "Unauthorized", "")
		return
	}

	err := h.stockService.ValidateReturn(c.Request.Context(), req, userID)
	if err != nil {
		utils.ErrorResponse(c, http.StatusBadRequest, err.Error(), "")
		return
	}
	utils.RawResponse(c, http.StatusOK, gin.H{"success": true, "message": fmt.Sprintf("Item (ID: %d) berhasil divalidasi.", req.PickingListItemID)})
}

func (h *StockHandler) RequestBatchLogExport(c *gin.Context) {
	req_ptr, ok := utils.BindAndValidate[dto.BatchLogExportRequest](c)
	if !ok {
		return
	}
	req := *req_ptr
	userID := getUserID(c)
	if userID == 0 {
		utils.ErrorResponse(c, http.StatusUnauthorized, "Unauthorized", "")
		return
	}

	filterMap := map[string]interface{}{
		"startDate":           req.StartDate,
		"endDate":             req.EndDate,
		"productName":         req.ProductName,
		"movementType":        req.MovementType,
		"sourceLocation":      req.SourceLocation,
		"destinationLocation": req.DestinationLocation,
		"notes":               req.Notes,
		"format":              req.Format,
		"exportName":          req.ExportName,
	}
	
	filterJSON, _ := json.Marshal(filterMap)
	filterStr := string(filterJSON)

	jobReq := dto.CreateExportJobRequest{
		UserID:  userID,
		JobType: "BATCH_LOG_EXPORT",
		Filters: &filterStr,
	}

	jobID, err := h.jobService.CreateExportJob(c.Request.Context(), jobReq)
	if err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, err.Error(), "")
		return
	}

	utils.SuccessResponse(c, http.StatusAccepted, "Permintaan ekspor batch log diterima. File sedang diproses.", jobID)
}

func (h *StockHandler) GetInboundTemplate(c *gin.Context) {
	f, err := h.stockService.GenerateInboundTemplate(c.Request.Context())
	if err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, err.Error(), "")
		return
	}

	c.Header("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
	c.Header("Content-Disposition", "attachment; filename=Template_Inbound_Stok.xlsx")
	f.Write(c.Writer)
}

func (h *StockHandler) DownloadAdjustmentTemplate(c *gin.Context) {
	f, err := h.stockService.GenerateAdjustmentTemplate(c.Request.Context())
	if err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, err.Error(), "")
		return
	}

	c.Header("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
	c.Header("Content-Disposition", "attachment; filename=Template_Adjustment_Stok.xlsx")
	f.Write(c.Writer)
}

func (h *StockHandler) RequestAdjustmentUpload(c *gin.Context) {
	file, err := c.FormFile("adjustmentFile")
	if err != nil {
		utils.ErrorResponse(c, http.StatusBadRequest, "Tidak ada file yang diunggah.", "")
		return
	}
	userID := getUserID(c)
	if userID == 0 {
		utils.ErrorResponse(c, http.StatusUnauthorized, "Unauthorized", "")
		return
	}

	isDryRun := c.PostForm("dryRun") == "true"
	jobType := "ADJUST_STOCK"
	msg := "File adjustment masuk antrian."
	notes := "Stock Opname"
	if isDryRun {
		jobType = "ADJUST_STOCK_DRY_RUN"
		msg = "Simulasi validasi stok berjalan..."
		notes = "Simulasi Stock Opname"
	}
	if userNotes := c.PostForm("notes"); userNotes != "" {
		notes = userNotes
	}

	uploadDir := filepath.Join(config.AppConfig.StoragePath, "uploads", "stock") + string(filepath.Separator)
	os.MkdirAll(uploadDir, os.ModePerm)
	filepath := uploadDir + file.Filename
	if err := c.SaveUploadedFile(file, filepath); err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, "Gagal menyimpan file", "")
		return
	}

	req := dto.CreateImportJobRequest{
		UserID:           userID,
		JobType:          jobType,
		OriginalFilename: file.Filename,
		FilePath:         filepath,
		Notes:            &notes,
	}

	jobID, err := h.jobService.CreateImportJob(c.Request.Context(), req)
	if err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, err.Error(), "")
		return
	}

	utils.RawResponse(c, http.StatusOK, gin.H{
		"success": true,
		"message": msg,
		"jobId":   jobID,
	})
}
