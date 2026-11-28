package usecase_test

import (
	"context"
	"database/sql"
	"errors"
	"testing"

	inventory_dto "github.com/dps-wmhris/backend/internal/modules/inventory/application/dto"
	"github.com/dps-wmhris/backend/internal/modules/inventory/application/usecase"
	"github.com/dps-wmhris/backend/internal/modules/inventory/domain"
	"github.com/dps-wmhris/backend/internal/shared/eventbus"
)

type mockSCTxManager struct {
	calls int
}

func (m *mockSCTxManager) WithTransaction(ctx context.Context, fn func(ctx context.Context) error) error {
	m.calls++
	return fn(ctx)
}

type mockSalesChannelRepo struct {
	channels  []inventory_dto.SalesChannelResponse
	byID      map[int]*inventory_dto.SalesChannelResponse
	insertID  int
	updateAff int
	updateErr error
	deleteAff int
	deleteErr error
}

func (m *mockSalesChannelRepo) FindAll(_ context.Context, _ bool) ([]inventory_dto.SalesChannelResponse, error) {
	return m.channels, nil
}

func (m *mockSalesChannelRepo) FindByID(_ context.Context, id int) (*inventory_dto.SalesChannelResponse, error) {
	if ch, ok := m.byID[id]; ok {
		return ch, nil
	}
	return nil, sql.ErrNoRows
}

func (m *mockSalesChannelRepo) Insert(_ context.Context, _ inventory_dto.CreateSalesChannelRequest) (int, error) {
	return m.insertID, nil
}

func (m *mockSalesChannelRepo) Update(_ context.Context, _ int, _ inventory_dto.UpdateSalesChannelRequest) (int, error) {
	return m.updateAff, m.updateErr
}

func (m *mockSalesChannelRepo) Delete(_ context.Context, _ int) (int, error) {
	return m.deleteAff, m.deleteErr
}

type mockAuditEventBus struct {
	eventbus.EventBus
	published []eventbus.Event
}

func (m *mockAuditEventBus) Publish(_ context.Context, evt eventbus.Event) error {
	m.published = append(m.published, evt)
	return nil
}

func TestSalesChannelService_TxNotFoundAndValidation(t *testing.T) {
	ctx := context.Background()
	txMgr := &mockSCTxManager{}
	repo := &mockSalesChannelRepo{
		insertID:  11,
		byID:      map[int]*inventory_dto.SalesChannelResponse{1: {ID: 1, Platform: "Shopee", Name: "Official"}},
		updateAff: 0,
		deleteAff: 0,
	}
	bus := &mockAuditEventBus{}
	svc := usecase.NewSalesChannelService(txMgr, repo, bus)

	// 1. GetAllChannels returns non-nil empty slice
	list, err := svc.GetAllChannels(ctx, true)
	if err != nil || list == nil {
		t.Fatalf("expected non-nil empty slice, got %v / %v", list, err)
	}

	// 2. GetChannelByID maps sql.ErrNoRows -> ErrSalesChannelNotFound
	if _, err := svc.GetChannelByID(ctx, 99); !errors.Is(err, domain.ErrSalesChannelNotFound) {
		t.Fatalf("expected ErrSalesChannelNotFound, got %v", err)
	}

	// 3. CreateChannel rejects invalid platform & blank name before opening transaction
	if _, err := svc.CreateChannel(ctx, inventory_dto.CreateSalesChannelRequest{Platform: "Bad", Name: "Toko"}, 1, "127.0.0.1", "ua"); !errors.Is(err, domain.ErrInvalidSalesChannelPlatform) {
		t.Fatalf("expected ErrInvalidSalesChannelPlatform, got %v", err)
	}
	if _, err := svc.CreateChannel(ctx, inventory_dto.CreateSalesChannelRequest{Platform: "Shopee", Name: "   "}, 1, "127.0.0.1", "ua"); !errors.Is(err, domain.ErrInvalidSalesChannelPayload) {
		t.Fatalf("expected ErrInvalidSalesChannelPayload, got %v", err)
	}
	if txMgr.calls != 0 {
		t.Fatalf("expected 0 transactions on invalid input, got %d", txMgr.calls)
	}

	// 4. Valid CreateChannel runs inside transaction and publishes audit log
	id, err := svc.CreateChannel(ctx, inventory_dto.CreateSalesChannelRequest{Platform: "Shopee", Name: "Toko Utama"}, 1, "127.0.0.1", "ua")
	if err != nil || id != 11 || txMgr.calls != 1 || len(bus.published) != 1 {
		t.Fatalf("unexpected create result: id=%d tx=%d events=%d err=%v", id, txMgr.calls, len(bus.published), err)
	}

	// 5. UpdateChannel & DeleteChannel return ErrSalesChannelNotFound when affected=0 without publishing audit logs
	if err := svc.UpdateChannel(ctx, 999, inventory_dto.UpdateSalesChannelRequest{Platform: "Shopee", Name: "X"}, 1, "127.0.0.1", "ua"); !errors.Is(err, domain.ErrSalesChannelNotFound) {
		t.Fatalf("expected ErrSalesChannelNotFound on update affected=0, got %v", err)
	}
	if err := svc.DeleteChannel(ctx, 999, 1, "127.0.0.1", "ua"); !errors.Is(err, domain.ErrSalesChannelNotFound) {
		t.Fatalf("expected ErrSalesChannelNotFound on delete affected=0, got %v", err)
	}
	if len(bus.published) != 1 {
		t.Fatalf("expected no fake audit logs on not-found update/delete, got %d events", len(bus.published))
	}

	// 6. Successful DeleteChannel publishes structured audit log
	repo.deleteAff = 1
	if err := svc.DeleteChannel(ctx, 1, 1, "127.0.0.1", "ua"); err != nil {
		t.Fatalf("expected delete success, got %v", err)
	}
	if len(bus.published) != 2 {
		t.Fatalf("expected 2 audit events after delete, got %d", len(bus.published))
	}
}
