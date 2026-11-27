package usecase_test

import (
	"context"
	"database/sql"
	"errors"
	"testing"

	misc_dto "github.com/dps-wmhris/backend/internal/modules/misc/application/dto"
	"github.com/dps-wmhris/backend/internal/modules/misc/application/usecase"
	"github.com/dps-wmhris/backend/internal/modules/misc/domain"
	"github.com/dps-wmhris/backend/internal/shared/eventbus"
)

type mockMiscTxManager struct {
	calls int
}

func (m *mockMiscTxManager) WithTransaction(ctx context.Context, fn func(ctx context.Context) error) error {
	m.calls++
	return fn(ctx)
}

type mockMiscEventBus struct {
	events []eventbus.Event
}

func (m *mockMiscEventBus) Publish(ctx context.Context, event eventbus.Event) error {
	m.events = append(m.events, event)
	return nil
}
func (m *mockMiscEventBus) Subscribe(eventType string, handler eventbus.EventHandler) error {
	return nil
}
func (m *mockMiscEventBus) Start(ctx context.Context) error { return nil }
func (m *mockMiscEventBus) Close() error                    { return nil }

type mockPaperSizeRepo struct {
	findByIDErr error
	affected    int
	lastInsert  misc_dto.CreatePaperSizeRequest
}

func (m *mockPaperSizeRepo) FindAll(ctx context.Context) ([]misc_dto.PaperSizeResponse, error) {
	return []misc_dto.PaperSizeResponse{}, nil
}
func (m *mockPaperSizeRepo) FindByID(ctx context.Context, id int) (*misc_dto.PaperSizeResponse, error) {
	if m.findByIDErr != nil {
		return nil, m.findByIDErr
	}
	return &misc_dto.PaperSizeResponse{ID: id, Name: "80x40"}, nil
}
func (m *mockPaperSizeRepo) Insert(ctx context.Context, req misc_dto.CreatePaperSizeRequest) (int, error) {
	m.lastInsert = req
	return 7, nil
}
func (m *mockPaperSizeRepo) Update(ctx context.Context, id int, req misc_dto.UpdatePaperSizeRequest) (int, error) {
	return m.affected, nil
}
func (m *mockPaperSizeRepo) Delete(ctx context.Context, id int) (int, error) {
	return m.affected, nil
}

type mockStickerTemplateRepo struct {
	findByIDErr    error
	affected       int
	lastConfigJSON *string
}

func (m *mockStickerTemplateRepo) FindAll(ctx context.Context) ([]misc_dto.StickerTemplateResponse, error) {
	return []misc_dto.StickerTemplateResponse{}, nil
}
func (m *mockStickerTemplateRepo) FindByID(ctx context.Context, id int) (*misc_dto.StickerTemplateResponse, error) {
	if m.findByIDErr != nil {
		return nil, m.findByIDErr
	}
	return &misc_dto.StickerTemplateResponse{ID: id, Name: "Default"}, nil
}
func (m *mockStickerTemplateRepo) Insert(ctx context.Context, req misc_dto.CreateStickerTemplateRequest, configJSONStr *string) (int, error) {
	m.lastConfigJSON = configJSONStr
	return 11, nil
}
func (m *mockStickerTemplateRepo) Update(ctx context.Context, id int, req misc_dto.UpdateStickerTemplateRequest, configJSONStr *string) (int, error) {
	m.lastConfigJSON = configJSONStr
	return m.affected, nil
}
func (m *mockStickerTemplateRepo) Delete(ctx context.Context, id int) (int, error) {
	return m.affected, nil
}

func TestPaperSizeService_DefaultsTransactionsAndNotFound(t *testing.T) {
	tx := &mockMiscTxManager{}
	bus := &mockMiscEventBus{}
	repo := &mockPaperSizeRepo{affected: 0, findByIDErr: sql.ErrNoRows}
	svc := usecase.NewPaperSizeService(tx, repo, bus)

	id, err := svc.CreatePaperSize(context.Background(), misc_dto.CreatePaperSizeRequest{
		Name:        "  Thermal  ",
		LabelWidth:  80,
		LabelHeight: 40,
		PageWidth:   80,
		PageHeight:  40,
	}, 1, "127.0.0.1", "test")
	if err != nil || id != 7 {
		t.Fatalf("expected (7, nil), got (%d, %v)", id, err)
	}
	if repo.lastInsert.Name != "Thermal" || repo.lastInsert.NumberAcross != 1 || repo.lastInsert.NumberDown != 1 {
		t.Fatalf("expected trimmed name and default layout 1x1, got %+v", repo.lastInsert)
	}
	if tx.calls != 1 || len(bus.events) != 1 {
		t.Fatalf("expected 1 tx call and 1 audit event, got tx=%d events=%d", tx.calls, len(bus.events))
	}

	if _, err := svc.GetPaperSizeByID(context.Background(), 99); !errors.Is(err, domain.ErrPaperSizeNotFound) {
		t.Fatalf("expected ErrPaperSizeNotFound on GetPaperSizeByID, got %v", err)
	}

	if err := svc.DeletePaperSize(context.Background(), 99, 1, "127.0.0.1", "test"); !errors.Is(err, domain.ErrPaperSizeNotFound) {
		t.Fatalf("expected ErrPaperSizeNotFound on DeletePaperSize with 0 affected rows, got %v", err)
	}
	if len(bus.events) != 1 {
		t.Fatalf("expected no audit event published on failed delete, got %d", len(bus.events))
	}
}

func TestStickerTemplateService_ConfigJSONAndNotFound(t *testing.T) {
	tx := &mockMiscTxManager{}
	bus := &mockMiscEventBus{}
	repo := &mockStickerTemplateRepo{affected: 0, findByIDErr: sql.ErrNoRows}
	svc := usecase.NewStickerTemplateService(tx, repo, bus)

	// Invalid JSON string rejected before DB transaction
	_, err := svc.CreateStickerTemplate(context.Background(), misc_dto.CreateStickerTemplateRequest{
		Name:       "Bad",
		ConfigJSON: "{invalid",
	}, 1, "127.0.0.1", "test")
	if !errors.Is(err, domain.ErrInvalidConfigJSON) {
		t.Fatalf("expected ErrInvalidConfigJSON, got %v", err)
	}
	if tx.calls != 0 {
		t.Fatalf("expected 0 tx calls on invalid config_json, got %d", tx.calls)
	}

	// Valid JSON string stored directly without double-encoding
	raw := `{"objects":[],"paper_size_id":1}`
	id, err := svc.CreateStickerTemplate(context.Background(), misc_dto.CreateStickerTemplateRequest{
		Name:       "Standard",
		PaperSize:  "80x40",
		ConfigJSON: raw,
	}, 1, "127.0.0.1", "test")
	if err != nil || id != 11 {
		t.Fatalf("expected (11, nil), got (%d, %v)", id, err)
	}
	if repo.lastConfigJSON == nil || *repo.lastConfigJSON != raw {
		t.Fatalf("expected single-encoded config_json %q, got %v", raw, repo.lastConfigJSON)
	}

	// Missing template on update returns ErrStickerTemplateNotFound
	err = svc.UpdateStickerTemplate(context.Background(), 404, misc_dto.UpdateStickerTemplateRequest{
		Name: "Missing",
	}, 1, "127.0.0.1", "test")
	if !errors.Is(err, domain.ErrStickerTemplateNotFound) {
		t.Fatalf("expected ErrStickerTemplateNotFound, got %v", err)
	}
}
