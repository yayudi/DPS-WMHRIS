package http

import (
	"encoding/json"
	"net/http"
	"os"

	inventory_dto "github.com/dps-wmhris/backend/internal/modules/inventory/application/dto"
	inventory_port "github.com/dps-wmhris/backend/internal/modules/inventory/port"
	system_dto "github.com/dps-wmhris/backend/internal/modules/system/application/dto"
	system_port "github.com/dps-wmhris/backend/internal/modules/system/port"
	"github.com/dps-wmhris/backend/internal/shared/middleware"
	"github.com/dps-wmhris/backend/internal/shared/utils"
	"github.com/gin-gonic/gin"
)

// StockHandler exposes HTTP endpoints for stock transfers, adjustments, batch operations, logs, templates, and async imports/exports.
type StockHandler struct {
	stockService inventory_port.StockUseCase
	jobService   system_port.JobService
}

// NewStockHandler creates a new StockHandler.
func NewStockHandler(stockService inventory_port.StockUseCase, jobService system_port.JobService) *StockHandler {
	return &StockHandler{
		stockService: stockService,
		jobService:   jobService,
	}
}

// ImportBatchInbound queues an asynchronous batch stock inbound Excel import job.
func (h *StockHandler) ImportBatchInbound(c *gin.Context) {
	userID, ok := utils.RequireUserID(c)
	if !ok {
		return
	}

	savedPath, origName, ok := utils.SaveImportUpload(c, "file", "stock")
	if !ok {
		return
	}

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

// GetAllStocks returns all current stock rows across non-deleted products and locations.
func (h *StockHandler) GetAllStocks(c *gin.Context) {
	stocks, err := h.stockService.GetAllStocks(c.Request.Context())
	if err != nil {
		utils.HandleDomainError(c, err)
		return
	}
	utils.SuccessDataResponse(c, http.StatusOK, stocks)
}

// TransferStock transfers stock quantity for one product from an origin location to a destination location.
func (h *StockHandler) TransferStock(c *gin.Context) {
	userID, ok := utils.RequireUserID(c)
	if !ok {
		return
	}

	reqPtr, ok := utils.BindAndValidate[inventory_dto.TransferStockRequest](c)
	if !ok {
		return
	}
	req := *reqPtr

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

// AdjustStock applies a positive or negative stock adjustment at a single location.
func (h *StockHandler) AdjustStock(c *gin.Context) {
	userID, ok := utils.RequireUserID(c)
	if !ok {
		return
	}

	reqPtr, ok := utils.BindAndValidate[inventory_dto.AdjustStockRequest](c)
	if !ok {
		return
	}
	req := *reqPtr

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
		movementType = "ADJUST_MINUS"
	} else {
		utils.ErrorResponse(c, http.StatusBadRequest, "wms.stock.err_qty_not_zero", "VALIDATION_ERROR")
		return
	}

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

// BatchProcess executes a batch of stock movements atomically.
func (h *StockHandler) BatchProcess(c *gin.Context) {
	userID, ok := utils.RequireUserID(c)
	if !ok {
		return
	}

	reqPtr, ok := utils.BindAndValidate[inventory_dto.BatchProcessRequest](c)
	if !ok {
		return
	}
	req := *reqPtr
	userRoleID := middleware.GetRoleID(c)

	if err := h.stockService.ProcessBatchMovements(c.Request.Context(), req, userID, userRoleID); err != nil {
		utils.HandleDomainError(c, err)
		return
	}

	utils.SuccessResponse(c, http.StatusOK, "wms.stock.batch_transfer_success", nil)
}

// GetMovementTypes returns distinct movement types available for log filtering.
func (h *StockHandler) GetMovementTypes(c *gin.Context) {
	types, err := h.stockService.GetMovementTypes(c.Request.Context())
	if err != nil {
		utils.HandleDomainError(c, err)
		return
	}
	utils.SuccessDataResponse(c, http.StatusOK, types)
}

// GetBatchLogs returns paginated stock movement logs within a required date range.
func (h *StockHandler) GetBatchLogs(c *gin.Context) {
	filterPtr, ok := utils.BindQueryAndValidate[inventory_dto.BatchLogFilter](c)
	if !ok {
		return
	}
	filter := *filterPtr

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

// GetStockHistory returns paginated movement history for one product.
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

// BatchTransfer transfers multiple SKUs between a single origin and destination location atomically.
func (h *StockHandler) BatchTransfer(c *gin.Context) {
	userID, ok := utils.RequireUserID(c)
	if !ok {
		return
	}

	reqPtr, ok := utils.BindAndValidate[inventory_dto.BatchTransferRequest](c)
	if !ok {
		return
	}
	req := *reqPtr
	roleID := middleware.GetRoleID(c)

	processReq := inventory_dto.BatchProcessRequest{
		Type:           "TRANSFER",
		FromLocationID: &req.FromLocationID,
		ToLocationID:   &req.ToLocationID,
		Movements:      req.Movements,
	}

	if err := h.stockService.ProcessBatchMovements(c.Request.Context(), processReq, userID, roleID); err != nil {
		utils.HandleDomainError(c, err)
		return
	}
	utils.SuccessResponse(c, http.StatusOK, "wms.stock.batch_transfer_success", nil)
}

// RequestBatchLogExport queues an asynchronous stock movement batch log export job.
func (h *StockHandler) RequestBatchLogExport(c *gin.Context) {
	userID, ok := utils.RequireUserID(c)
	if !ok {
		return
	}

	reqPtr, ok := utils.BindAndValidate[inventory_dto.BatchLogExportRequest](c)
	if !ok {
		return
	}
	req := *reqPtr

	filterMap := map[string]any{
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
	if req.UserID > 0 {
		filterMap["userId"] = req.UserID
	}

	filterJSON, err := json.Marshal(filterMap)
	if err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, "errors.internal_error", "INTERNAL_ERROR")
		return
	}
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

// GetInboundTemplate downloads the Excel template for batch stock inbound imports.
func (h *StockHandler) GetInboundTemplate(c *gin.Context) {
	f, err := h.stockService.GenerateInboundTemplate(c.Request.Context())
	if err != nil {
		utils.HandleDomainError(c, err)
		return
	}
	defer func() { _ = f.Close() }()

	utils.WriteExcelResponse(c, f, "Template_Inbound_Stok.xlsx")
}

// DownloadAdjustmentTemplate downloads the Excel template for stock opname/adjustment imports.
func (h *StockHandler) DownloadAdjustmentTemplate(c *gin.Context) {
	f, err := h.stockService.GenerateAdjustmentTemplate(c.Request.Context())
	if err != nil {
		utils.HandleDomainError(c, err)
		return
	}
	defer func() { _ = f.Close() }()

	utils.WriteExcelResponse(c, f, "Template_Adjustment_Stok.xlsx")
}

// RequestAdjustmentUpload queues an asynchronous stock opname/adjustment Excel import job.
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
