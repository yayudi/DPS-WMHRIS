package http_test

import (
	"bytes"
	"context"
	"net/http"
	"net/http/httptest"
	"testing"

	inventory_http "github.com/dps-wmhris/backend/internal/modules/inventory/adapter/inbound/http"
	inventory_dto "github.com/dps-wmhris/backend/internal/modules/inventory/application/dto"
	"github.com/dps-wmhris/backend/internal/modules/inventory/domain"
	inventory_port "github.com/dps-wmhris/backend/internal/modules/inventory/port"
	"github.com/dps-wmhris/backend/internal/shared/kernel"
	"github.com/dps-wmhris/backend/internal/shared/utils"
	"github.com/gin-gonic/gin"
)

type stubLocationUC7A struct {
	inventory_port.LocationUseCase
	createErr   error
	toggleErr   error
	toggledVal  *bool
	lastUserID  int
	lastLocID   int
}

func (s *stubLocationUC7A) CreateLocation(_ context.Context, userID int, req inventory_dto.CreateLocationRequest) (*domain.Location, error) {
	s.lastUserID = userID
	if s.createErr != nil {
		return nil, s.createErr
	}
	return &domain.Location{ImmutableEntity: kernel.ImmutableEntity{ID: 1}, Code: req.Code}, nil
}

func (s *stubLocationUC7A) UpdateLocation(_ context.Context, userID int, id int, _ inventory_dto.UpdateLocationRequest) error {
	s.lastUserID = userID
	s.lastLocID = id
	return nil
}

func (s *stubLocationUC7A) DeleteLocation(_ context.Context, userID int, id int) error {
	s.lastUserID = userID
	s.lastLocID = id
	return nil
}

func (s *stubLocationUC7A) ToggleFulfillmentSource(_ context.Context, userID int, locationID int, flag bool) error {
	s.lastUserID = userID
	s.lastLocID = locationID
	val := flag
	s.toggledVal = &val
	return s.toggleErr
}

type stubSlotUC7A struct {
	inventory_port.SlotUseCase
	lastRefID string
	lastPage  int
	lastLimit int
}

func (s *stubSlotUC7A) AddSlot(_ context.Context, _ int, _ inventory_dto.UpsertSlotRequest) (*inventory_dto.SlotResponse, error) {
	return &inventory_dto.SlotResponse{ID: 1}, nil
}

func (s *stubSlotUC7A) DeleteSlot(_ context.Context, _ int, _ int, _ *string) error {
	return nil
}

func (s *stubSlotUC7A) SetPrimarySlot(_ context.Context, _ int, _ int, _ int, _ int) error {
	return nil
}

func (s *stubSlotUC7A) GetSlotLogs(_ context.Context, _ int, _ int, page int, limit int) (utils.PaginatedResult[domain.ProductLocationSlotLog], error) {
	s.lastPage = page
	s.lastLimit = limit
	return utils.PaginatedResult[domain.ProductLocationSlotLog]{Data: []domain.ProductLocationSlotLog{}}, nil
}

func (s *stubSlotUC7A) GetPickingLocationsForKelja(_ context.Context, refID string) (*inventory_dto.KeljaPickingLocationsResponse, error) {
	s.lastRefID = refID
	return &inventory_dto.KeljaPickingLocationsResponse{ReferenceID: refID, Items: []inventory_dto.KeljaItemPickingLocation{}}, nil
}

type stubStockRequestUC7A struct {
	inventory_port.StockRequestUseCase
	approvedRoleID int
}

func (s *stubStockRequestUC7A) CreateStockRequest(_ context.Context, _ int, _ inventory_dto.CreateStockRequest) (*domain.StockRequest, error) {
	return &domain.StockRequest{BaseEntity: kernel.BaseEntity{ID: 1}}, nil
}

func (s *stubStockRequestUC7A) ApproveStockRequest(_ context.Context, _ int, _ int, roleID int) error {
	s.approvedRoleID = roleID
	return nil
}

func (s *stubStockRequestUC7A) RejectStockRequest(_ context.Context, _ int, _ int, _ int) error {
	return nil
}

func (s *stubStockRequestUC7A) DispatchStockRequest(_ context.Context, _ int, _ int, _ int) error {
	return nil
}

func (s *stubStockRequestUC7A) CompleteStockRequest(_ context.Context, _ int, _ inventory_dto.CompleteStockRequest, _ int, _ int) error {
	return nil
}

func (s *stubStockRequestUC7A) BulkActionStockRequest(_ context.Context, _ inventory_dto.BulkActionStockRequest, _ int, _ int) (map[string]any, error) {
	return map[string]any{"successCount": 1}, nil
}

func TestLocationHandler_AuthBindingAndErrors(t *testing.T) {
	gin.SetMode(gin.TestMode)
	uc := &stubLocationUC7A{}
	h := inventory_http.NewLocationHandler(uc)

	// 1. Unauthenticated mutations return 401
	rUnauth := gin.New()
	rUnauth.POST("/locations", h.Create)
	rUnauth.PUT("/locations/:id", h.Update)
	rUnauth.DELETE("/locations/:id", h.Delete)
	rUnauth.PATCH("/locations/:id/fulfillment-source", h.ToggleFulfillmentSource)

	for _, tc := range []struct {
		method string
		path   string
		body   string
	}{
		{http.MethodPost, "/locations", `{"code":"A1","building":"B1","is_active":true}`},
		{http.MethodPut, "/locations/1", `{"code":"A1","building":"B1","is_active":true}`},
		{http.MethodDelete, "/locations/1", ``},
		{http.MethodPatch, "/locations/1/fulfillment-source", `{"is_fulfillment_source":true}`},
	} {
		w := httptest.NewRecorder()
		req := httptest.NewRequest(tc.method, tc.path, bytes.NewBufferString(tc.body))
		req.Header.Set("Content-Type", "application/json")
		rUnauth.ServeHTTP(w, req)
		if w.Code != http.StatusUnauthorized {
			t.Fatalf("%s %s: expected 401, got %d", tc.method, tc.path, w.Code)
		}
	}

	// 2. Authenticated routes: pointer *bool validation on ToggleFulfillmentSource & domain error mapping
	rAuth := gin.New()
	rAuth.Use(func(c *gin.Context) {
		c.Set("user_id", 7)
		c.Next()
	})
	rAuth.POST("/locations", h.Create)
	rAuth.PATCH("/locations/:id/fulfillment-source", h.ToggleFulfillmentSource)

	// Empty JSON {} must be rejected (400) instead of silently defaulting to false
	w := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPatch, "/locations/2/fulfillment-source", bytes.NewBufferString(`{}`))
	req.Header.Set("Content-Type", "application/json")
	rAuth.ServeHTTP(w, req)
	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 for missing is_fulfillment_source, got %d", w.Code)
	}

	// Explicit false is accepted (200)
	w = httptest.NewRecorder()
	req = httptest.NewRequest(http.MethodPatch, "/locations/2/fulfillment-source", bytes.NewBufferString(`{"is_fulfillment_source":false}`))
	req.Header.Set("Content-Type", "application/json")
	rAuth.ServeHTTP(w, req)
	if w.Code != http.StatusOK || uc.toggledVal == nil || *uc.toggledVal != false {
		t.Fatalf("expected 200 with toggledVal=false, got code=%d val=%v", w.Code, uc.toggledVal)
	}

	// ErrDuplicateLocationCode -> 409 Conflict
	uc.createErr = domain.ErrDuplicateLocationCode
	w = httptest.NewRecorder()
	req = httptest.NewRequest(http.MethodPost, "/locations", bytes.NewBufferString(`{"code":"DUP","building":"B1","is_active":true}`))
	req.Header.Set("Content-Type", "application/json")
	rAuth.ServeHTTP(w, req)
	if w.Code != http.StatusConflict {
		t.Fatalf("expected 409 for duplicate location code, got %d", w.Code)
	}

	// ErrLocationNotFound -> 404 Not Found
	uc.toggleErr = domain.ErrLocationNotFound
	w = httptest.NewRecorder()
	req = httptest.NewRequest(http.MethodPatch, "/locations/99/fulfillment-source", bytes.NewBufferString(`{"is_fulfillment_source":true}`))
	req.Header.Set("Content-Type", "application/json")
	rAuth.ServeHTTP(w, req)
	if w.Code != http.StatusNotFound {
		t.Fatalf("expected 404 for missing location, got %d", w.Code)
	}
}

func TestSlotHandler_AuthBindingAndKeljaRefTrim(t *testing.T) {
	gin.SetMode(gin.TestMode)
	uc := &stubSlotUC7A{}
	h := inventory_http.NewSlotHandler(uc)

	// 1. Unauthenticated mutations return 401
	rUnauth := gin.New()
	rUnauth.POST("/slots", h.AddSlot)
	rUnauth.DELETE("/slots/:id", h.DeleteSlot)
	rUnauth.PATCH("/slots/:id/primary", h.SetPrimarySlot)

	for _, tc := range []struct {
		method string
		path   string
	}{
		{http.MethodPost, "/slots"},
		{http.MethodDelete, "/slots/5"},
		{http.MethodPatch, "/slots/5/primary?product_id=1&location_id=2"},
	} {
		w := httptest.NewRecorder()
		req := httptest.NewRequest(tc.method, tc.path, bytes.NewBufferString(`{"product_id":1,"location_id":2,"room":"A","rack":"1"}`))
		req.Header.Set("Content-Type", "application/json")
		rUnauth.ServeHTTP(w, req)
		if w.Code != http.StatusUnauthorized {
			t.Fatalf("%s %s: expected 401, got %d", tc.method, tc.path, w.Code)
		}
	}

	// 2. Authenticated binding checks, pagination, and Kelja reference_id trimming
	rAuth := gin.New()
	rAuth.Use(func(c *gin.Context) {
		c.Set("user_id", 3)
		c.Next()
	})
	rAuth.POST("/slots", h.AddSlot)
	rAuth.GET("/slots/logs", h.GetSlotLogs)
	rAuth.GET("/kelja/picking/:reference_id", h.GetPickingLocationsForKelja)

	// product_id: 0 rejected by binding min=1 -> 400
	w := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/slots", bytes.NewBufferString(`{"product_id":0,"location_id":1,"room":"A","rack":"1"}`))
	req.Header.Set("Content-Type", "application/json")
	rAuth.ServeHTTP(w, req)
	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 for product_id=0, got %d", w.Code)
	}

	// Blank whitespace reference_id rejected -> 400
	w = httptest.NewRecorder()
	rAuth.ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/kelja/picking/%20%20", nil))
	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 for whitespace reference_id, got %d", w.Code)
	}

	// Valid reference_id is trimmed
	w = httptest.NewRecorder()
	rAuth.ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/kelja/picking/%20ORD-100%20", nil))
	if w.Code != http.StatusOK || uc.lastRefID != "ORD-100" {
		t.Fatalf("expected 200 with trimmed ORD-100, got code=%d ref=%q", w.Code, uc.lastRefID)
	}

	// GetSlotLogs parses pagination properly
	w = httptest.NewRecorder()
	rAuth.ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/slots/logs?product_id=10&location_id=20&page=2&limit=50", nil))
	if w.Code != http.StatusOK || uc.lastPage != 2 || uc.lastLimit != 50 {
		t.Fatalf("expected 200 page=2 limit=50, got code=%d page=%d limit=%d", w.Code, uc.lastPage, uc.lastLimit)
	}
}

func TestStockRequestHandler_AuthDiveValidationAndRolePropagation(t *testing.T) {
	gin.SetMode(gin.TestMode)
	uc := &stubStockRequestUC7A{}
	h := inventory_http.NewStockRequestHandler(uc)

	// 1. Unauthenticated mutations return 401
	rUnauth := gin.New()
	rUnauth.POST("/stock-requests", h.Create)
	rUnauth.POST("/stock-requests/:id/approve", h.Approve)
	rUnauth.POST("/stock-requests/:id/reject", h.Reject)
	rUnauth.POST("/stock-requests/:id/dispatch", h.Dispatch)
	rUnauth.POST("/stock-requests/:id/complete", h.Complete)
	rUnauth.POST("/stock-requests/bulk-action", h.BulkAction)

	for _, path := range []string{
		"/stock-requests",
		"/stock-requests/1/approve",
		"/stock-requests/1/reject",
		"/stock-requests/1/dispatch",
		"/stock-requests/1/complete",
		"/stock-requests/bulk-action",
	} {
		w := httptest.NewRecorder()
		req := httptest.NewRequest(http.MethodPost, path, bytes.NewBufferString(`{}`))
		req.Header.Set("Content-Type", "application/json")
		rUnauth.ServeHTTP(w, req)
		if w.Code != http.StatusUnauthorized {
			t.Fatalf("POST %s: expected 401, got %d", path, w.Code)
		}
	}

	// 2. Authenticated DTO validation (oneof + dive) & role_id forwarding
	rAuth := gin.New()
	rAuth.Use(func(c *gin.Context) {
		c.Set("user_id", 9)
		c.Set("role_id", 4)
		c.Next()
	})
	rAuth.POST("/stock-requests", h.Create)
	rAuth.POST("/stock-requests/:id/approve", h.Approve)
	rAuth.POST("/stock-requests/bulk-action", h.BulkAction)

	// Invalid type rejected by oneof=TRANSFER STOCK_OPNAME -> 400
	w := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/stock-requests", bytes.NewBufferString(`{"type":"UNKNOWN","items":[{"productId":1,"quantity":2}]}`))
	req.Header.Set("Content-Type", "application/json")
	rAuth.ServeHTTP(w, req)
	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 for invalid type, got %d", w.Code)
	}

	// Nested invalid item quantity=0 rejected by dive -> 400
	w = httptest.NewRecorder()
	req = httptest.NewRequest(http.MethodPost, "/stock-requests", bytes.NewBufferString(`{"type":"TRANSFER","fromLocationId":1,"toLocationId":2,"items":[{"productId":1,"quantity":0}]}`))
	req.Header.Set("Content-Type", "application/json")
	rAuth.ServeHTTP(w, req)
	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 for nested item quantity=0, got %d", w.Code)
	}

	// BulkAction with requestIds: [0] rejected by dive,min=1 -> 400
	w = httptest.NewRecorder()
	req = httptest.NewRequest(http.MethodPost, "/stock-requests/bulk-action", bytes.NewBufferString(`{"action":"APPROVE","requestIds":[0]}`))
	req.Header.Set("Content-Type", "application/json")
	rAuth.ServeHTTP(w, req)
	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 for requestIds=[0], got %d", w.Code)
	}

	// Approve forwards caller role_id=4
	w = httptest.NewRecorder()
	rAuth.ServeHTTP(w, httptest.NewRequest(http.MethodPost, "/stock-requests/5/approve", nil))
	if w.Code != http.StatusOK || uc.approvedRoleID != 4 {
		t.Fatalf("expected 200 with approvedRoleID=4, got code=%d roleID=%d", w.Code, uc.approvedRoleID)
	}
}
