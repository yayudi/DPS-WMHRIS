package http

import (
	system_dto "github.com/dps-wmhris/backend/internal/modules/system/application/dto"

	system_usecase "github.com/dps-wmhris/backend/internal/modules/system/application/usecase"

	"encoding/json"
	"net/http"
	"os"

	inventory_dto "github.com/dps-wmhris/backend/internal/modules/inventory/application/dto"

	inventory_port "github.com/dps-wmhris/backend/internal/modules/inventory/port"
	"github.com/dps-wmhris/backend/internal/shared/middleware"
	"github.com/dps-wmhris/backend/internal/shared/utils"
	"github.com/gin-gonic/gin"
)

type StockHandler struct {
	stockService inventory_port.StockUseCase
	jobService   system_usecase.JobService
}

func NewStockHandler(stockService inventory_port.StockUseCase, jobService system_usecase.JobService) *StockHandler {
	return &StockHandler{
		stockService: stockService,
		jobService:   jobService,
	}
}

func (h *StockHandler) ImportBatchInbound(c *gin.Context) {
	savedPath, origName, ok := utils.SaveImportUpload(c, "file", "stock")
	if !ok {
		return
	}

	userID := middleware.GetUserID(c)
	jobType, finalNotes, isDryRun := utils.ParseImportJobMeta(
		c,
		"IMPORT_STOCK_INBOUND",
		"Batch Stock Inbound",
		"Simulasi Batch Stock Inbound",
	)

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

	msg := "File inbound masuk antrian."
	if isDryRun {
		msg = "Simulasi validasi inbound berjalan..."
	}
	utils.JobCreatedResponse(c, http.StatusOK, msg, jobID)
}

func (h *StockHandler) GetAllStocks(c *gin.Context) {
	stocks, err := h.stockService.GetAllStocks(c.Request.Context())
	if err != nil {
		utils.HandleDomainError(c, err)
		return
	}
	utils.SuccessDataResponse(c, http.StatusOK, stocks)
}

func (h *StockHandler) TransferStock(c *gin.Context) {
	req_ptr, ok := utils.BindAndValidate[inventory_dto.TransferStockRequest](c)
	if !ok {
		return
	}
	req := *req_ptr

	userID, ok := utils.RequireUserID(c)
	if !ok {
		return
	}

	// Membungkus panggilan ke MoveStock
	moveReq := inventory_dto.MoveStockRequest{
		ProductID:      req.ProductID,
		Quantity:       req.Quantity,
		MovementType:   "TRANSFER",
		FromLocationID: &req.FromLocationID,
		ToLocationID:   &req.ToLocationID,
		Notes:          req.Notes,
	}

	if err := h.stockService.MoveStock(c.Request.Context(), userID, moveReq); err != nil {
		utils.HandleDomainError(c, err)
		return
	}

	utils.SuccessResponse(c, http.StatusOK, "wms.stock.transfer_success", nil)
}

func (h *StockHandler) AdjustStock(c *gin.Context) {
	req_ptr, ok := utils.BindAndValidate[inventory_dto.AdjustStockRequest](c)
	if !ok {
		return
	}
	req := *req_ptr

	userID, ok := utils.RequireUserID(c)
	if !ok {
		return
	}

	// Konversi input logic berdasarkan type
	movementType := "ADJUST_PLUS"
	qty := req.Quantity
	var fromLocationID, toLocationID *int

	switch req.Type {
	case "ADJUST_MINUS", "OUT":
		movementType = "ADJUST_MINUS"
		if qty > 0 {
			qty = -qty
		}
	case "ADJUST_PLUS", "IN":
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
		utils.ErrorResponse(c, http.StatusBadRequest, "wms.stock.err_qty_not_zero", "VALIDATION_ERROR")
		return
	}

	// abs the quantity for moveReq because MoveStock expects positive quantity
	absQty := qty
	if absQty < 0 {
		absQty = -absQty
	}

	moveReq := inventory_dto.MoveStockRequest{
		ProductID:      req.ProductID,
		Quantity:       absQty,
		MovementType:   movementType,
		FromLocationID: fromLocationID,
		ToLocationID:   toLocationID,
		Notes:          req.Notes,
	}

	if err := h.stockService.MoveStock(c.Request.Context(), userID, moveReq); err != nil {
		utils.HandleDomainError(c, err)
		return
	}

	utils.SuccessResponse(c, http.StatusOK, "wms.stock.adjustment_success", nil)
}

func (h *StockHandler) BatchProcess(c *gin.Context) {
	req_ptr, ok := utils.BindAndValidate[inventory_dto.BatchProcessRequest](c)
	if !ok {
		return
	}
	req := *req_ptr

	userID := middleware.GetUserID(c)
	userRoleID := middleware.GetRoleID(c)

	err := h.stockService.ProcessBatchMovements(c.Request.Context(), req, userID, userRoleID)
	if err != nil {
		utils.HandleDomainError(c, err)
		return
	}

	utils.SuccessResponse(c, http.StatusOK, "wms.stock.batch_transfer_success", nil)
}

func (h *StockHandler) GetMovementTypes(c *gin.Context) {
	types, err := h.stockService.GetMovementTypes(c.Request.Context())
	if err != nil {
		utils.HandleDomainError(c, err)
		return
	}
	utils.SuccessDataResponse(c, http.StatusOK, types)
}

func (h *StockHandler) GetBatchLogs(c *gin.Context) {
	filter_ptr, ok := utils.BindQueryAndValidate[inventory_dto.BatchLogFilter](c)
	if !ok {
		return
	}
	filter := *filter_ptr

	// Set default start/end dates if not provided
	if filter.StartDate == "" || filter.EndDate == "" {
		utils.ErrorResponse(c, http.StatusBadRequest, "wms.investigation.err_date_range", "VALIDATION_ERROR")
		return
	}

	result, err := h.stockService.GetBatchLogs(c.Request.Context(), filter)
	if err != nil {
		utils.HandleDomainError(c, err)
		return
	}

	utils.PaginatedResponse(c, http.StatusOK, result.Data, result.Page, result.Limit, result.Total, result.TotalPages)
}

func (h *StockHandler) GetStockHistory(c *gin.Context) {
	var filter inventory_dto.StockHistoryFilter
	if err := c.ShouldBindUri(&filter); err != nil {
		utils.ErrorResponse(c, http.StatusBadRequest, "errors.validation_error", "VALIDATION_ERROR")
		return
	}
	if err := c.ShouldBindQuery(&filter); err != nil {
		utils.ErrorResponse(c, http.StatusBadRequest, "errors.validation_error", "VALIDATION_ERROR")
		return
	}

	result, err := h.stockService.GetStockHistory(c.Request.Context(), filter)
	if err != nil {
		utils.HandleDomainError(c, err)
		return
	}

	utils.PaginatedResponse(c, http.StatusOK, result.Data, result.Page, result.Limit, result.Total, result.TotalPages)
}

func (h *StockHandler) BatchTransfer(c *gin.Context) {
	req_ptr, ok := utils.BindAndValidate[inventory_dto.BatchTransferRequest](c)
	if !ok {
		return
	}
	req := *req_ptr
	userID, ok := utils.RequireUserID(c)
	if !ok {
		return
	}
	roleID := middleware.GetRoleID(c)

	processReq := inventory_dto.BatchProcessRequest{
		Type:           "TRANSFER",
		FromLocationID: &req.FromLocationID,
		ToLocationID:   &req.ToLocationID,
		Movements:      req.Movements,
	}

	err := h.stockService.ProcessBatchMovements(c.Request.Context(), processReq, userID, roleID)
	if err != nil {
		utils.HandleDomainError(c, err)
		return
	}
	utils.SuccessResponse(c, http.StatusOK, "wms.stock.batch_transfer_success", nil)
}

func (h *StockHandler) RequestBatchLogExport(c *gin.Context) {
	req_ptr, ok := utils.BindAndValidate[inventory_dto.BatchLogExportRequest](c)
	if !ok {
		return
	}
	req := *req_ptr
	userID, ok := utils.RequireUserID(c)
	if !ok {
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
		"exportType":          "BATCH_LOG_EXPORT",
	}

	filterJSON, _ := json.Marshal(filterMap)
	filterStr := string(filterJSON)

	jobReq := system_dto.CreateExportJobRequest{
		UserID:  userID,
		JobType: "BATCH_LOG_EXPORT",
		Filters: &filterStr,
	}

	jobID, err := h.jobService.CreateExportJob(c.Request.Context(), jobReq)
	if err != nil {
		utils.HandleDomainError(c, err)
		return
	}

	utils.JobCreatedResponse(c, http.StatusAccepted, "wms.stock.batch_log_export_queued", jobID)
}

func (h *StockHandler) GetInboundTemplate(c *gin.Context) {
	f, err := h.stockService.GenerateInboundTemplate(c.Request.Context())
	if err != nil {
		utils.HandleDomainError(c, err)
		return
	}

	utils.WriteExcelResponse(c, f, "Template_Inbound_Stok.xlsx")
}

func (h *StockHandler) DownloadAdjustmentTemplate(c *gin.Context) {
	f, err := h.stockService.GenerateAdjustmentTemplate(c.Request.Context())
	if err != nil {
		utils.HandleDomainError(c, err)
		return
	}

	utils.WriteExcelResponse(c, f, "Template_Adjustment_Stok.xlsx")
}

func (h *StockHandler) RequestAdjustmentUpload(c *gin.Context) {
	userID, ok := utils.RequireUserID(c)
	if !ok {
		return
	}

	savedPath, origName, ok := utils.SaveImportUpload(c, "adjustmentFile", "stock")
	if !ok {
		return
	}

	jobType, notes, isDryRun := utils.ParseImportJobMeta(
		c,
		"ADJUST_STOCK",
		"Stock Opname",
		"Simulasi Stock Opname",
	)

	req := system_dto.CreateImportJobRequest{
		UserID:           userID,
		JobType:          jobType,
		OriginalFilename: origName,
		FilePath:         savedPath,
		Notes:            &notes,
	}

	jobID, err := h.jobService.CreateImportJob(c.Request.Context(), req)
	if err != nil {
		_ = os.Remove(savedPath)
		utils.HandleDomainError(c, err)
		return
	}

	msg := "File adjustment masuk antrian."
	if isDryRun {
		msg = "Simulasi validasi stok berjalan..."
	}
	utils.JobCreatedResponse(c, http.StatusOK, msg, jobID)
}
