package http

import (
	system_dto "github.com/dps-wmhris/backend/internal/modules/system/application/dto"

	system_usecase "github.com/dps-wmhris/backend/internal/modules/system/application/usecase"

	inventory_dto "github.com/dps-wmhris/backend/internal/modules/inventory/application/dto"
	inventory_port "github.com/dps-wmhris/backend/internal/modules/inventory/port"

	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"

	"github.com/dps-wmhris/backend/internal/shared/config"
	"github.com/dps-wmhris/backend/internal/shared/utils"
	"github.com/gin-gonic/gin"
)

type FulfilmentHandler struct {
	jobService     system_usecase.JobService
	fulfilmentService inventory_port.FulfilmentUseCase
}

func NewFulfilmentHandler(jobService system_usecase.JobService, fulfilmentService inventory_port.FulfilmentUseCase) *FulfilmentHandler {
	return &FulfilmentHandler{
		jobService:     jobService,
		fulfilmentService: fulfilmentService,
	}
}

func (h *FulfilmentHandler) UploadAndValidate(c *gin.Context) {
	form, err := c.MultipartForm()
	if err != nil {
		utils.ErrorResponse(c, http.StatusBadRequest, "Failed to parse form", "VALIDATION_ERROR")
		return
	}

	files := form.File["files"]
	if len(files) == 0 {
		utils.ErrorResponse(c, http.StatusBadRequest, "Tidak ada file yang diunggah.", "VALIDATION_ERROR")
		return
	}

	userID := getUserID(c)
	source := c.PostForm("source")
	if source == "" {
		source = "Tokopedia"
	}

	isDryRun := c.PostForm("dryRun") == "true"
	locationPurpose := c.PostForm("purpose")
	if locationPurpose == "" {
		locationPurpose = "DISPLAY"
	}

	shopNamesStr := c.PostForm("shopNames")
	var shopNames []string
	if shopNamesStr != "" {
		_ = json.Unmarshal([]byte(shopNamesStr), &shopNames)
	}

	baseJobType := "IMPORT_SALES_" + strings.ToUpper(source)
	jobType := baseJobType
	if isDryRun {
		jobType += "_DRY_RUN"
	}

	modeText := "Import"
	if isDryRun {
		modeText = "Simulasi"
	}
	defaultNote := modeText + " " + source + " Sales"
	userNotes := c.PostForm("notes")

	uploadDir := filepath.Join(config.AppConfig.StoragePath, "uploads", "fulfilment") + string(filepath.Separator)
	_ = os.MkdirAll(uploadDir, 0750) // #nosec G104
	var createdJobs []int

	for i, file := range files {
		shopName := ""
		if i < len(shopNames) {
			shopName = shopNames[i]
		}

		note := defaultNote
		if userNotes != "" {
			note += " | " + userNotes
		}

		filepath := uploadDir + file.Filename
		if err := c.SaveUploadedFile(file, filepath); err != nil {
			continue // Skip failed saves
		}

		// Prepare options JSON string
		optionsMap := map[string]string{
			"purpose":  locationPurpose,
			"shopName": shopName,
		}
		optionsBytes, _ := json.Marshal(optionsMap)
		optionsStr := string(optionsBytes)

		req := system_dto.CreateImportJobRequest{
			UserID:           userID,
			JobType:          jobType,
			OriginalFilename: file.Filename,
			FilePath:         filepath,
			Notes:            &note,
			Options:          &optionsStr,
		}

		jobID, err := h.jobService.CreateImportJob(c.Request.Context(), req)
		if err == nil {
			createdJobs = append(createdJobs, jobID)
		}
	}

	utils.RawResponse(c, http.StatusOK, gin.H{
		"success": true,
		"message": "File masuk antrian.",
		"data": gin.H{
			"jobIds": createdJobs,
		},
	})
}

func (h *FulfilmentHandler) SyncKelja(c *gin.Context) {
	userID := getUserID(c)
	
	// Cukup buat job. FilePath tidak ada karena narik dari API
	req := system_dto.CreateImportJobRequest{
		UserID:           userID,
		JobType:          "SYNC_API_KELJA",
		OriginalFilename: "API_KELJA",
	}

	jobID, err := h.jobService.CreateImportJob(c.Request.Context(), req)
	if err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, "Gagal membuat antrean sinkronisasi", "JOB_ERROR")
		return
	}

	utils.RawResponse(c, http.StatusOK, gin.H{
		"success": true,
		"message": "Sinkronisasi dari Kelja ERP masuk antrian.",
		"data": gin.H{
			"jobIds": []int{jobID},
		},
	})
}

// ============================================================================
// READ OPERATIONS
// ============================================================================

func (h *FulfilmentHandler) GetPendingFilterOptions(c *gin.Context) {
	options, err := h.fulfilmentService.GetPendingFilterOptions(c.Request.Context())
	if err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, err.Error(), "INTERNAL_ERROR")
		return
	}
	utils.SuccessDataResponse(c, http.StatusOK, options)
}

func (h *FulfilmentHandler) GetPendingItems(c *gin.Context) {
	filter := inventory_dto.PendingFulfilmentFilter{
		Search:         c.Query("search"),
		SourceType:     c.Query("sourceType"),
		SourceInclude:  c.QueryArray("sourceInclude[]"),
		SourceExclude:  c.QueryArray("sourceExclude[]"),
		ShopInclude:    c.QueryArray("shopInclude[]"),
		ShopExclude:         c.QueryArray("shopExclude[]"),
		ExpeditionIDInclude: utils.ParseIntArray(c.QueryArray("expeditionIdInclude[]")),
		ExpeditionIDExclude: utils.ParseIntArray(c.QueryArray("expeditionIdExclude[]")),
		Role:           c.Query("role"),
		StartDate:      c.Query("startDate"),
		EndDate:        c.Query("endDate"),
		SortBy:         c.Query("sortBy"),
	}

	if isSameday := c.Query("isSameday"); isSameday != "" {
		val := isSameday == "true"
		filter.IsSameday = &val
	}

	if isBackorder := c.Query("isBackorder"); isBackorder != "" {
		val := isBackorder == "true"
		filter.IsBackorder = &val
	}

	page, _ := strconv.Atoi(c.Query("page"))
	if page < 1 {
		page = 1
	}
	filter.Page = page

	limit, _ := strconv.Atoi(c.Query("limit"))
	if limit < 1 {
		limit = 1000 // Fallback if no limit provided
	}
	filter.Limit = limit

	items, total, err := h.fulfilmentService.GetPendingItems(c.Request.Context(), filter)
	if err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, err.Error(), "INTERNAL_ERROR")
		return
	}

	utils.SuccessDataResponse(c, http.StatusOK, gin.H{
		"items": items,
		"total": total,
		"page":  page,
		"limit": limit,
	})
}

func (h *FulfilmentHandler) GetHistoryItems(c *gin.Context) {
	// default limit 1000
	items, err := h.fulfilmentService.GetHistoryItems(c.Request.Context(), 1000)
	if err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, err.Error(), "INTERNAL_ERROR")
		return
	}
	utils.SuccessDataResponse(c, http.StatusOK, items)
}

func (h *FulfilmentHandler) GetFulfilmentDetail(c *gin.Context) {
	// Parse ID from param
	idStr := c.Param("id")
	var id int
	_, _ = fmt.Sscanf(idStr, "%d", &id) // #nosec G104

	items, err := h.fulfilmentService.GetFulfilmentDetail(c.Request.Context(), id)
	if err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, err.Error(), "INTERNAL_ERROR")
		return
	}
	utils.SuccessDataResponse(c, http.StatusOK, items)
}

// ============================================================================
// WRITE OPERATIONS
// ============================================================================

func (h *FulfilmentHandler) CompleteItems(c *gin.Context) {
	req_ptr, ok := utils.BindAndValidate[inventory_dto.CompleteFulfilmentRequest](c)
	if !ok {
		return
	}
	req := *req_ptr

	userID := getUserID(c)

	msg, validationErrs, err := h.fulfilmentService.CompleteFulfilmentItems(c.Request.Context(), req, userID)
	if err != nil {
		if len(validationErrs) > 0 {
			utils.RawResponse(c, http.StatusBadRequest, gin.H{
				"success":    false,
				"message":    "Sebagian pesanan gagal diproses karena masalah ketersediaan stok atau status.",
				"error_code": "PROCESS_ERROR",
				"errors":     validationErrs,
			})
			return
		}
		utils.ErrorResponse(c, http.StatusBadRequest, err.Error(), "PROCESS_ERROR")
		return
	}
	utils.RawResponse(c, http.StatusOK, gin.H{"success": true, "message": msg})
}

func (h *FulfilmentHandler) VoidFulfilmentList(c *gin.Context) {
	idStr := c.Param("id")
	var id int
	_, _ = fmt.Sscanf(idStr, "%d", &id) // #nosec G104

	userID := getUserID(c)

	err := h.fulfilmentService.VoidFulfilmentList(c.Request.Context(), id, userID)
	if err != nil {
		utils.ErrorResponse(c, http.StatusBadRequest, err.Error(), "PROCESS_ERROR")
		return
	}
	utils.SuccessResponse(c, http.StatusOK, "Fulfilment List dibatalkan.", nil)
}

func (h *FulfilmentHandler) RetryBackorders(c *gin.Context) {
	idStr := c.Param("id")
	var id int
	_, _ = fmt.Sscanf(idStr, "%d", &id) // #nosec G104

	msg, err := h.fulfilmentService.RetryBackorders(c.Request.Context(), id)
	if err != nil {
		utils.ErrorResponse(c, http.StatusBadRequest, err.Error(), "PROCESS_ERROR")
		return
	}
	utils.RawResponse(c, http.StatusOK, gin.H{"success": true, "message": msg})
}

func (h *FulfilmentHandler) RetryBackordersBatch(c *gin.Context) {
	req_ptr, ok := utils.BindAndValidate[inventory_dto.RetryBackordersBatchRequest](c)
	if !ok {
		return
	}
	req := *req_ptr

	msg, err := h.fulfilmentService.RetryBackordersBatch(c.Request.Context(), req)
	if err != nil {
		log.Printf("[RetryBackordersBatch] process error: %v", err)
		utils.ErrorResponse(c, http.StatusBadRequest, err.Error(), "PROCESS_ERROR")
		return
	}
	utils.RawResponse(c, http.StatusOK, gin.H{"success": true, "message": msg})
}
