// Package http implements Gin HTTP inbound adapters for the system module.
package http

import (
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"os"
	"strconv"
	"strings"

	system_dto "github.com/dps-wmhris/backend/internal/modules/system/application/dto"
	"github.com/dps-wmhris/backend/internal/modules/system/domain"
	"github.com/dps-wmhris/backend/internal/modules/system/port"
	"github.com/dps-wmhris/backend/internal/shared/database"
	"github.com/dps-wmhris/backend/internal/shared/utils"
	"github.com/gin-gonic/gin"
)

// MediaHandler handles HTTP endpoints for media asset management, R2 uploads, and bulk product linking.
type MediaHandler struct {
	mediaService   port.MediaService
	storageService port.StorageService
	jobService     port.JobService
}

// NewMediaHandler constructs a MediaHandler with media, storage, and job services.
func NewMediaHandler(mediaService port.MediaService, storageService port.StorageService, jobService port.JobService) *MediaHandler {
	return &MediaHandler{mediaService: mediaService, storageService: storageService, jobService: jobService}
}

// ListMedia returns a paginated list of media assets filtered by search keyword and link status.
func (h *MediaHandler) ListMedia(c *gin.Context) {
	page, limit := utils.ParsePagination(c, 20)

	var filter system_dto.MediaFilter
	if s := c.Query("search"); s != "" {
		filter.Search = strings.TrimSpace(s)
	}
	if ls := c.Query("linkStatus"); ls != "" {
		var statusMap map[string][]string
		if err := json.Unmarshal([]byte(ls), &statusMap); err == nil {
			filter.LinkStatus = statusMap
		} else if ls == "linked" || ls == "orphaned" {
			filter.RawStatus = ls
		}
	}

	result, err := h.mediaService.GetMediaAssets(c.Request.Context(), page, limit, filter)
	if err != nil {
		log.Printf("[MEDIA] ListMedia failed: %v", err)
		utils.ErrorResponse(c, http.StatusInternalServerError, "settings.media.fetch_failed", "INTERNAL_SERVER_ERROR")
		return
	}

	utils.PaginatedResponse(c, http.StatusOK, result.Data, result.Page, result.Limit, result.Total, result.TotalPages)
}

// GetMediaByID returns a single media asset along with its linked products.
func (h *MediaHandler) GetMediaByID(c *gin.Context) {
	id, ok := utils.ParseIntParam(c, "id")
	if !ok {
		return
	}
	asset, err := h.mediaService.GetMediaDetailsWithProducts(c.Request.Context(), id)
	if err != nil || asset == nil {
		utils.ErrorResponse(c, http.StatusNotFound, "settings.media.asset_not_found", "NOT_FOUND")
		return
	}
	utils.SuccessDataResponse(c, http.StatusOK, asset)
}

// GetMediaStatus returns processing status and paths for a comma-separated list of media IDs.
func (h *MediaHandler) GetMediaStatus(c *gin.Context) {
	idsStr := c.Query("ids")
	if idsStr == "" {
		utils.SuccessDataResponse(c, http.StatusOK, []system_dto.MediaAssetResponse{})
		return
	}

	parts := strings.Split(idsStr, ",")
	var ids []int
	for _, p := range parts {
		if id, err := strconv.Atoi(strings.TrimSpace(p)); err == nil && id > 0 {
			ids = append(ids, id)
		}
	}

	if len(ids) == 0 {
		utils.SuccessDataResponse(c, http.StatusOK, []system_dto.MediaAssetResponse{})
		return
	}

	assets, err := h.mediaService.GetMediaAssetsByIDs(c.Request.Context(), ids)
	if err != nil {
		log.Printf("[MEDIA] GetMediaStatus failed: %v", err)
		utils.ErrorResponse(c, http.StatusInternalServerError, "settings.media.fetch_status_failed", "INTERNAL_SERVER_ERROR")
		return
	}
	utils.SuccessDataResponse(c, http.StatusOK, assets)
}

// GetPresignedUrls generates main and thumbnail presigned R2 upload URLs for a batch of files.
func (h *MediaHandler) GetPresignedUrls(c *gin.Context) {
	reqPtr, ok := utils.BindAndValidate[system_dto.PresignedUrlRequest](c)
	if !ok {
		return
	}
	req := *reqPtr
	if len(req.Files) == 0 {
		utils.ErrorResponse(c, http.StatusBadRequest, "settings.media.invalid_file_list", "VALIDATION_ERROR")
		return
	}

	urls := make([]map[string]string, 0, len(req.Files))
	for _, f := range req.Files {
		mainURL, mainKey, _, err := h.storageService.GeneratePresignedUploadUrl(c.Request.Context(), f.Name, f.Type, "main")
		if err != nil {
			log.Printf("[MEDIA] Failed to generate main presigned URL for %s: %v", f.Name, err)
			utils.ErrorResponse(c, http.StatusInternalServerError, "system.upload.generate_failed", "STORAGE_ERROR")
			return
		}
		thumbURL, thumbKey, _, err := h.storageService.GeneratePresignedUploadUrl(c.Request.Context(), "thumb_"+f.Name, f.Type, "thumb")
		if err != nil {
			log.Printf("[MEDIA] Failed to generate thumb presigned URL for %s: %v", f.Name, err)
			utils.ErrorResponse(c, http.StatusInternalServerError, "system.upload.generate_failed", "STORAGE_ERROR")
			return
		}

		urls = append(urls, map[string]string{
			"originalName": f.Name,
			"main":         mainURL,
			"thumb":        thumbURL,
			"mainKey":      mainKey,
			"thumbKey":     thumbKey,
		})
	}

	utils.SuccessDataResponse(c, http.StatusOK, urls)
}

// ConfirmUpload records completed client-side R2 uploads in the database and optionally links them to products.
func (h *MediaHandler) ConfirmUpload(c *gin.Context) {
	userID, ok := utils.RequireUserID(c)
	if !ok {
		return
	}

	reqPtr, ok := utils.BindAndValidate[system_dto.ConfirmUploadRequest](c)
	if !ok {
		return
	}
	req := *reqPtr
	if len(req.Assets) == 0 {
		utils.ErrorResponse(c, http.StatusBadRequest, "settings.media.invalid_asset_metadata", "VALIDATION_ERROR")
		return
	}

	uploadedAssets, err := h.mediaService.SaveMediaBatch(c.Request.Context(), req.Assets, req.Products, userID)
	if err != nil {
		var dupErr domain.DuplicateMediaError
		if errors.As(err, &dupErr) {
			utils.RawResponse(c, http.StatusConflict, gin.H{
				"success":    false,
				"message":    "settings.media.duplicate_file",
				"error_code": "DUPLICATE_MEDIA",
				"duplicate":  dupErr.DuplicateOf,
			})
			return
		}
		log.Printf("[MEDIA] ConfirmUpload failed for user %d: %v", userID, err)
		utils.ErrorResponse(c, http.StatusInternalServerError, "settings.media.save_failed", "INTERNAL_SERVER_ERROR")
		return
	}

	utils.SuccessResponse(c, http.StatusOK, "settings.media.save_success", uploadedAssets)
}

// DeleteMedia deletes an unreferenced media asset and queues its R2 object keys for background cleanup.
func (h *MediaHandler) DeleteMedia(c *gin.Context) {
	id, ok := utils.ParseIntParam(c, "id")
	if !ok {
		return
	}

	err := h.mediaService.DeleteMediaAndQueueTrash(c.Request.Context(), id)
	if err != nil {
		if database.IsForeignKeyViolation(err) {
			utils.ErrorResponse(c, http.StatusConflict, "settings.media.cannot_delete_used", "CONFLICT")
			return
		}
		utils.HandleDomainError(c, err)
		return
	}

	utils.SuccessResponse(c, http.StatusOK, "settings.media.delete_success", nil)
}

// UpdateMediaTags updates the tag list associated with a media asset.
func (h *MediaHandler) UpdateMediaTags(c *gin.Context) {
	id, ok := utils.ParseIntParam(c, "id")
	if !ok {
		return
	}
	reqPtr, ok := utils.BindAndValidate[system_dto.UpdateMediaTagsRequest](c)
	if !ok {
		return
	}
	req := *reqPtr

	if err := h.mediaService.UpdateMediaTags(c.Request.Context(), id, req.Tags); err != nil {
		log.Printf("[MEDIA] UpdateMediaTags failed for media %d: %v", id, err)
		utils.ErrorResponse(c, http.StatusInternalServerError, "settings.media.update_tags_failed", "INTERNAL_SERVER_ERROR")
		return
	}
	utils.SuccessResponse(c, http.StatusOK, "settings.media.update_tags_success", nil)
}

// UpdateMediaTitle updates the display title of a media asset.
func (h *MediaHandler) UpdateMediaTitle(c *gin.Context) {
	id, ok := utils.ParseIntParam(c, "id")
	if !ok {
		return
	}
	reqPtr, ok := utils.BindAndValidate[system_dto.UpdateMediaTitleRequest](c)
	if !ok {
		return
	}
	req := *reqPtr

	if err := h.mediaService.UpdateMediaTitle(c.Request.Context(), id, req.Title); err != nil {
		log.Printf("[MEDIA] UpdateMediaTitle failed for media %d: %v", id, err)
		utils.ErrorResponse(c, http.StatusInternalServerError, "settings.media.update_title_failed", "INTERNAL_SERVER_ERROR")
		return
	}
	utils.SuccessResponse(c, http.StatusOK, "settings.media.update_title_success", nil)
}

// DownloadBulkLinkTemplate generates and returns the Excel template for bulk linking media.
func (h *MediaHandler) DownloadBulkLinkTemplate(c *gin.Context) {
	f := h.mediaService.GenerateBulkLinkTemplate()
	utils.WriteExcelResponse(c, f, "Template_Tautkan_Media.xlsx")
}

// BulkLinkExcel uploads an Excel workbook and enqueues a background IMPORT_MEDIA_BULK_LINK job.
func (h *MediaHandler) BulkLinkExcel(c *gin.Context) {
	userID, ok := utils.RequireUserID(c)
	if !ok {
		return
	}

	savedPath, origName, ok := utils.SaveImportUpload(c, "file", "media_links")
	if !ok {
		return
	}

	jobType, finalNotes, _ := utils.ParseImportJobMeta(c, "IMPORT_MEDIA_BULK_LINK", "Bulk Link Media", "")

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
		log.Printf("[MEDIA] BulkLinkExcel enqueue failed for user %d: %v", userID, err)
		utils.ErrorResponse(c, http.StatusInternalServerError, "settings.media.job_queue_failed", "INTERNAL_SERVER_ERROR")
		return
	}

	utils.JobCreatedResponse(c, http.StatusOK, "settings.media.job_queued", jobID)
}
