package http_test

import (
	"bytes"
	"context"
	"net/http"
	"net/http/httptest"
	"testing"

	misc_http "github.com/dps-wmhris/backend/internal/modules/misc/adapter/inbound/http"
	misc_dto "github.com/dps-wmhris/backend/internal/modules/misc/application/dto"
	"github.com/dps-wmhris/backend/internal/modules/misc/domain"
	"github.com/dps-wmhris/backend/internal/shared/middleware"
	"github.com/gin-gonic/gin"
)

type mockPaperSizeUseCase struct {
	getByIDFunc func(ctx context.Context, id int) (*misc_dto.PaperSizeResponse, error)
	createFunc  func(ctx context.Context, req misc_dto.CreatePaperSizeRequest, userID int, ip, ua string) (int, error)
}

func (m *mockPaperSizeUseCase) GetAllPaperSizes(ctx context.Context) ([]misc_dto.PaperSizeResponse, error) {
	return []misc_dto.PaperSizeResponse{}, nil
}
func (m *mockPaperSizeUseCase) GetPaperSizeByID(ctx context.Context, id int) (*misc_dto.PaperSizeResponse, error) {
	if m.getByIDFunc != nil {
		return m.getByIDFunc(ctx, id)
	}
	return nil, domain.ErrPaperSizeNotFound
}
func (m *mockPaperSizeUseCase) CreatePaperSize(ctx context.Context, req misc_dto.CreatePaperSizeRequest, userID int, ip, ua string) (int, error) {
	if m.createFunc != nil {
		return m.createFunc(ctx, req, userID, ip, ua)
	}
	return 1, nil
}
func (m *mockPaperSizeUseCase) UpdatePaperSize(ctx context.Context, id int, req misc_dto.UpdatePaperSizeRequest, userID int, ip, ua string) error {
	return nil
}
func (m *mockPaperSizeUseCase) DeletePaperSize(ctx context.Context, id int, userID int, ip, ua string) error {
	return nil
}

type mockStickerTemplateUseCase struct {
	createFunc func(ctx context.Context, req misc_dto.CreateStickerTemplateRequest, userID int, ip, ua string) (int, error)
	deleteFunc func(ctx context.Context, id int, userID int, ip, ua string) error
}

func (m *mockStickerTemplateUseCase) GetAllStickerTemplates(ctx context.Context) ([]misc_dto.StickerTemplateResponse, error) {
	return []misc_dto.StickerTemplateResponse{}, nil
}
func (m *mockStickerTemplateUseCase) GetStickerTemplateByID(ctx context.Context, id int) (*misc_dto.StickerTemplateResponse, error) {
	return nil, domain.ErrStickerTemplateNotFound
}
func (m *mockStickerTemplateUseCase) CreateStickerTemplate(ctx context.Context, req misc_dto.CreateStickerTemplateRequest, userID int, ip, ua string) (int, error) {
	if m.createFunc != nil {
		return m.createFunc(ctx, req, userID, ip, ua)
	}
	return 2, nil
}
func (m *mockStickerTemplateUseCase) UpdateStickerTemplate(ctx context.Context, id int, req misc_dto.UpdateStickerTemplateRequest, userID int, ip, ua string) error {
	return nil
}
func (m *mockStickerTemplateUseCase) DeleteStickerTemplate(ctx context.Context, id int, userID int, ip, ua string) error {
	if m.deleteFunc != nil {
		return m.deleteFunc(ctx, id, userID, ip, ua)
	}
	return nil
}

func TestMiscHandlers_AuthValidationAndDomainErrors(t *testing.T) {
	gin.SetMode(gin.TestMode)

	paperHandler := misc_http.NewPaperSizeHandler(&mockPaperSizeUseCase{})
	stickerHandler := misc_http.NewStickerTemplateHandler(&mockStickerTemplateUseCase{
		createFunc: func(ctx context.Context, req misc_dto.CreateStickerTemplateRequest, userID int, ip, ua string) (int, error) {
			return 0, domain.ErrInvalidConfigJSON
		},
		deleteFunc: func(ctx context.Context, id int, userID int, ip, ua string) error {
			return domain.ErrStickerTemplateNotFound
		},
	})

	// 1. Unauthenticated POST /paper-sizes returns 401
	rUnauth := gin.New()
	rUnauth.POST("/paper-sizes", paperHandler.CreatePaperSize)
	reqUnauth, _ := http.NewRequest(http.MethodPost, "/paper-sizes", bytes.NewBufferString(`{"name":"Thermal","labelWidth":80,"labelHeight":40,"pageWidth":80,"pageHeight":40}`))
	reqUnauth.Header.Set("Content-Type", "application/json")
	wUnauth := httptest.NewRecorder()
	rUnauth.ServeHTTP(wUnauth, reqUnauth)
	if wUnauth.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401 without auth context, got %d", wUnauth.Code)
	}

	// Authenticated router
	r := gin.New()
	r.Use(func(c *gin.Context) {
		c.Set(middleware.ContextUserIDKey, 9)
		c.Next()
	})
	r.POST("/paper-sizes", paperHandler.CreatePaperSize)
	r.GET("/paper-sizes/:id", paperHandler.GetPaperSizeByID)
	r.POST("/sticker-templates", stickerHandler.CreateStickerTemplate)
	r.DELETE("/sticker-templates/:id", stickerHandler.DeleteStickerTemplate)

	// 2. Authenticated POST /paper-sizes with camelCase payload succeeds with 201
	reqCreate, _ := http.NewRequest(http.MethodPost, "/paper-sizes", bytes.NewBufferString(`{"name":"Thermal","labelWidth":80,"labelHeight":40,"pageWidth":80,"pageHeight":40}`))
	reqCreate.Header.Set("Content-Type", "application/json")
	wCreate := httptest.NewRecorder()
	r.ServeHTTP(wCreate, reqCreate)
	if wCreate.Code != http.StatusCreated {
		t.Fatalf("expected 201 Created for camelCase payload, got %d: %s", wCreate.Code, wCreate.Body.String())
	}

	// 3. GET /paper-sizes/99 returns 404 Not Found
	reqNotFound, _ := http.NewRequest(http.MethodGet, "/paper-sizes/99", nil)
	wNotFound := httptest.NewRecorder()
	r.ServeHTTP(wNotFound, reqNotFound)
	if wNotFound.Code != http.StatusNotFound {
		t.Fatalf("expected 404 Not Found, got %d", wNotFound.Code)
	}

	// 4. POST /sticker-templates domain validation error returns 400
	reqBadConfig, _ := http.NewRequest(http.MethodPost, "/sticker-templates", bytes.NewBufferString(`{"name":"Bad","config_json":"{bad"}`))
	reqBadConfig.Header.Set("Content-Type", "application/json")
	wBadConfig := httptest.NewRecorder()
	r.ServeHTTP(wBadConfig, reqBadConfig)
	if wBadConfig.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 Bad Request, got %d", wBadConfig.Code)
	}

	// 5. DELETE /sticker-templates/99 returns 404 Not Found
	reqDelNF, _ := http.NewRequest(http.MethodDelete, "/sticker-templates/99", nil)
	wDelNF := httptest.NewRecorder()
	r.ServeHTTP(wDelNF, reqDelNF)
	if wDelNF.Code != http.StatusNotFound {
		t.Fatalf("expected 404 Not Found on delete missing template, got %d", wDelNF.Code)
	}
}
