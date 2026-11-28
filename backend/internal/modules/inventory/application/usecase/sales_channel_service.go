package usecase

import (
	"context"
	"database/sql"
	"errors"
	"strconv"
	"strings"

	inventory_dto "github.com/dps-wmhris/backend/internal/modules/inventory/application/dto"
	"github.com/dps-wmhris/backend/internal/modules/inventory/domain"
	inventory_port "github.com/dps-wmhris/backend/internal/modules/inventory/port"
	"github.com/dps-wmhris/backend/internal/shared/database"
	"github.com/dps-wmhris/backend/internal/shared/eventbus"
)

// SalesChannelService is a compatibility alias for inventory_port.SalesChannelUseCase.
type SalesChannelService = inventory_port.SalesChannelUseCase

type salesChannelServiceImpl struct {
	txManager        database.TransactionManager
	salesChannelRepo inventory_port.SalesChannelRepository
	eventBus         eventbus.EventBus
}

// NewSalesChannelService creates a SalesChannelUseCase wired with transaction management and event publishing.
func NewSalesChannelService(
	txManager database.TransactionManager,
	salesChannelRepo inventory_port.SalesChannelRepository,
	eventBus eventbus.EventBus,
) inventory_port.SalesChannelUseCase {
	return &salesChannelServiceImpl{
		txManager:        txManager,
		salesChannelRepo: salesChannelRepo,
		eventBus:         eventBus,
	}
}

func (s *salesChannelServiceImpl) GetAllChannels(ctx context.Context, activeOnly bool) ([]inventory_dto.SalesChannelResponse, error) {
	channels, err := s.salesChannelRepo.FindAll(ctx, activeOnly)
	if err != nil {
		return nil, err
	}
	if channels == nil {
		return []inventory_dto.SalesChannelResponse{}, nil
	}
	return channels, nil
}

func (s *salesChannelServiceImpl) GetChannelByID(ctx context.Context, id int) (*inventory_dto.SalesChannelResponse, error) {
	ch, err := s.salesChannelRepo.FindByID(ctx, id)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, domain.ErrSalesChannelNotFound
		}
		return nil, err
	}
	if ch == nil {
		return nil, domain.ErrSalesChannelNotFound
	}
	return ch, nil
}

func (s *salesChannelServiceImpl) CreateChannel(ctx context.Context, req inventory_dto.CreateSalesChannelRequest, userID int, ip, userAgent string) (int, error) {
	req.Platform = strings.TrimSpace(req.Platform)
	req.Name = strings.TrimSpace(req.Name)
	req.Description = strings.TrimSpace(req.Description)

	if err := domain.ValidateSalesChannelPlatform(req.Platform); err != nil {
		return 0, err
	}
	if req.Name == "" {
		return 0, domain.ErrInvalidSalesChannelPayload
	}

	var id int
	if err := s.txManager.WithTransaction(ctx, func(txCtx context.Context) error {
		insertedID, err := s.salesChannelRepo.Insert(txCtx, req)
		if err != nil {
			return err
		}
		id = insertedID
		return nil
	}); err != nil {
		return 0, err
	}

	_ = eventbus.PublishAuditLog(ctx, s.eventBus, eventbus.AuditLogInput{
		UserID:     userID,
		Action:     "CREATE",
		TargetType: "SALES_CHANNEL",
		TargetID:   strconv.Itoa(id),
		Changes:    req,
		IP:         ip,
		UserAgent:  userAgent,
	})

	return id, nil
}

func (s *salesChannelServiceImpl) UpdateChannel(ctx context.Context, id int, req inventory_dto.UpdateSalesChannelRequest, userID int, ip, userAgent string) error {
	req.Platform = strings.TrimSpace(req.Platform)
	req.Name = strings.TrimSpace(req.Name)
	req.Description = strings.TrimSpace(req.Description)

	if err := domain.ValidateSalesChannelPlatform(req.Platform); err != nil {
		return err
	}
	if req.Name == "" {
		return domain.ErrInvalidSalesChannelPayload
	}

	if err := s.txManager.WithTransaction(ctx, func(txCtx context.Context) error {
		affected, err := s.salesChannelRepo.Update(txCtx, id, req)
		if err != nil {
			if errors.Is(err, sql.ErrNoRows) {
				return domain.ErrSalesChannelNotFound
			}
			return err
		}
		if affected == 0 {
			return domain.ErrSalesChannelNotFound
		}
		return nil
	}); err != nil {
		return err
	}

	_ = eventbus.PublishAuditLog(ctx, s.eventBus, eventbus.AuditLogInput{
		UserID:     userID,
		Action:     "UPDATE",
		TargetType: "SALES_CHANNEL",
		TargetID:   strconv.Itoa(id),
		Changes:    req,
		IP:         ip,
		UserAgent:  userAgent,
	})

	return nil
}

func (s *salesChannelServiceImpl) DeleteChannel(ctx context.Context, id int, userID int, ip, userAgent string) error {
	if err := s.txManager.WithTransaction(ctx, func(txCtx context.Context) error {
		affected, err := s.salesChannelRepo.Delete(txCtx, id)
		if err != nil {
			if errors.Is(err, sql.ErrNoRows) {
				return domain.ErrSalesChannelNotFound
			}
			return err
		}
		if affected == 0 {
			return domain.ErrSalesChannelNotFound
		}
		return nil
	}); err != nil {
		return err
	}

	_ = eventbus.PublishAuditLog(ctx, s.eventBus, eventbus.AuditLogInput{
		UserID:     userID,
		Action:     "DELETE",
		TargetType: "SALES_CHANNEL",
		TargetID:   strconv.Itoa(id),
		Changes:    map[string]any{"note": "Sales Channel Deleted"},
		IP:         ip,
		UserAgent:  userAgent,
	})

	return nil
}
