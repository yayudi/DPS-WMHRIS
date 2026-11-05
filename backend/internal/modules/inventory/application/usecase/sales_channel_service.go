package usecase

import (
	"context"
	"strconv"

	inventory_mysql "github.com/dps-wmhris/backend/internal/modules/inventory/adapter/outbound/mysql"
	inventory_dto "github.com/dps-wmhris/backend/internal/modules/inventory/application/dto"
	"github.com/dps-wmhris/backend/internal/shared/database"
	"github.com/dps-wmhris/backend/internal/shared/eventbus"
)

type SalesChannelService interface {
	GetAllChannels(ctx context.Context, activeOnly bool) ([]inventory_dto.SalesChannelResponse, error)
	GetChannelByID(ctx context.Context, id int) (*inventory_dto.SalesChannelResponse, error)
	CreateChannel(ctx context.Context, req inventory_dto.CreateSalesChannelRequest, userID int, ip, userAgent string) (int, error)
	UpdateChannel(ctx context.Context, id int, req inventory_dto.UpdateSalesChannelRequest, userID int, ip, userAgent string) error
	DeleteChannel(ctx context.Context, id int, userID int, ip, userAgent string) error
}

type salesChannelServiceImpl struct {
	txManager        database.TransactionManager
	salesChannelRepo inventory_mysql.SalesChannelRepository
	eventBus         eventbus.EventBus
}

func NewSalesChannelService(txManager database.TransactionManager, salesChannelRepo inventory_mysql.SalesChannelRepository, eventBus eventbus.EventBus) SalesChannelService {
	return &salesChannelServiceImpl{txManager: txManager, salesChannelRepo: salesChannelRepo, eventBus: eventBus}
}

func (s *salesChannelServiceImpl) GetAllChannels(ctx context.Context, activeOnly bool) ([]inventory_dto.SalesChannelResponse, error) {
	return s.salesChannelRepo.FindAll(ctx, activeOnly)
}

func (s *salesChannelServiceImpl) GetChannelByID(ctx context.Context, id int) (*inventory_dto.SalesChannelResponse, error) {
	return s.salesChannelRepo.FindByID(ctx, id)
}

func (s *salesChannelServiceImpl) CreateChannel(ctx context.Context, req inventory_dto.CreateSalesChannelRequest, userID int, ip, userAgent string) (int, error) {
	id, err := s.salesChannelRepo.Insert(ctx, req)
	if err != nil {
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
	_, err := s.salesChannelRepo.Update(ctx, id, req)
	if err != nil {
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
	_, err := s.salesChannelRepo.Delete(ctx, id)
	if err != nil {
		return err
	}

	_ = eventbus.PublishAuditLog(ctx, s.eventBus, eventbus.AuditLogInput{
		UserID:     userID,
		Action:     "DELETE",
		TargetType: "SALES_CHANNEL",
		TargetID:   strconv.Itoa(id),
		Changes:    `{"note": "Sales Channel Deleted"}`,
		IP:         ip,
		UserAgent:  userAgent,
	})

	return nil
}
