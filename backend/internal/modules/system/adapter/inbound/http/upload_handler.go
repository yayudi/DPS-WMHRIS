package http

import (
	"net/http"

	system_dto "github.com/dps-wmhris/backend/internal/modules/system/application/dto"

	system_usecase "github.com/dps-wmhris/backend/internal/modules/system/application/usecase"
	"github.com/dps-wmhris/backend/internal/shared/utils"
	"github.com/gin-gonic/gin"
)

type UploadHandler struct {
	storageService system_usecase.StorageService
}

func NewUploadHandler(storageService system_usecase.StorageService) *UploadHandler {
	return &UploadHandler{storageService: storageService}
}

func (h *UploadHandler) GetPresignedUrl(c *gin.Context) {
	req_ptr, ok := utils.BindAndValidate[system_dto.SinglePresignedUrlRequest](c)
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
