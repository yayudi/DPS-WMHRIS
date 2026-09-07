package handler

import (
	"encoding/json"
	"net/http"
	"os"
	"path/filepath"
	"strconv"

	"github.com/dps-wmhris/backend/internal/utils"

	"strings"

	"github.com/dps-wmhris/backend/internal/config"

	"github.com/dps-wmhris/backend/internal/dto"
	"github.com/dps-wmhris/backend/internal/service"
	"github.com/gin-gonic/gin"
)

type ProductHandler struct {
	productService service.ProductService
	jobService     service.JobService
}

func NewProductHandler(productService service.ProductService, jobService service.JobService) *ProductHandler {
	return &ProductHandler{
		productService: productService,
		jobService:     jobService,
	}
}

// helper untuk mengekstrak user_id dari gin context (JWT map claims parses numbers as float64)
func getUserID(c *gin.Context) int {
	val, exists := c.Get("user_id")
	if !exists {
		return 0
	}
	switch v := val.(type) {
	case float64:
		return int(v)
	case int:
		return v
	default:
		return 0
	}
}

func (h *ProductHandler) Create(c *gin.Context) {
	req_ptr, ok := utils.BindAndValidate[dto.CreateProductRequest](c)
	if !ok {
		return
	}
	req := *req_ptr

	userID := getUserID(c)
	if userID == 0 {
		utils.ErrorResponse(c, http.StatusUnauthorized, "Tidak ada sesi pengguna yang valid", "UNAUTHORIZED")
		return
	}

	product, err := h.productService.CreateProduct(c.Request.Context(), userID, req)
	if err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, err.Error(), "INTERNAL_SERVER_ERROR")
		return
	}

	utils.SuccessResponse(c, http.StatusCreated, "Produk berhasil ditambahkan", product)
}

func (h *ProductHandler) SearchProducts(c *gin.Context) {
	q := c.Query("q")
	locationId := c.Query("locationId")
	inStockOnly := c.Query("inStockOnly") == "true"
	
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "20"))

	results, err := h.productService.SearchProducts(c.Request.Context(), q, locationId, inStockOnly, page, limit)
	if err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, err.Error(), "INTERNAL_SERVER_ERROR")
		return
	}
	utils.RawResponse(c, http.StatusOK, results)
}

func (h *ProductHandler) GetAdminList(c *gin.Context) {
	results, err := h.productService.GetAllActiveProducts(c.Request.Context())
	if err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, err.Error(), "INTERNAL_SERVER_ERROR")
		return
	}
	utils.SuccessDataResponse(c, http.StatusOK, results)
}

func (h *ProductHandler) GetProducts(c *gin.Context) {
	req_ptr, ok := utils.BindQueryAndValidate[dto.ProductFilterRequest](c)
	if !ok {
		return
	}
	req := *req_ptr

	results, total, err := h.productService.GetProductsWithFilters(c.Request.Context(), req)
	if err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, err.Error(), "INTERNAL_SERVER_ERROR")
		return
	}

	utils.RawResponse(c, http.StatusOK, gin.H{
		"data":  results,
		"total": total,
	})
}

func (h *ProductHandler) GetProductById(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		utils.ErrorResponse(c, http.StatusBadRequest, "Invalid ID", "")
		return
	}

	product, err := h.productService.GetProductDetailWithStock(c.Request.Context(), id)
	if err != nil {
		utils.ErrorResponse(c, http.StatusNotFound, "Product not found", "")
		return
	}

	utils.SuccessDataResponse(c, http.StatusOK, product)
}

func (h *ProductHandler) GetProductStockDetails(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		utils.ErrorResponse(c, http.StatusBadRequest, "Invalid ID", "")
		return
	}

	results, err := h.productService.GetProductStockDetails(c.Request.Context(), id)
	if err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, err.Error(), "")
		return
	}

	utils.SuccessDataResponse(c, http.StatusOK, results)
}

func (h *ProductHandler) GetProductHistory(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		utils.ErrorResponse(c, http.StatusBadRequest, "Invalid ID", "")
		return
	}

	results, err := h.productService.GetProductHistory(c.Request.Context(), id)
	if err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, err.Error(), "")
		return
	}

	utils.SuccessDataResponse(c, http.StatusOK, results)
}

func (h *ProductHandler) Update(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		utils.ErrorResponse(c, http.StatusBadRequest, "Invalid ID", "")
		return
	}

	req_ptr, ok := utils.BindAndValidate[dto.UpdateProductRequest](c)
	if !ok {
		return
	}
	req := *req_ptr

	userID := getUserID(c)
	if userID == 0 {
		utils.ErrorResponse(c, http.StatusUnauthorized, "Tidak ada sesi pengguna yang valid", "")
		return
	}

	if err := h.productService.UpdateProduct(c.Request.Context(), userID, id, req); err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, err.Error(), "")
		return
	}

	utils.SuccessResponse(c, http.StatusOK, "Produk berhasil diperbarui.", nil)
}

func (h *ProductHandler) GetAll(c *gin.Context) {
	products, err := h.productService.GetAllProducts(c.Request.Context())
	if err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, err.Error(), "INTERNAL_SERVER_ERROR")
		return
	}

	utils.SuccessResponse(c, http.StatusOK, "Berhasil mengambil data produk", products)
}

func (h *ProductHandler) ImportBatchProductUpdate(c *gin.Context) {
	file, err := c.FormFile("file")
	if err != nil {
		utils.ErrorResponse(c, http.StatusBadRequest, "File tidak ditemukan.", "VALIDATION_ERROR")
		return
	}

	userID := getUserID(c)
	dryRun := c.PostForm("dryRun")
	jobType := "BATCH_EDIT_PRODUCT"
	if dryRun == "true" {
		jobType = "BATCH_EDIT_PRODUCT_DRY_RUN"
	}

	notes := "Mass Price Update via Web Upload"

	uploadDir := filepath.Join(config.AppConfig.StoragePath, "uploads", "product") + string(filepath.Separator)
	os.MkdirAll(uploadDir, os.ModePerm)
	filepath := uploadDir + file.Filename

	if err := c.SaveUploadedFile(file, filepath); err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, "Failed to save file", "INTERNAL_ERROR")
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
		utils.ErrorResponse(c, http.StatusInternalServerError, err.Error(), "INTERNAL_ERROR")
		return
	}

	utils.SuccessResponse(c, http.StatusCreated, "File berhasil diunggah. Proses update berjalan di latar belakang.", jobID)
}

func (h *ProductHandler) Delete(c *gin.Context) {
	idParam := c.Param("id")
	productID, err := strconv.Atoi(idParam)
	if err != nil {
		utils.ErrorResponse(c, http.StatusBadRequest, "ID Produk tidak valid", "VALIDATION_ERROR")
		return
	}

	userID := getUserID(c)
	if userID == 0 {
		utils.ErrorResponse(c, http.StatusUnauthorized, "Tidak ada sesi pengguna yang valid", "UNAUTHORIZED")
		return
	}

	if err := h.productService.DeleteProduct(c.Request.Context(), userID, productID); err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, err.Error(), "INTERNAL_SERVER_ERROR")
		return
	}

	utils.SuccessResponse(c, http.StatusOK, "Produk berhasil dihapus", nil)
}

// ExportProducts creates an export job for products. Matches GET /api/products/export.
func (h *ProductHandler) ExportProducts(c *gin.Context) {
	userID := getUserID(c)
	if userID == 0 {
		utils.ErrorResponse(c, http.StatusUnauthorized, "Tidak ada sesi pengguna yang valid", "")
		return
	}

	filters := map[string]interface{}{
		"search":       c.Query("search"),
		"searchBy":     c.DefaultQuery("searchBy", "name"),
		"location":     c.DefaultQuery("location", "all"),
		"status":       c.DefaultQuery("status", "active"),
		"is_package":   c.Query("is_package"),
		"packageOnly":  c.Query("packageOnly"),
		"minusOnly":    c.Query("minusOnly"),
		"building":     c.DefaultQuery("building", "all"),
		"floor":        c.DefaultQuery("floor", "all"),
		"sortBy":       c.DefaultQuery("sortBy", "sku"),
		"sortOrder":    c.DefaultQuery("sortOrder", "ASC"),
		"format":       c.DefaultQuery("format", "xlsx"),
		"includeImages": c.Query("includeImages"),
		"exportType":   "PRODUCT_MASTER",
	}

	columnsRaw := c.Query("columns")
	if columnsRaw != "" {
		var columns []string
		if err := json.Unmarshal([]byte(columnsRaw), &columns); err == nil {
			filters["columns"] = columns
		}
	}

	filterJSON, _ := json.Marshal(filters)
	filterStr := string(filterJSON)

	jobReq := dto.CreateExportJobRequest{
		UserID:  userID,
		JobType: "PRODUCT_MASTER",
		Filters: &filterStr,
	}

	jobID, err := h.jobService.CreateExportJob(c.Request.Context(), jobReq)
	if err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, err.Error(), "")
		return
	}

	utils.SuccessResponse(c, http.StatusOK, "Permintaan ekspor diterima. Silakan cek menu 'Laporan Saya' untuk mengunduh.", jobID)
}

// GetProductStockTimeline returns the paginated stock timeline. Matches GET /api/products/:id/stock-timeline.
func (h *ProductHandler) GetProductStockTimeline(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		utils.ErrorResponse(c, http.StatusBadRequest, "Invalid ID", "")
		return
	}

	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "100"))

	var buildings []string
	buildingParam := c.Query("building")
	if buildingParam != "" {
		buildings = strings.Split(buildingParam, ",")
	}

	result, err := h.productService.GetHistoricalStockTimeline(c.Request.Context(), id, page, limit, buildings)
	if err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, err.Error(), "")
		return
	}

	utils.SuccessDataResponse(c, http.StatusOK, result)
}

// LinkMedia links media to a product. Matches POST /api/products/:id/link-media.
func (h *ProductHandler) LinkMedia(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		utils.ErrorResponse(c, http.StatusBadRequest, "Invalid ID", "")
		return
	}

	userID := getUserID(c)
	if userID == 0 {
		utils.ErrorResponse(c, http.StatusUnauthorized, "Tidak ada sesi pengguna yang valid", "")
		return
	}

	req_ptr, ok := utils.BindAndValidate[dto.LinkMediaRequest](c)
	if !ok {
		return
	}
	req := *req_ptr

	if err := h.productService.LinkMediaToProduct(c.Request.Context(), id, req.MediaIDs, userID); err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, err.Error(), "")
		return
	}

	utils.SuccessResponse(c, http.StatusOK, "Media berhasil disematkan.", nil)
}

// SetPrimaryImage sets a specific image as primary. Matches PUT /api/products/:id/images/:imageId/primary.
func (h *ProductHandler) SetPrimaryImage(c *gin.Context) {
	productID, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		utils.ErrorResponse(c, http.StatusBadRequest, "Invalid product ID", "")
		return
	}

	imageID, err := strconv.Atoi(c.Param("imageId"))
	if err != nil {
		utils.ErrorResponse(c, http.StatusBadRequest, "Invalid image ID", "")
		return
	}

	userID := getUserID(c)
	if err := h.productService.SetPrimaryImage(c.Request.Context(), productID, imageID, userID); err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, err.Error(), "")
		return
	}

	utils.SuccessResponse(c, http.StatusOK, "Gambar utama berhasil diatur.", nil)
}

// DeleteProductImage removes a specific product image. Matches DELETE /api/products/:id/images/:imageId.
func (h *ProductHandler) DeleteProductImage(c *gin.Context) {
	imageID, err := strconv.Atoi(c.Param("imageId"))
	if err != nil {
		utils.ErrorResponse(c, http.StatusBadRequest, "Invalid image ID", "")
		return
	}

	userID := getUserID(c)
	if err := h.productService.DeleteProductImage(c.Request.Context(), imageID, userID); err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, err.Error(), "")
		return
	}

	utils.SuccessResponse(c, http.StatusOK, "Gambar berhasil dihapus.", nil)
}
