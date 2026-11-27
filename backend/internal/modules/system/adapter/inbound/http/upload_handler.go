package http

import (
	"log"
	"net/http"

	system_dto "github.com/dps-wmhris/backend/internal/modules/system/application/dto"
	"github.com/dps-wmhris/backend/internal/modules/system/port"
	"github.com/dps-wmhris/backend/internal/shared/utils"
	"github.com/gin-gonic/gin"
)

// UploadHandler handles HTTP endpoints for generating single-file presigned cloud upload URLs.
type UploadHandler struct {
	storageService port.StorageService
}

// NewUploadHandler constructs an UploadHandler backed by StorageService.
func NewUploadHandler(storageService port.StorageService) *UploadHandler {
	return &UploadHandler{storageService: storageService}
}

// GetPresignedUrl generates a single presigned R2 PUT URL for authenticated file uploads.
func (h *UploadHandler) GetPresignedUrl(c *gin.Context) {
	if _, ok := utils.RequireUserID(c); !ok {
		return
	}

	reqPtr, ok := utils.BindAndValidate[system_dto.SinglePresignedUrlRequest](c)
	if !ok {
		return
	}
	req := *reqPtr

	uploadURL, key, publicURL, err := h.storageService.GeneratePresignedUploadUrl(c.Request.Context(), req.FileName, req.MimeType, req.Folder)
	if err != nil {
		log.Printf("[UPLOAD] GetPresignedUrl failed for file %s: %v", req.FileName, err)
		utils.ErrorResponse(c, http.StatusInternalServerError, "system.upload.generate_failed", "STORAGE_ERROR")
		return
	}

	utils.SuccessResponse(c, http.StatusOK, "system.upload.generate_success", gin.H{
		"url":       uploadURL,
		"key":       key,
		"publicUrl": publicURL,
	})
}
