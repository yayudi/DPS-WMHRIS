package http

import (
	system_dto "github.com/dps-wmhris/backend/internal/modules/system/application/dto"

	system_usecase "github.com/dps-wmhris/backend/internal/modules/system/application/usecase"

	"encoding/json"
	"net/http"
	"strings"

	catalog_dto "github.com/dps-wmhris/backend/internal/modules/catalog/application/dto"

	catalog_port "github.com/dps-wmhris/backend/internal/modules/catalog/port"

	"github.com/dps-wmhris/backend/internal/shared/middleware"
	"github.com/dps-wmhris/backend/internal/shared/utils"
	"github.com/gin-gonic/gin"
)

type ProductHandler struct {
	productService catalog_port.ProductUseCase
	jobService     system_usecase.JobService
}

func NewProductHandler(productService catalog_port.ProductUseCase, jobService system_usecase.JobService) *ProductHandler {
	return &ProductHandler{
		productService: productService,
		jobService:     jobService,
	}
}

func (h *ProductHandler) Create(c *gin.Context) {
	req_ptr, ok := utils.BindAndValidate[catalog_dto.CreateProductRequest](c)
	if !ok {
		return
	}
	req := *req_ptr

	userID := middleware.GetUserID(c)
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

	page, limit := utils.ParsePagination(c, 20)

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
	req_ptr, ok := utils.BindQueryAndValidate[catalog_dto.ProductFilterRequest](c)
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
	id, ok := utils.ParseIntParam(c, "id")
	if !ok {
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
	id, ok := utils.ParseIntParam(c, "id")
	if !ok {
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
	id, ok := utils.ParseIntParam(c, "id")
	if !ok {
		return
	}

	results, err := h.productService.GetProductHistory(c.Request.Context(), id)
	if err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, err.Error(), "")
		return
	}

	utils.SuccessDataResponse(c, http.StatusOK, results)
}

func (h *ProductHandler) GetProductLastPriceUpdate(c *gin.Context) {
	id, ok := utils.ParseIntParam(c, "id")
	if !ok {
		return
	}

	lastUpdate, err := h.productService.GetProductLastPriceUpdate(c.Request.Context(), id)
	if err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, err.Error(), "")
		return
	}

	utils.SuccessDataResponse(c, http.StatusOK, map[string]interface{}{
		"last_price_update": lastUpdate,
	})
}

func (h *ProductHandler) Update(c *gin.Context) {
	id, ok := utils.ParseIntParam(c, "id")
	if !ok {
		return
	}

	req_ptr, ok := utils.BindAndValidate[catalog_dto.UpdateProductRequest](c)
	if !ok {
		return
	}
	req := *req_ptr

	userID := middleware.GetUserID(c)
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
	savedPath, origName, ok := utils.SaveImportUpload(c, "file", "product")
	if !ok {
		return
	}

	userID := middleware.GetUserID(c)
	dryRun := c.PostForm("dryRun")
	jobType := "BATCH_EDIT_PRODUCT"
	if dryRun == "true" {
		jobType = "BATCH_EDIT_PRODUCT_DRY_RUN"
	}

	notes := "Mass Price Update via Web Upload"

	req := system_dto.CreateImportJobRequest{
		UserID:           userID,
		JobType:          jobType,
		OriginalFilename: origName,
		FilePath:         savedPath,
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
	productID, ok := utils.ParseIntParam(c, "id")
	if !ok {
		return
	}

	userID := middleware.GetUserID(c)
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
	userID := middleware.GetUserID(c)
	if userID == 0 {
		utils.ErrorResponse(c, http.StatusUnauthorized, "Tidak ada sesi pengguna yang valid", "")
		return
	}

	filters := map[string]interface{}{
		"search":        c.Query("search"),
		"searchBy":      c.DefaultQuery("searchBy", "name"),
		"location":      c.DefaultQuery("location", "all"),
		"status":        c.DefaultQuery("status", "active"),
		"is_package":    c.Query("is_package"),
		"packageOnly":   c.Query("packageOnly"),
		"minusOnly":     c.Query("minusOnly"),
		"building":      c.DefaultQuery("building", "all"),
		"floor":         c.DefaultQuery("floor", "all"),
		"sortBy":        c.DefaultQuery("sortBy", "sku"),
		"sortOrder":     c.DefaultQuery("sortOrder", "ASC"),
		"format":        c.DefaultQuery("format", "xlsx"),
		"includeImages": c.Query("includeImages"),
		"exportType":    "PRODUCT_MASTER",
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

	jobReq := system_dto.CreateExportJobRequest{
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
	id, ok := utils.ParseIntParam(c, "id")
	if !ok {
		return
	}

	page, limit := utils.ParsePagination(c, 100)

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
	id, ok := utils.ParseIntParam(c, "id")
	if !ok {
		return
	}

	userID := middleware.GetUserID(c)
	if userID == 0 {
		utils.ErrorResponse(c, http.StatusUnauthorized, "Tidak ada sesi pengguna yang valid", "")
		return
	}

	req_ptr, ok := utils.BindAndValidate[catalog_dto.LinkMediaRequest](c)
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
	productID, ok := utils.ParseIntParam(c, "id")
	if !ok {
		return
	}

	imageID, ok := utils.ParseIntParam(c, "imageId")
	if !ok {
		return
	}

	userID := middleware.GetUserID(c)
	if err := h.productService.SetPrimaryImage(c.Request.Context(), productID, imageID, userID); err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, err.Error(), "")
		return
	}

	utils.SuccessResponse(c, http.StatusOK, "Gambar utama berhasil diatur.", nil)
}

// DeleteProductImage removes a specific product image. Matches DELETE /api/products/:id/images/:imageId.
func (h *ProductHandler) DeleteProductImage(c *gin.Context) {
	imageID, ok := utils.ParseIntParam(c, "imageId")
	if !ok {
		return
	}

	userID := middleware.GetUserID(c)
	if err := h.productService.DeleteProductImage(c.Request.Context(), imageID, userID); err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, err.Error(), "")
		return
	}

	utils.SuccessResponse(c, http.StatusOK, "Gambar berhasil dihapus.", nil)
}
