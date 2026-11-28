package http_test

import (
	"bytes"
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	inventory_http "github.com/dps-wmhris/backend/internal/modules/inventory/adapter/inbound/http"
	inventory_dto "github.com/dps-wmhris/backend/internal/modules/inventory/application/dto"
	"github.com/dps-wmhris/backend/internal/modules/inventory/domain"
	inventory_port "github.com/dps-wmhris/backend/internal/modules/inventory/port"
	system_dto "github.com/dps-wmhris/backend/internal/modules/system/application/dto"
	system_port "github.com/dps-wmhris/backend/internal/modules/system/port"
	"github.com/gin-gonic/gin"
)

type stubStockUC7B struct {
	inventory_port.StockUseCase
	lastBatchReq inventory_dto.BatchProcessRequest
}

func (s *stubStockUC7B) MoveStock(_ context.Context, _ int, _ inventory_dto.MoveStockRequest) error {
	return nil
}

func (s *stubStockUC7B) ProcessBatchMovements(_ context.Context, req inventory_dto.BatchProcessRequest, _ int, _ int) error {
	s.lastBatchReq = req
	return nil
}

type stubJobSvc7B struct {
	system_port.JobService
	lastExportReq system_dto.CreateExportJobRequest
}

func (s *stubJobSvc7B) CreateExportJob(_ context.Context, req system_dto.CreateExportJobRequest) (int, error) {
	s.lastExportReq = req
	return 77, nil
}

type stubStockQueryUC7B struct {
	inventory_port.StockQueryUseCase
	lastLocID  *int
	lastProdID *int
}

func (s *stubStockQueryUC7B) GetStockBalances(_ context.Context, locID *int, prodID *int) ([]inventory_dto.StockBalanceResponse, error) {
	s.lastLocID = locID
	s.lastProdID = prodID
	return []inventory_dto.StockBalanceResponse{}, nil
}

type stubStockTrxUC7B struct {
	inventory_port.StockTransactionUseCase
	releasedID uint
}

func (s *stubStockTrxUC7B) CreateTransaction(_ context.Context, _ inventory_dto.CreateTransactionRequest) (*domain.StockTransaction, error) {
	return &domain.StockTransaction{ID: 1, Status: domain.TransactionStatusReadyToPick}, nil
}

func (s *stubStockTrxUC7B) ExecuteTransaction(_ context.Context, _ inventory_dto.ExecuteTransactionRequest, _ uint) error {
	return nil
}

func (s *stubStockTrxUC7B) BatchExecuteTransactions(_ context.Context, _ inventory_dto.BatchExecuteTransactionRequest, _ uint) (*inventory_dto.BatchExecuteResult, error) {
	return &inventory_dto.BatchExecuteResult{TotalProcessed: 1, SuccessCount: 1}, nil
}

func (s *stubStockTrxUC7B) ReleaseHeldFulfillment(_ context.Context, id uint) (*domain.StockTransaction, error) {
	s.releasedID = id
	return &domain.StockTransaction{ID: id, Status: domain.TransactionStatusReadyToPick}, nil
}

func TestStockHandler_AuthBindingAndExportUserFilter(t *testing.T) {
	gin.SetMode(gin.TestMode)
	stockUC := &stubStockUC7B{}
	jobSvc := &stubJobSvc7B{}
	h := inventory_http.NewStockHandler(stockUC, jobSvc)

	// 1. Unauthenticated endpoints return 401 BEFORE touching body or upload
	rUnauth := gin.New()
	rUnauth.POST("/stock/import-batch", h.ImportBatchInbound)
	rUnauth.POST("/stock/transfer", h.TransferStock)
	rUnauth.POST("/stock/adjust", h.AdjustStock)
	rUnauth.POST("/stock/batch-process", h.BatchProcess)
	rUnauth.POST("/stock/batch-transfer", h.BatchTransfer)
	rUnauth.POST("/stock/batch-log/export", h.RequestBatchLogExport)

	for _, path := range []string{
		"/stock/import-batch",
		"/stock/transfer",
		"/stock/adjust",
		"/stock/batch-process",
		"/stock/batch-transfer",
		"/stock/batch-log/export",
	} {
		w := httptest.NewRecorder()
		req := httptest.NewRequest(http.MethodPost, path, bytes.NewBufferString(`{}`))
		req.Header.Set("Content-Type", "application/json")
		rUnauth.ServeHTTP(w, req)
		if w.Code != http.StatusUnauthorized {
			t.Fatalf("POST %s: expected 401, got %d", path, w.Code)
		}
	}

	// 2. Authenticated binding checks and export userId preservation
	rAuth := gin.New()
	rAuth.Use(func(c *gin.Context) {
		c.Set("user_id", 11)
		c.Set("role_id", 1)
		c.Next()
	})
	rAuth.POST("/stock/batch-process", h.BatchProcess)
	rAuth.POST("/stock/batch-log/export", h.RequestBatchLogExport)

	// Invalid movement type rejected by oneof -> 400
	w := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/stock/batch-process", bytes.NewBufferString(`{"type":"BOGUS","movements":[{"sku":"S1","quantity":1}]}`))
	req.Header.Set("Content-Type", "application/json")
	rAuth.ServeHTTP(w, req)
	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 for invalid BatchProcess type, got %d", w.Code)
	}

	// RequestBatchLogExport includes userId in Filters JSON
	w = httptest.NewRecorder()
	req = httptest.NewRequest(http.MethodPost, "/stock/batch-log/export", bytes.NewBufferString(`{"startDate":"2026-11-01","endDate":"2026-11-28","userId":42}`))
	req.Header.Set("Content-Type", "application/json")
	rAuth.ServeHTTP(w, req)
	if w.Code != http.StatusAccepted || jobSvc.lastExportReq.Filters == nil || !strings.Contains(*jobSvc.lastExportReq.Filters, `"userId":42`) {
		t.Fatalf("expected 202 with userId in filter JSON, got code=%d filters=%v", w.Code, jobSvc.lastExportReq.Filters)
	}
}

func TestStockQueryHandler_RejectsInvalidFilterParams(t *testing.T) {
	gin.SetMode(gin.TestMode)
	qUC := &stubStockQueryUC7B{}
	h := inventory_http.NewStockQueryHandler(qUC)

	r := gin.New()
	r.GET("/wms/stock-balances", h.GetBalances)

	for _, url := range []string{
		"/wms/stock-balances?location_id=abc",
		"/wms/stock-balances?location_id=0",
		"/wms/stock-balances?product_id=-5",
	} {
		w := httptest.NewRecorder()
		r.ServeHTTP(w, httptest.NewRequest(http.MethodGet, url, nil))
		if w.Code != http.StatusBadRequest {
			t.Fatalf("GET %s: expected 400, got %d", url, w.Code)
		}
	}

	w := httptest.NewRecorder()
	r.ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/wms/stock-balances?location_id=3&product_id=9", nil))
	if w.Code != http.StatusOK || qUC.lastLocID == nil || *qUC.lastLocID != 3 || qUC.lastProdID == nil || *qUC.lastProdID != 9 {
		t.Fatalf("expected 200 loc=3 prod=9, got code=%d loc=%v prod=%v", w.Code, qUC.lastLocID, qUC.lastProdID)
	}
}

func TestStockTransactionHandler_AuthDiveValidationAndReleaseID(t *testing.T) {
	gin.SetMode(gin.TestMode)
	trxUC := &stubStockTrxUC7B{}
	h := inventory_http.NewStockTransactionHandler(trxUC)

	// 1. Unauthenticated mutations return 401
	rUnauth := gin.New()
	rUnauth.POST("/wms/transactions/create", h.CreateTransaction)
	rUnauth.POST("/wms/transactions/execute", h.ExecuteTransaction)
	rUnauth.POST("/wms/transactions/batch-execute", h.BatchExecuteTransactions)
	rUnauth.POST("/wms/fulfillments/:id/release", h.ReleaseHeldFulfillment)

	for _, path := range []string{
		"/wms/transactions/create",
		"/wms/transactions/execute",
		"/wms/transactions/batch-execute",
		"/wms/fulfillments/1/release",
	} {
		w := httptest.NewRecorder()
		req := httptest.NewRequest(http.MethodPost, path, bytes.NewBufferString(`{}`))
		req.Header.Set("Content-Type", "application/json")
		rUnauth.ServeHTTP(w, req)
		if w.Code != http.StatusUnauthorized {
			t.Fatalf("POST %s: expected 401, got %d", path, w.Code)
		}
	}

	// 2. Authenticated dive validation & id=0 rejection on ReleaseHeldFulfillment
	rAuth := gin.New()
	rAuth.Use(func(c *gin.Context) {
		c.Set("user_id", 5)
		c.Next()
	})
	rAuth.POST("/wms/transactions/create", h.CreateTransaction)
	rAuth.POST("/wms/transactions/batch-execute", h.BatchExecuteTransactions)
	rAuth.POST("/wms/fulfillments/:id/release", h.ReleaseHeldFulfillment)

	// CreateTransaction nested item target_quantity=0 rejected by dive -> 400
	w := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/wms/transactions/create", bytes.NewBufferString(`{"reference_type":"ORDER","reference_id":"R1","items":[{"product_id":1,"target_quantity":0}]}`))
	req.Header.Set("Content-Type", "application/json")
	rAuth.ServeHTTP(w, req)
	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 for nested target_quantity=0 via dive, got %d", w.Code)
	}

	// BatchExecuteTransactions nested qty_done=0 rejected by dive -> 400
	w = httptest.NewRecorder()
	req = httptest.NewRequest(http.MethodPost, "/wms/transactions/batch-execute", bytes.NewBufferString(`{"items":[{"transaction_id":1,"movement_id":2,"location_id":3,"qty_done":0}]}`))
	req.Header.Set("Content-Type", "application/json")
	rAuth.ServeHTTP(w, req)
	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 for nested qty_done=0 via dive, got %d", w.Code)
	}

	// ReleaseHeldFulfillment rejects id=0 -> 400, accepts id=9 -> 200
	w = httptest.NewRecorder()
	rAuth.ServeHTTP(w, httptest.NewRequest(http.MethodPost, "/wms/fulfillments/0/release", nil))
	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 for release id=0, got %d", w.Code)
	}

	w = httptest.NewRecorder()
	rAuth.ServeHTTP(w, httptest.NewRequest(http.MethodPost, "/wms/fulfillments/9/release", nil))
	if w.Code != http.StatusOK || trxUC.releasedID != 9 {
		t.Fatalf("expected 200 with releasedID=9, got code=%d id=%d", w.Code, trxUC.releasedID)
	}
}
