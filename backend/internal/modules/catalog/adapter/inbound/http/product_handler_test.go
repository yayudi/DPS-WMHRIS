package http_test

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	catalog_http "github.com/dps-wmhris/backend/internal/modules/catalog/adapter/inbound/http"
	catalog_dto "github.com/dps-wmhris/backend/internal/modules/catalog/application/dto"
	"github.com/dps-wmhris/backend/internal/modules/catalog/domain"
	"github.com/gin-gonic/gin"
)

type mockProductUseCase struct {
	getProductsWithFiltersFunc func(ctx context.Context, filters catalog_dto.ProductFilterRequest) ([]catalog_dto.ProductDetailResponse, int, error)
}

func (m *mockProductUseCase) CreateProduct(ctx context.Context, userID int, req catalog_dto.CreateProductRequest) (*domain.Product, error) {
	return nil, nil
}
func (m *mockProductUseCase) GetAllProducts(ctx context.Context) ([]domain.Product, error) {
	return nil, nil
}
func (m *mockProductUseCase) GetProductsWithFilters(ctx context.Context, filters catalog_dto.ProductFilterRequest) ([]catalog_dto.ProductDetailResponse, int, error) {
	if m.getProductsWithFiltersFunc != nil {
		return m.getProductsWithFiltersFunc(ctx, filters)
	}
	return nil, 0, nil
}
func (m *mockProductUseCase) SearchProducts(ctx context.Context, keyword string, locationID string, inStockOnly bool, page int, limit int) ([]catalog_dto.ProductDetailResponse, error) {
	return nil, nil
}
func (m *mockProductUseCase) GetAllActiveProducts(ctx context.Context) ([]catalog_dto.ProductDetailResponse, error) {
	return nil, nil
}
func (m *mockProductUseCase) GetProductDetailWithStock(ctx context.Context, id int) (*catalog_dto.ProductDetailResponse, error) {
	return nil, nil
}
func (m *mockProductUseCase) GetProductStockDetails(ctx context.Context, id int) ([]catalog_dto.ProductStockDetailResponse, error) {
	return nil, nil
}
func (m *mockProductUseCase) GetProductHistory(ctx context.Context, id int) ([]catalog_dto.ProductHistoryResponse, error) {
	return nil, nil
}
func (m *mockProductUseCase) GetProductLastPriceUpdate(ctx context.Context, id int) (*time.Time, error) {
	return nil, nil
}
func (m *mockProductUseCase) LinkMediaToProduct(ctx context.Context, productID int, mediaIDs []int, userID int) error {
	return nil
}
func (m *mockProductUseCase) DeleteProductImage(ctx context.Context, imageID int, userID int) error {
	return nil
}
func (m *mockProductUseCase) SetPrimaryImage(ctx context.Context, productID int, imageID int, userID int) error {
	return nil
}
func (m *mockProductUseCase) GetHistoricalStockTimeline(ctx context.Context, productID int, page int, limit int, buildings []string) (map[string]interface{}, error) {
	return nil, nil
}
func (m *mockProductUseCase) UpdateProduct(ctx context.Context, userID int, id int, req catalog_dto.UpdateProductRequest) error {
	return nil
}
func (m *mockProductUseCase) DeleteProduct(ctx context.Context, userID int, id int) error {
	return nil
}
func (m *mockProductUseCase) ProcessBatchUpdate(ctx context.Context, jobID int, filePath string, userID int, isDryRun bool) (string, error) {
	return "", nil
}
func (m *mockProductUseCase) ProcessBatchPackageUpdate(ctx context.Context, jobID int, filePath string, userID int, isDryRun bool) (string, error) {
	return "", nil
}

func setupRouter(productUC *mockProductUseCase) *gin.Engine {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	handler := catalog_http.NewProductHandler(productUC, nil)
	r.GET("/products", handler.GetProducts)
	r.GET("/packages", handler.GetPackages)
	return r
}

type APIResponse struct {
	Success bool                             `json:"success"`
	Message string                          `json:"message"`
	Data    []catalog_dto.ProductDetailResponse `json:"data"`
	Total   int                             `json:"total"`
	Meta    struct {
		Page  int `json:"page"`
		Limit int `json:"limit"`
		Total int `json:"total"`
	} `json:"meta"`
	ErrorCode string `json:"error_code"`
}

func TestGetProducts_BindingAndFiltering(t *testing.T) {
	t.Run("Default params return standard envelope", func(t *testing.T) {
		var capturedFilters catalog_dto.ProductFilterRequest
		mockUC := &mockProductUseCase{
			getProductsWithFiltersFunc: func(ctx context.Context, filters catalog_dto.ProductFilterRequest) ([]catalog_dto.ProductDetailResponse, int, error) {
				capturedFilters = filters
				return []catalog_dto.ProductDetailResponse{
					{ID: 1, Name: "Produk 1", SKU: "SKU1"},
				}, 1, nil
			},
		}

		r := setupRouter(mockUC)
		w := httptest.NewRecorder()
		req, _ := http.NewRequest("GET", "/products", nil)
		r.ServeHTTP(w, req)

		if w.Code != http.StatusOK {
			t.Fatalf("expected status 200, got %d. Body: %s", w.Code, w.Body.String())
		}

		var resp APIResponse
		if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
			t.Fatalf("failed to parse json response: %v", err)
		}

		if !resp.Success {
			t.Errorf("expected success: true, got false")
		}
		if capturedFilters.Page != 1 || capturedFilters.Limit != 20 {
			t.Errorf("expected default page=1 limit=20, got page=%d limit=%d", capturedFilters.Page, capturedFilters.Limit)
		}
		if len(resp.Data) != 1 || resp.Data[0].SKU != "SKU1" {
			t.Errorf("expected data to contain SKU1, got %+v", resp.Data)
		}
		if resp.Total != 1 || resp.Meta.Total != 1 {
			t.Errorf("expected total=1 and meta.total=1, got total=%d meta.total=%d", resp.Total, resp.Meta.Total)
		}
	})

	t.Run("ProductManagement exact params", func(t *testing.T) {
		var capturedFilters catalog_dto.ProductFilterRequest
		mockUC := &mockProductUseCase{
			getProductsWithFiltersFunc: func(ctx context.Context, filters catalog_dto.ProductFilterRequest) ([]catalog_dto.ProductDetailResponse, int, error) {
				capturedFilters = filters
				return []catalog_dto.ProductDetailResponse{
					{ID: 1, Name: "Produk 1", SKU: "SKU1"},
				}, 1, nil
			},
		}

		r := setupRouter(mockUC)
		w := httptest.NewRecorder()
		req, _ := http.NewRequest("GET", "/products?page=1&limit=50&search=&searchBy=name&sortBy=sku&sortOrder=desc&status=active&categoryInclude=%5B%5D&categoryExclude=%5B%5D", nil)
		r.ServeHTTP(w, req)

		if w.Code != http.StatusOK {
			t.Fatalf("expected status 200, got %d. Body: %s", w.Code, w.Body.String())
		}

		var resp APIResponse
		if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
			t.Fatalf("failed to parse json response: %v", err)
		}

		if capturedFilters.Page != 1 || capturedFilters.Limit != 50 || capturedFilters.SortBy != "sku" || capturedFilters.SortOrder != "desc" {
			t.Errorf("expected captured filters to match query params, got %+v", capturedFilters)
		}

		if !resp.Success {
			t.Errorf("expected success: true")
		}
		if resp.Meta.Limit != 50 || resp.Meta.Page != 1 {
			t.Errorf("expected meta pagination page=1 limit=50, got page=%d limit=%d", resp.Meta.Page, resp.Meta.Limit)
		}
	})

	t.Run("PackageManagement exact params via /products?is_package=1", func(t *testing.T) {
		var capturedFilters catalog_dto.ProductFilterRequest
		mockUC := &mockProductUseCase{
			getProductsWithFiltersFunc: func(ctx context.Context, filters catalog_dto.ProductFilterRequest) ([]catalog_dto.ProductDetailResponse, int, error) {
				capturedFilters = filters
				return []catalog_dto.ProductDetailResponse{
					{ID: 2, Name: "Paket 1", SKU: "PKG1", IsPackage: true},
				}, 1, nil
			},
		}

		r := setupRouter(mockUC)
		w := httptest.NewRecorder()
		req, _ := http.NewRequest("GET", "/products?page=1&limit=50&search=&searchBy=name&sortBy=name&sortOrder=asc&is_package=1&packageOnly=true&status=active&skipComponents=true", nil)
		r.ServeHTTP(w, req)

		if w.Code != http.StatusOK {
			t.Fatalf("expected status 200, got %d. Body: %s", w.Code, w.Body.String())
		}
		if capturedFilters.IsPackage == nil || !*capturedFilters.IsPackage {
			t.Fatalf("expected IsPackage to be true, got %v", capturedFilters.IsPackage)
		}

		var resp APIResponse
		if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
			t.Fatalf("failed to parse json response: %v", err)
		}
		if len(resp.Data) != 1 || !resp.Data[0].IsPackage {
			t.Errorf("expected 1 package item, got %+v", resp.Data)
		}
	})

	t.Run("GetPackages via /packages endpoint enforces IsPackage=true", func(t *testing.T) {
		var capturedFilters catalog_dto.ProductFilterRequest
		mockUC := &mockProductUseCase{
			getProductsWithFiltersFunc: func(ctx context.Context, filters catalog_dto.ProductFilterRequest) ([]catalog_dto.ProductDetailResponse, int, error) {
				capturedFilters = filters
				return []catalog_dto.ProductDetailResponse{
					{ID: 10, Name: "Paket Hemat", SKU: "PKG-HEMAT", IsPackage: true},
				}, 1, nil
			},
		}

		r := setupRouter(mockUC)
		w := httptest.NewRecorder()
		req, _ := http.NewRequest("GET", "/packages?page=1&limit=20", nil)
		r.ServeHTTP(w, req)

		if w.Code != http.StatusOK {
			t.Fatalf("expected status 200, got %d. Body: %s", w.Code, w.Body.String())
		}
		if capturedFilters.IsPackage == nil || !*capturedFilters.IsPackage {
			t.Fatalf("expected IsPackage to be enforced to true for /packages, got %v", capturedFilters.IsPackage)
		}

		var resp APIResponse
		if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
			t.Fatalf("failed to parse json: %v", err)
		}
		if resp.Message != "Berhasil mengambil data paket" {
			t.Errorf("expected message 'Berhasil mengambil data paket', got %q", resp.Message)
		}
	})

	t.Run("Internal server error handling", func(t *testing.T) {
		mockUC := &mockProductUseCase{
			getProductsWithFiltersFunc: func(ctx context.Context, filters catalog_dto.ProductFilterRequest) ([]catalog_dto.ProductDetailResponse, int, error) {
				return nil, 0, errors.New("db query failed")
			},
		}

		r := setupRouter(mockUC)
		w := httptest.NewRecorder()
		req, _ := http.NewRequest("GET", "/products", nil)
		r.ServeHTTP(w, req)

		if w.Code != http.StatusInternalServerError {
			t.Fatalf("expected status 500, got %d", w.Code)
		}

		var resp APIResponse
		if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
			t.Fatalf("failed to parse json: %v", err)
		}
		if resp.Success {
			t.Errorf("expected success: false")
		}
		if resp.ErrorCode != "INTERNAL_SERVER_ERROR" {
			t.Errorf("expected error_code INTERNAL_SERVER_ERROR, got %q", resp.ErrorCode)
		}
	})
}
