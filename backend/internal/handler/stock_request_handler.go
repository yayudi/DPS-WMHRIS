package handler

import (
	"fmt"

	"github.com/dps-wmhris/backend/internal/utils"

	"net/http"
	"strconv"

	"github.com/dps-wmhris/backend/internal/dto"
	"github.com/dps-wmhris/backend/internal/service"
	"github.com/gin-gonic/gin"
)

type StockRequestHandler struct {
	stockRequestService service.StockRequestService
}

func NewStockRequestHandler(stockRequestService service.StockRequestService) *StockRequestHandler {
	return &StockRequestHandler{stockRequestService: stockRequestService}
}

func (h *StockRequestHandler) Create(c *gin.Context) {
	req_ptr, ok := utils.BindAndValidate[dto.CreateStockRequest](c)
	if !ok {
		return
	}
	req := *req_ptr

	userID := getUserID(c)
	if userID == 0 {
		utils.ErrorResponse(c, http.StatusUnauthorized, "Tidak ada sesi pengguna", "UNAUTHORIZED")
		return
	}

	request, err := h.stockRequestService.CreateStockRequest(c.Request.Context(), userID, req)
	if err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, err.Error(), "INTERNAL_SERVER_ERROR")
		return
	}

	utils.SuccessResponse(c, http.StatusCreated, "Dokumen permintaan stok berhasil dibuat", request)
}

func (h *StockRequestHandler) GetAll(c *gin.Context) {
	requests, err := h.stockRequestService.GetAllStockRequests(c.Request.Context())
	if err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, err.Error(), "INTERNAL_SERVER_ERROR")
		return
	}

	utils.SuccessResponse(c, http.StatusOK, "Berhasil mengambil data permintaan stok", requests)
}

func (h *StockRequestHandler) Approve(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		utils.ErrorResponse(c, http.StatusBadRequest, "ID tidak valid", "")
		return
	}

	userID := getUserID(c)
	roleID := c.GetInt("role_id")
	if userID == 0 {
		utils.ErrorResponse(c, http.StatusUnauthorized, "Unauthorized", "")
		return
	}

	err = h.stockRequestService.ApproveStockRequest(c.Request.Context(), id, userID, roleID)
	if err != nil {
		utils.ErrorResponse(c, http.StatusBadRequest, err.Error(), "")
		return
	}

	utils.SuccessResponse(c, http.StatusOK, "Permintaan stok berhasil disetujui.", nil)
}

func (h *StockRequestHandler) Reject(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		utils.ErrorResponse(c, http.StatusBadRequest, "ID tidak valid", "")
		return
	}

	userID := getUserID(c)
	roleID := c.GetInt("role_id")
	if userID == 0 {
		utils.ErrorResponse(c, http.StatusUnauthorized, "Unauthorized", "")
		return
	}

	err = h.stockRequestService.RejectStockRequest(c.Request.Context(), id, userID, roleID)
	if err != nil {
		utils.ErrorResponse(c, http.StatusBadRequest, err.Error(), "")
		return
	}

	utils.SuccessResponse(c, http.StatusOK, "Permintaan stok telah ditolak.", nil)
}

func (h *StockRequestHandler) Dispatch(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		utils.ErrorResponse(c, http.StatusBadRequest, "ID tidak valid", "")
		return
	}

	userID := getUserID(c)
	roleID := c.GetInt("role_id")
	if userID == 0 {
		utils.ErrorResponse(c, http.StatusUnauthorized, "Unauthorized", "")
		return
	}

	err = h.stockRequestService.DispatchStockRequest(c.Request.Context(), id, userID, roleID)
	if err != nil {
		utils.ErrorResponse(c, http.StatusBadRequest, err.Error(), "")
		return
	}

	utils.SuccessResponse(c, http.StatusOK, "Barang berhasil dikirim dan stok asal telah dipotong.", nil)
}

func (h *StockRequestHandler) Complete(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		utils.ErrorResponse(c, http.StatusBadRequest, "ID tidak valid", "")
		return
	}

	req_ptr, ok := utils.BindAndValidate[dto.CompleteStockRequest](c)
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

	err = h.stockRequestService.CompleteStockRequest(c.Request.Context(), id, req, userID, roleID)
	if err != nil {
		utils.ErrorResponse(c, http.StatusBadRequest, err.Error(), "")
		return
	}

	utils.SuccessResponse(c, http.StatusOK, "Permintaan stok selesai dan stok telah ditransfer.", nil)
}

func (h *StockRequestHandler) BulkAction(c *gin.Context) {
	req_ptr, ok := utils.BindAndValidate[dto.BulkActionStockRequest](c)
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

	res, err := h.stockRequestService.BulkActionStockRequest(c.Request.Context(), req, userID, roleID)
	if err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, err.Error(), "")
		return
	}

	utils.RawResponse(c, http.StatusOK, gin.H{
		"success": true,
		"message": fmt.Sprintf("Memproses %d permintaan.", len(req.RequestIds)),
		"data":    res,
	})
}
