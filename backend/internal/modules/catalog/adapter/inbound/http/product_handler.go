package http

import (
	"encoding/json"
	"net/http"
	"os"
	"strings"

	catalog_dto "github.com/dps-wmhris/backend/internal/modules/catalog/application/dto"
	catalog_port "github.com/dps-wmhris/backend/internal/modules/catalog/port"
	system_dto "github.com/dps-wmhris/backend/internal/modules/system/application/dto"
	system_port "github.com/dps-wmhris/backend/internal/modules/system/port"
	"github.com/dps-wmhris/backend/internal/shared/utils"
	"github.com/gin-gonic/gin"
)

// ProductHandler exposes HTTP endpoints for product/package CRUD, search, images, stock details, and bulk jobs.
type ProductHandler struct {
	productService catalog_port.ProductUseCase
	jobService     system_port.JobService
}

// NewProductHandler creates a new ProductHandler.
func NewProductHandler(productService catalog_port.ProductUseCase, jobService system_port.JobService) *ProductHandler {
	return &ProductHandler{
		productService: productService,
		jobService:     jobService,
	}
}

// Create creates a new single or package product.
func (h *ProductHandler) Create(c *gin.Context) {
	userID, ok := utils.RequireUserID(c)
	if !ok {
		return
	}

	reqPtr, ok := utils.BindAndValidate[catalog_dto.CreateProductRequest](c)
	if !ok {
		return
	}
	req := *reqPtr

	product, err := h.productService.CreateProduct(c.Request.Context(), userID, req)
	if err != nil {
		utils.HandleDomainError(c, err)
		return
	}

	utils.SuccessResponse(c, http.StatusCreated, "master_data.product.create_success", product)
}

// SearchProducts returns matching active products for autocomplete/dropdown pickers in raw array format.
func (h *ProductHandler) SearchProducts(c *gin.Context) {
	q := c.Query("q")
	locationID := c.Query("locationId")
	inStockOnly := c.Query("inStockOnly") == "true"

	page, limit := utils.ParsePagination(c, 20)

	results, err := h.productService.SearchProducts(c.Request.Context(), q, locationID, inStockOnly, page, limit)
	if err != nil {
		utils.HandleDomainError(c, err)
		return
	}
	utils.RawResponse(c, http.StatusOK, results)
}

// GetAdminList returns all active products with attached stock, slots, components, and images.
func (h *ProductHandler) GetAdminList(c *gin.Context) {
	results, err := h.productService.GetAllActiveProducts(c.Request.Context())
	if err != nil {
		utils.HandleDomainError(c, err)
		return
	}
	utils.SuccessDataResponse(c, http.StatusOK, results)
}

// GetProducts returns a filtered and paginated list of products.
func (h *ProductHandler) GetProducts(c *gin.Context) {
	reqPtr, ok := utils.BindQueryAndValidate[catalog_dto.ProductFilterRequest](c)
	if !ok {
		return
	}
	req := *reqPtr

	results, total, err := h.productService.GetProductsWithFilters(c.Request.Context(), req)
	if err != nil {
		utils.HandleDomainError(c, err)
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "master_data.product.fetch_success",
		"data":    results,
		"total":   total,
		"meta": gin.H{
			"page":  req.Page,
			"limit": req.Limit,
			"total": total,
		},
	})
}

// GetPackages returns a filtered and paginated list restricted strictly to package products.
func (h *ProductHandler) GetPackages(c *gin.Context) {
	reqPtr, ok := utils.BindQueryAndValidate[catalog_dto.ProductFilterRequest](c)
	if !ok {
		return
	}
	req := *reqPtr
	isPackage := true
	req.IsPackage = &isPackage

	results, total, err := h.productService.GetProductsWithFilters(c.Request.Context(), req)
	if err != nil {
		utils.HandleDomainError(c, err)
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "master_data.package.fetch_success",
		"data":    results,
		"total":   total,
		"meta": gin.H{
			"page":  req.Page,
			"limit": req.Limit,
			"total": total,
		},
	})
}

// GetProductById returns a single product with stock, slotting coordinates, components, and media assets.
func (h *ProductHandler) GetProductById(c *gin.Context) {
	id, ok := utils.ParseIntParam(c, "id")
	if !ok {
		return
	}

	product, err := h.productService.GetProductDetailWithStock(c.Request.Context(), id)
	if err != nil {
		utils.HandleDomainError(c, err)
		return
	}

	utils.SuccessDataResponse(c, http.StatusOK, product)
}

// GetProductStockDetails returns per-location stock balances and slotting coordinates for a product.
func (h *ProductHandler) GetProductStockDetails(c *gin.Context) {
	id, ok := utils.ParseIntParam(c, "id")
	if !ok {
		return
	}

	results, err := h.productService.GetProductStockDetails(c.Request.Context(), id)
	if err != nil {
		utils.HandleDomainError(c, err)
		return
	}

	utils.SuccessDataResponse(c, http.StatusOK, results)
}

// GetProductHistory returns the audit history entries for a product.
func (h *ProductHandler) GetProductHistory(c *gin.Context) {
	id, ok := utils.ParseIntParam(c, "id")
	if !ok {
		return
	}

	results, err := h.productService.GetProductHistory(c.Request.Context(), id)
	if err != nil {
		utils.HandleDomainError(c, err)
		return
	}

	utils.SuccessDataResponse(c, http.StatusOK, results)
}

// GetProductLastPriceUpdate returns the timestamp of the most recent price change for a product.
func (h *ProductHandler) GetProductLastPriceUpdate(c *gin.Context) {
	id, ok := utils.ParseIntParam(c, "id")
	if !ok {
		return
	}

	lastUpdate, err := h.productService.GetProductLastPriceUpdate(c.Request.Context(), id)
	if err != nil {
		utils.HandleDomainError(c, err)
		return
	}

	utils.SuccessDataResponse(c, http.StatusOK, map[string]any{
		"last_price_update": lastUpdate,
	})
}

// Update modifies or restores a product by ID.
func (h *ProductHandler) Update(c *gin.Context) {
	id, ok := utils.ParseIntParam(c, "id")
	if !ok {
		return
	}

	userID, ok := utils.RequireUserID(c)
	if !ok {
		return
	}

	reqPtr, ok := utils.BindAndValidate[catalog_dto.UpdateProductRequest](c)
	if !ok {
		return
	}
	req := *reqPtr

	if err := h.productService.UpdateProduct(c.Request.Context(), userID, id, req); err != nil {
		utils.HandleDomainError(c, err)
		return
	}

	utils.SuccessResponse(c, http.StatusOK, "master_data.product.update_success", nil)
}

// GetAll returns all non-deleted product records without pagination.
func (h *ProductHandler) GetAll(c *gin.Context) {
	products, err := h.productService.GetAllProducts(c.Request.Context())
	if err != nil {
		utils.HandleDomainError(c, err)
		return
	}

	utils.SuccessDataResponse(c, http.StatusOK, products)
}

// ImportBatchProductUpdate queues an asynchronous bulk product update or dry-run job.
func (h *ProductHandler) ImportBatchProductUpdate(c *gin.Context) {
	userID, ok := utils.RequireUserID(c)
	if !ok {
		return
	}

	savedPath, origName, ok := utils.SaveImportUpload(c, "file", "product")
	if !ok {
		return
	}

	jobType, notes, _ := utils.ParseImportJobMeta(
		c,
		"BATCH_EDIT_PRODUCT",
		"Mass Price Update via Web Upload",
		"Simulasi Mass Price Update via Web Upload",
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

	utils.JobCreatedResponse(c, http.StatusOK, "master_data.product.batch_job_queued", jobID)
}

// Delete soft-deletes a product by ID.
func (h *ProductHandler) Delete(c *gin.Context) {
	productID, ok := utils.ParseIntParam(c, "id")
	if !ok {
		return
	}

	userID, ok := utils.RequireUserID(c)
	if !ok {
		return
	}

	if err := h.productService.DeleteProduct(c.Request.Context(), userID, productID); err != nil {
		utils.HandleDomainError(c, err)
		return
	}

	utils.SuccessResponse(c, http.StatusOK, "master_data.product.delete_success", nil)
}

// ExportProducts queues an asynchronous export job for products. Matches GET /api/products/export.
func (h *ProductHandler) ExportProducts(c *gin.Context) {
	userID, ok := utils.RequireUserID(c)
	if !ok {
		return
	}

	filters := map[string]any{
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

	filterJSON, err := json.Marshal(filters)
	if err != nil {
		utils.HandleDomainError(c, err)
		return
	}
	filterStr := string(filterJSON)

	jobReq := system_dto.CreateExportJobRequest{
		UserID:  userID,
		JobType: "PRODUCT_MASTER",
		Filters: &filterStr,
	}

	jobID, err := h.jobService.CreateExportJob(c.Request.Context(), jobReq)
	if err != nil {
		utils.HandleDomainError(c, err)
		return
	}

	utils.JobCreatedResponse(c, http.StatusOK, "master_data.product.export_job_queued", jobID)
}

// GetProductStockTimeline returns the paginated running-balance stock timeline. Matches GET /api/products/:id/stock-timeline.
func (h *ProductHandler) GetProductStockTimeline(c *gin.Context) {
	id, ok := utils.ParseIntParam(c, "id")
	if !ok {
		return
	}

	page, limit := utils.ParsePagination(c, 100)

	var buildings []string
	if buildingParam := strings.TrimSpace(c.Query("building")); buildingParam != "" {
		for _, part := range strings.Split(buildingParam, ",") {
			if trimmed := strings.TrimSpace(part); trimmed != "" {
				buildings = append(buildings, trimmed)
			}
		}
	}

	result, err := h.productService.GetHistoricalStockTimeline(c.Request.Context(), id, page, limit, buildings)
	if err != nil {
		utils.HandleDomainError(c, err)
		return
	}

	utils.SuccessDataResponse(c, http.StatusOK, result)
}

// LinkMedia links media asset IDs to a product. Matches POST /api/products/:id/link-media.
func (h *ProductHandler) LinkMedia(c *gin.Context) {
	id, ok := utils.ParseIntParam(c, "id")
	if !ok {
		return
	}

	userID, ok := utils.RequireUserID(c)
	if !ok {
		return
	}

	reqPtr, ok := utils.BindAndValidate[catalog_dto.LinkMediaRequest](c)
	if !ok {
		return
	}
	req := *reqPtr

	if err := h.productService.LinkMediaToProduct(c.Request.Context(), id, req.MediaIDs, userID); err != nil {
		utils.HandleDomainError(c, err)
		return
	}

	utils.SuccessResponse(c, http.StatusOK, "master_data.product.link_media_success", nil)
}

// SetPrimaryImage marks a specific product image as primary. Matches PUT /api/products/:id/images/:imageId/primary.
func (h *ProductHandler) SetPrimaryImage(c *gin.Context) {
	productID, ok := utils.ParseIntParam(c, "id")
	if !ok {
		return
	}

	imageID, ok := utils.ParseIntParam(c, "imageId")
	if !ok {
		return
	}

	userID, ok := utils.RequireUserID(c)
	if !ok {
		return
	}

	if err := h.productService.SetPrimaryImage(c.Request.Context(), productID, imageID, userID); err != nil {
		utils.HandleDomainError(c, err)
		return
	}

	utils.SuccessResponse(c, http.StatusOK, "master_data.product.set_primary_image_success", nil)
}

// DeleteProductImage removes a specific product image link. Matches DELETE /api/products/:id/images/:imageId.
func (h *ProductHandler) DeleteProductImage(c *gin.Context) {
	imageID, ok := utils.ParseIntParam(c, "imageId")
	if !ok {
		return
	}

	userID, ok := utils.RequireUserID(c)
	if !ok {
		return
	}

	if err := h.productService.DeleteProductImage(c.Request.Context(), imageID, userID); err != nil {
		utils.HandleDomainError(c, err)
		return
	}

	utils.SuccessResponse(c, http.StatusOK, "master_data.product.delete_image_success", nil)
}
