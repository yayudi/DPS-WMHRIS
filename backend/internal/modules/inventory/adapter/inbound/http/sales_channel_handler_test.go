package http_test

import (
	"bytes"
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"

	inventory_http "github.com/dps-wmhris/backend/internal/modules/inventory/adapter/inbound/http"
	inventory_dto "github.com/dps-wmhris/backend/internal/modules/inventory/application/dto"
	"github.com/dps-wmhris/backend/internal/modules/inventory/domain"
	inventory_port "github.com/dps-wmhris/backend/internal/modules/inventory/port"
	"github.com/gin-gonic/gin"
)

type stubSalesChannelUC struct {
	inventory_port.SalesChannelUseCase
	getByIDErr error
	createID   int
}

func (s *stubSalesChannelUC) GetChannelByID(_ context.Context, _ int) (*inventory_dto.SalesChannelResponse, error) {
	if s.getByIDErr != nil {
		return nil, s.getByIDErr
	}
	return &inventory_dto.SalesChannelResponse{ID: 1, Platform: "Shopee", Name: "Store"}, nil
}

func (s *stubSalesChannelUC) CreateChannel(_ context.Context, _ inventory_dto.CreateSalesChannelRequest, _ int, _, _ string) (int, error) {
	return s.createID, nil
}

func TestSalesChannelHandler_AuthBindingAndErrors(t *testing.T) {
	gin.SetMode(gin.TestMode)
	uc := &stubSalesChannelUC{createID: 3}
	handler := inventory_http.NewSalesChannelHandler(uc)

	// 1. Unauthenticated mutations must return 401
	rUnauth := gin.New()
	rUnauth.POST("/sales-channels", handler.CreateChannel)
	rUnauth.PUT("/sales-channels/:id", handler.UpdateChannel)
	rUnauth.DELETE("/sales-channels/:id", handler.DeleteChannel)

	for _, tc := range []struct {
		method string
		path   string
	}{
		{http.MethodPost, "/sales-channels"},
		{http.MethodPut, "/sales-channels/1"},
		{http.MethodDelete, "/sales-channels/1"},
	} {
		w := httptest.NewRecorder()
		rUnauth.ServeHTTP(w, httptest.NewRequest(tc.method, tc.path, bytes.NewBufferString(`{"platform":"Shopee","name":"Toko"}`)))
		if w.Code != http.StatusUnauthorized {
			t.Fatalf("%s %s: expected 401, got %d", tc.method, tc.path, w.Code)
		}
	}

	// 2. Authenticated routes: platform enum validation & error mapping
	rAuth := gin.New()
	rAuth.Use(func(c *gin.Context) {
		c.Set("user_id", 5)
		c.Next()
	})
	rAuth.GET("/sales-channels/:id", handler.GetChannelByID)
	rAuth.POST("/sales-channels", handler.CreateChannel)

	// Invalid platform fails binding oneof -> 400
	w := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/sales-channels", bytes.NewBufferString(`{"platform":"InvalidMarket","name":"Toko"}`))
	req.Header.Set("Content-Type", "application/json")
	rAuth.ServeHTTP(w, req)
	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 for invalid platform enum, got %d", w.Code)
	}

	// NotFound -> 404
	uc.getByIDErr = domain.ErrSalesChannelNotFound
	w = httptest.NewRecorder()
	rAuth.ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/sales-channels/99", nil))
	if w.Code != http.StatusNotFound {
		t.Fatalf("expected 404, got %d", w.Code)
	}

	// Unexpected DB error -> 500 (must NOT be masked as 404)
	uc.getByIDErr = errors.New("db offline")
	w = httptest.NewRecorder()
	rAuth.ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/sales-channels/99", nil))
	if w.Code != http.StatusInternalServerError {
		t.Fatalf("expected 500 for unexpected DB error, got %d", w.Code)
	}
}
