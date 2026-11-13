package http

import (
	"log"
	"net/http"

	misc_dto "github.com/dps-wmhris/backend/internal/modules/misc/application/dto"

	misc_usecase "github.com/dps-wmhris/backend/internal/modules/misc/application/usecase"
	"github.com/dps-wmhris/backend/internal/shared/middleware"
	"github.com/dps-wmhris/backend/internal/shared/utils"
	"github.com/gin-gonic/gin"
)

type PaperSizeHandler struct {
	paperSizeService misc_usecase.PaperSizeService
}

func NewPaperSizeHandler(paperSizeService misc_usecase.PaperSizeService) *PaperSizeHandler {
	return &PaperSizeHandler{paperSizeService: paperSizeService}
}

func (h *PaperSizeHandler) GetAllPaperSizes(c *gin.Context) {
	data, err := h.paperSizeService.GetAllPaperSizes(c.Request.Context())
	if err != nil {
		log.Printf("[ERROR] GetAllPaperSizes: %v", err)
		utils.ErrorResponse(c, http.StatusInternalServerError, "settings.paper_size.fetch_failed", "INTERNAL_SERVER_ERROR")
		return
	}

	utils.SuccessDataResponse(c, http.StatusOK, data)
}

func (h *PaperSizeHandler) GetPaperSizeByID(c *gin.Context) {
	id, ok := utils.ParseIntParam(c, "id")
	if !ok {
		return
	}
	data, err := h.paperSizeService.GetPaperSizeByID(c.Request.Context(), id)
	if err != nil {
		utils.ErrorResponse(c, http.StatusNotFound, "settings.paper_size.not_found", "NOT_FOUND")
		return
	}

	utils.SuccessDataResponse(c, http.StatusOK, data)
}

func (h *PaperSizeHandler) CreatePaperSize(c *gin.Context) {
	req_ptr, ok := utils.BindAndValidate[misc_dto.CreatePaperSizeRequest](c)
	if !ok {
		return
	}
	req := *req_ptr

	userID := middleware.GetUserID(c)
	ip := c.ClientIP()
	userAgent := c.Request.UserAgent()

	id, err := h.paperSizeService.CreatePaperSize(c.Request.Context(), req, userID, ip, userAgent)
	if err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, "settings.paper_size.create_failed", "INTERNAL_SERVER_ERROR")
		return
	}

	utils.SuccessResponse(c, http.StatusCreated, "settings.paper_size.create_success", gin.H{"id": id})
}

func (h *PaperSizeHandler) UpdatePaperSize(c *gin.Context) {
	id, ok := utils.ParseIntParam(c, "id")
	if !ok {
		return
	}
	req_ptr, ok := utils.BindAndValidate[misc_dto.UpdatePaperSizeRequest](c)
	if !ok {
		return
	}
	req := *req_ptr

	userID := middleware.GetUserID(c)
	ip := c.ClientIP()
	userAgent := c.Request.UserAgent()

	err := h.paperSizeService.UpdatePaperSize(c.Request.Context(), id, req, userID, ip, userAgent)
	if err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, "settings.paper_size.update_failed", "INTERNAL_SERVER_ERROR")
		return
	}

	utils.SuccessResponse(c, http.StatusOK, "settings.paper_size.update_success", nil)
}

func (h *PaperSizeHandler) DeletePaperSize(c *gin.Context) {
	id, ok := utils.ParseIntParam(c, "id")
	if !ok {
		return
	}
	userID := middleware.GetUserID(c)
	ip := c.ClientIP()
	userAgent := c.Request.UserAgent()

	err := h.paperSizeService.DeletePaperSize(c.Request.Context(), id, userID, ip, userAgent)
	if err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, "settings.paper_size.delete_failed", "INTERNAL_SERVER_ERROR")
		return
	}

	utils.SuccessResponse(c, http.StatusOK, "settings.paper_size.delete_success", nil)
}
