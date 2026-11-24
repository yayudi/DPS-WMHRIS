package http_test

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	catalog_http "github.com/dps-wmhris/backend/internal/modules/catalog/adapter/inbound/http"
	catalog_dto "github.com/dps-wmhris/backend/internal/modules/catalog/application/dto"
	"github.com/dps-wmhris/backend/internal/modules/catalog/domain"
	"github.com/gin-gonic/gin"
)

type mockCategoryUseCase struct {
	getCategoriesFunc   func(ctx context.Context, status string) ([]domain.Category, error)
	restoreCategoryFunc func(ctx context.Context, id int) error
}

func (m *mockCategoryUseCase) CreateCategory(ctx context.Context, req catalog_dto.CreateCategoryRequest) (*domain.Category, error) {
	return nil, nil
}
func (m *mockCategoryUseCase) GetActiveCategories(ctx context.Context) ([]domain.Category, error) {
	return nil, nil
}
func (m *mockCategoryUseCase) GetCategories(ctx context.Context, status string) ([]domain.Category, error) {
	if m.getCategoriesFunc != nil {
		return m.getCategoriesFunc(ctx, status)
	}
	return []domain.Category{}, nil
}
func (m *mockCategoryUseCase) UpdateCategory(ctx context.Context, id int, req catalog_dto.UpdateCategoryRequest) error {
	return nil
}
func (m *mockCategoryUseCase) DeleteCategory(ctx context.Context, id int) error {
	return nil
}
func (m *mockCategoryUseCase) RestoreCategory(ctx context.Context, id int) error {
	if m.restoreCategoryFunc != nil {
		return m.restoreCategoryFunc(ctx, id)
	}
	return nil
}

func setupCategoryRouter(uc *mockCategoryUseCase) *gin.Engine {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	h := catalog_http.NewCategoryHandler(uc)
	r.GET("/api/categories", h.GetAllActive)
	r.POST("/api/categories/:id/restore", h.Restore)
	return r
}

func TestCategoryHandler_GetAllActive_StatusFilter(t *testing.T) {
	var receivedStatuses []string
	mockUC := &mockCategoryUseCase{
		getCategoriesFunc: func(ctx context.Context, status string) ([]domain.Category, error) {
			receivedStatuses = append(receivedStatuses, status)
			if status == "archived" {
				return []domain.Category{{Name: "Arsip 1", IsActive: false, ProductCount: 0}}, nil
			}
			return []domain.Category{{Name: "Aktif 1", IsActive: true, ProductCount: 3}}, nil
		},
	}

	router := setupCategoryRouter(mockUC)

	// Default tanpa query status -> active
	req := httptest.NewRequest(http.MethodGet, "/api/categories", nil)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Code)
	}

	// Status archived
	req2 := httptest.NewRequest(http.MethodGet, "/api/categories?status=archived", nil)
	w2 := httptest.NewRecorder()
	router.ServeHTTP(w2, req2)
	if w2.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w2.Code)
	}

	if len(receivedStatuses) != 2 || receivedStatuses[0] != "active" || receivedStatuses[1] != "archived" {
		t.Fatalf("unexpected statuses passed to usecase: %v", receivedStatuses)
	}

	var resp struct {
		Success bool              `json:"success"`
		Data    []domain.Category `json:"data"`
	}
	if err := json.Unmarshal(w2.Body.Bytes(), &resp); err != nil {
		t.Fatalf("failed to unmarshal response: %v", err)
	}
	if !resp.Success || len(resp.Data) != 1 || resp.Data[0].Name != "Arsip 1" {
		t.Fatalf("unexpected archived response: %+v", resp)
	}
}

func TestCategoryHandler_Restore(t *testing.T) {
	restoredID := 0
	mockUC := &mockCategoryUseCase{
		restoreCategoryFunc: func(ctx context.Context, id int) error {
			restoredID = id
			return nil
		},
	}

	router := setupCategoryRouter(mockUC)

	req := httptest.NewRequest(http.MethodPost, "/api/categories/12/restore", nil)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Code)
	}
	if restoredID != 12 {
		t.Fatalf("expected restored id 12, got %d", restoredID)
	}

	reqBad := httptest.NewRequest(http.MethodPost, "/api/categories/abc/restore", nil)
	wBad := httptest.NewRecorder()
	router.ServeHTTP(wBad, reqBad)
	if wBad.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 for invalid id, got %d", wBad.Code)
	}
}
