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
	"github.com/gin-gonic/gin"
)

type stubReturnUC7C struct {
	inventory_port.ReturnUseCase
	createdCalls int
}

func (s *stubReturnUC7C) ApproveReturn(_ context.Context, _ int, _ inventory_dto.ApproveReturnRequest) error {
	return nil
}

func (s *stubReturnUC7C) CreateManualReturn(_ context.Context, _ int, _ inventory_dto.CreateManualReturnRequest) error {
	s.createdCalls++
	return nil
}

type stubInvestigationUC7C struct {
	inventory_port.InvestigationUseCase
	revertedID int
}

func (s *stubInvestigationUC7C) GetDuplicateTransactions(_ context.Context, req inventory_dto.GetDuplicateTransactionsRequest) (*domain.DuplicateTransactionsResponse, error) {
	return &domain.DuplicateTransactionsResponse{
		Data: []*domain.DuplicateGroup{},
		Meta: domain.DuplicateTransactionsMeta{TotalGroups: 0, Page: req.Page, Limit: req.Limit, TotalPages: 0},
	}, nil
}

func (s *stubInvestigationUC7C) RevertTransaction(_ context.Context, id int, _ int) error {
	s.revertedID = id
	return nil
}

func TestReturnHandler_AuthAndBindingMigration(t *testing.T) {
	gin.SetMode(gin.TestMode)
	uc := &stubReturnUC7C{}
	h := inventory_http.NewReturnHandler(uc)

	// 1. Unauthenticated mutations return 401 BEFORE binding
	rUnauth := gin.New()
	rUnauth.POST("/returns/approve", h.ApproveReturn)
	rUnauth.POST("/returns/manual-entry", h.CreateManualReturn)

	for _, path := range []string{"/returns/approve", "/returns/manual-entry"} {
		w := httptest.NewRecorder()
		req := httptest.NewRequest(http.MethodPost, path, bytes.NewBufferString(`{}`))
		req.Header.Set("Content-Type", "application/json")
		rUnauth.ServeHTTP(w, req)
		if w.Code != http.StatusUnauthorized {
			t.Fatalf("POST %s: expected 401, got %d", path, w.Code)
		}
	}

	// 2. Authenticated binding checks enforce migrated binding tags (condition oneof=GOOD BAD, min=1)
	rAuth := gin.New()
	rAuth.Use(func(c *gin.Context) {
		c.Set("user_id", 4)
		c.Next()
	})
	rAuth.POST("/returns/manual-entry", h.CreateManualReturn)

	// Invalid condition -> 400
	w := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/returns/manual-entry", bytes.NewBufferString(`{"productId":1,"quantity":2,"locationId":3,"condition":"INVALID"}`))
	req.Header.Set("Content-Type", "application/json")
	rAuth.ServeHTTP(w, req)
	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 for invalid return condition, got %d", w.Code)
	}

	// Valid payload -> 200
	w = httptest.NewRecorder()
	req = httptest.NewRequest(http.MethodPost, "/returns/manual-entry", bytes.NewBufferString(`{"productId":1,"quantity":2,"locationId":3,"condition":"GOOD"}`))
	req.Header.Set("Content-Type", "application/json")
	rAuth.ServeHTTP(w, req)
	if w.Code != http.StatusOK || uc.createdCalls != 1 {
		t.Fatalf("expected 200 and 1 create call, got code=%d calls=%d", w.Code, uc.createdCalls)
	}
}

func TestInvestigationHandler_TypedResponseAndRevertAuth(t *testing.T) {
	gin.SetMode(gin.TestMode)
	uc := &stubInvestigationUC7C{}
	h := inventory_http.NewInvestigationHandler(uc)

	rUnauth := gin.New()
	rUnauth.POST("/investigation/revert/:id", h.RevertTransaction)
	w := httptest.NewRecorder()
	rUnauth.ServeHTTP(w, httptest.NewRequest(http.MethodPost, "/investigation/revert/10", nil))
	if w.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401 for unauth revert, got %d", w.Code)
	}

	rAuth := gin.New()
	rAuth.Use(func(c *gin.Context) {
		c.Set("user_id", 7)
		c.Next()
	})
	rAuth.GET("/investigation/duplicates", h.GetDuplicateTransactions)
	rAuth.POST("/investigation/revert/:id", h.RevertTransaction)

	w = httptest.NewRecorder()
	rAuth.ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/investigation/duplicates?page=0&limit=0", nil))
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200 on GetDuplicateTransactions, got %d", w.Code)
	}

	w = httptest.NewRecorder()
	rAuth.ServeHTTP(w, httptest.NewRequest(http.MethodPost, "/investigation/revert/55", nil))
	if w.Code != http.StatusOK || uc.revertedID != 55 {
		t.Fatalf("expected 200 with revertedID=55, got code=%d id=%d", w.Code, uc.revertedID)
	}
}
