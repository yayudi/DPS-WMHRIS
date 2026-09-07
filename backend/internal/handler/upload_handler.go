package handler

import (
	"net/http"

	"github.com/dps-wmhris/backend/internal/dto"
	"github.com/dps-wmhris/backend/internal/service"
	"github.com/dps-wmhris/backend/internal/utils"
	"github.com/gin-gonic/gin"
)

type UploadHandler struct {
	storageService service.StorageService
}

func NewUploadHandler(storageService service.StorageService) *UploadHandler {
	return &UploadHandler{storageService: storageService}
}

func (h *UploadHandler) GetPresignedUrl(c *gin.Context) {
	req_ptr, ok := utils.BindAndValidate[dto.SinglePresignedUrlRequest](c)
	if !ok {
		return
	}
	req := *req_ptr

	url, key, publicUrl, err := h.storageService.GeneratePresignedUploadUrl(c.Request.Context(), req.FileName, req.MimeType, req.Folder)
	if err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, "Gagal men-generate URL upload.", "STORAGE_ERROR")
		return
	}

	utils.RawResponse(c, http.StatusOK, gin.H{
		"success": true,
		"message": "Presigned URL berhasil dibuat",
		"data": gin.H{
			"url":       url,
			"key":       key,
			"publicUrl": publicUrl,
		},
	})
}
