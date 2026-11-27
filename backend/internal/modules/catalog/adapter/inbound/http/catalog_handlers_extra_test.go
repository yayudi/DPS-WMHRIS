package http_test

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"

	catalog_http "github.com/dps-wmhris/backend/internal/modules/catalog/adapter/inbound/http"
	catalog_dto "github.com/dps-wmhris/backend/internal/modules/catalog/application/dto"
	"github.com/dps-wmhris/backend/internal/modules/catalog/domain"
	catalog_port "github.com/dps-wmhris/backend/internal/modules/catalog/port"
	system_dto "github.com/dps-wmhris/backend/internal/modules/system/application/dto"
	system_port "github.com/dps-wmhris/backend/internal/modules/system/port"
	"github.com/gin-gonic/gin"
)

type stubProductUC struct {
	catalog_port.ProductUseCase
	detailErr error
}

func (s *stubProductUC) GetProductDetailWithStock(_ context.Context, _ int) (*catalog_dto.ProductDetailResponse, error) {
	if s.detailErr != nil {
		return nil, s.detailErr
	}
	return &catalog_dto.ProductDetailResponse{ID: 1, SKU: "SKU-1", Name: "Item"}, nil
}

type stubJobService struct {
	system_port.JobService
	lastExportReq system_dto.CreateExportJobRequest
	exportJobID   int
}

func (s *stubJobService) CreateExportJob(_ context.Context, req system_dto.CreateExportJobRequest) (int, error) {
	s.lastExportReq = req
	return s.exportJobID, nil
}

func TestProductHandler_AuthGuardsBindingAndErrorMapping(t *testing.T) {
	gin.SetMode(gin.TestMode)
	uc := &stubProductUC{}
	handler := catalog_http.NewProductHandler(uc, &stubJobService{})

	// 1. Unauthenticated routes must fail with 401
	rUnauth := gin.New()
	rUnauth.POST("/products/batch/product-update", handler.ImportBatchProductUpdate)
	rUnauth.PUT("/products/:id/images/:imageId/primary", handler.SetPrimaryImage)
	rUnauth.DELETE("/products/:id/images/:imageId", handler.DeleteProductImage)

	for _, tc := range []struct {
		method string
		path   string
	}{
		{http.MethodPost, "/products/batch/product-update"},
		{http.MethodPut, "/products/1/images/2/primary"},
		{http.MethodDelete, "/products/1/images/2"},
	} {
		w := httptest.NewRecorder()
		rUnauth.ServeHTTP(w, httptest.NewRequest(tc.method, tc.path, nil))
		if w.Code != http.StatusUnauthorized {
			t.Fatalf("%s %s: expected 401, got %d", tc.method, tc.path, w.Code)
		}
	}

	// 2. Authenticated routes + domain error mapping + DTO binding validation
	rAuth := gin.New()
	rAuth.Use(func(c *gin.Context) {
		c.Set("user_id", 7)
		c.Next()
	})
	rAuth.GET("/products/:id", handler.GetProductById)
	rAuth.POST("/products", handler.Create)
	rAuth.POST("/products/:id/link-media", handler.LinkMedia)

	// NotFound -> 404
	uc.detailErr = domain.ErrProductNotFound
	w := httptest.NewRecorder()
	rAuth.ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/products/999", nil))
	if w.Code != http.StatusNotFound {
		t.Fatalf("expected 404 for ErrProductNotFound, got %d", w.Code)
	}

	// Unexpected DB error -> 500 (must NOT be masked as 404)
	uc.detailErr = errors.New("mysql connection lost")
	w = httptest.NewRecorder()
	rAuth.ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/products/999", nil))
	if w.Code != http.StatusInternalServerError {
		t.Fatalf("expected 500 for unexpected DB error, got %d", w.Code)
	}

	// Negative price fails binding:"min=0" -> 400
	w = httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/products", bytes.NewBufferString(`{"sku":"SKU-NEG","name":"Neg","price":-500}`))
	req.Header.Set("Content-Type", "application/json")
	rAuth.ServeHTTP(w, req)
	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 for negative price, got %d (%s)", w.Code, w.Body.String())
	}

	// Empty mediaIds fails binding:"required,min=1,dive,min=1" -> 400
	w = httptest.NewRecorder()
	req = httptest.NewRequest(http.MethodPost, "/products/1/link-media", bytes.NewBufferString(`{"mediaIds":[]}`))
	req.Header.Set("Content-Type", "application/json")
	rAuth.ServeHTTP(w, req)
	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 for empty mediaIds, got %d (%s)", w.Code, w.Body.String())
	}
}

func TestPackageHandler_AuthAndExport(t *testing.T) {
	gin.SetMode(gin.TestMode)
	jobSvc := &stubJobService{exportJobID: 55}
	handler := catalog_http.NewPackageHandler(jobSvc)

	rUnauth := gin.New()
	rUnauth.GET("/packages/export", handler.ExportPackages)
	rUnauth.POST("/packages/batch/update", handler.ImportPackagesBatch)

	w := httptest.NewRecorder()
	rUnauth.ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/packages/export", nil))
	if w.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401 on unauthenticated ExportPackages, got %d", w.Code)
	}
	w = httptest.NewRecorder()
	rUnauth.ServeHTTP(w, httptest.NewRequest(http.MethodPost, "/packages/batch/update", nil))
	if w.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401 on unauthenticated ImportPackagesBatch, got %d", w.Code)
	}

	rAuth := gin.New()
	rAuth.Use(func(c *gin.Context) {
		c.Set("user_id", 15)
		c.Next()
	})
	rAuth.GET("/packages/export", handler.ExportPackages)

	w = httptest.NewRecorder()
	rAuth.ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/packages/export?format=csv&search=hemat", nil))
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200 on authenticated ExportPackages, got %d", w.Code)
	}
	if jobSvc.lastExportReq.UserID != 15 || jobSvc.lastExportReq.JobType != "EXPORT_PACKAGES" || jobSvc.lastExportReq.Filters == nil {
		t.Fatalf("unexpected export job request: %+v", jobSvc.lastExportReq)
	}
	var parsedFilters map[string]any
	if err := json.Unmarshal([]byte(*jobSvc.lastExportReq.Filters), &parsedFilters); err != nil {
		t.Fatalf("invalid filters json: %v", err)
	}
	if parsedFilters["format"] != "csv" || parsedFilters["search"] != "hemat" {
		t.Fatalf("unexpected filters payload: %+v", parsedFilters)
	}
}
