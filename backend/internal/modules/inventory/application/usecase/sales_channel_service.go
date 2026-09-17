package usecase

import (
	"github.com/dps-wmhris/backend/internal/shared/database"
	"github.com/dps-wmhris/backend/internal/shared/eventbus"

	"context"
	"encoding/json"
	"strconv"

	inventory_dto "github.com/dps-wmhris/backend/internal/modules/inventory/application/dto"

	inventory_mysql "github.com/dps-wmhris/backend/internal/modules/inventory/adapter/outbound/mysql"

	system_domain "github.com/dps-wmhris/backend/internal/modules/system/domain"
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

	changesBytes, _ := json.Marshal(req)
	changesStr := string(changesBytes)
	_ = s.eventBus.Publish(ctx, eventbus.NewEvent(
		system_domain.EventSystemLog,
		system_domain.SystemLogPayload{
			Action:     "CREATE",
			TargetType: "SALES_CHANNEL",
			TargetID:   strconv.Itoa(id),
			Changes:    &changesStr,
			IP:         &ip,
			UserAgent:  &userAgent,
		},
		userID,
	))

	return id, nil
}

func (s *salesChannelServiceImpl) UpdateChannel(ctx context.Context, id int, req inventory_dto.UpdateSalesChannelRequest, userID int, ip, userAgent string) error {
	_, err := s.salesChannelRepo.Update(ctx, id, req)
	if err != nil {
		return err
	}

	changesBytes, _ := json.Marshal(req)
	changesStr := string(changesBytes)
	_ = s.eventBus.Publish(ctx, eventbus.NewEvent(
		system_domain.EventSystemLog,
		system_domain.SystemLogPayload{
			Action:     "UPDATE",
			TargetType: "SALES_CHANNEL",
			TargetID:   strconv.Itoa(id),
			Changes:    &changesStr,
			IP:         &ip,
			UserAgent:  &userAgent,
		},
		userID,
	))

	return nil
}

func (s *salesChannelServiceImpl) DeleteChannel(ctx context.Context, id int, userID int, ip, userAgent string) error {
	_, err := s.salesChannelRepo.Delete(ctx, id)
	if err != nil {
		return err
	}

	changesStr := `{"note": "Sales Channel Deleted"}`
	_ = s.eventBus.Publish(ctx, eventbus.NewEvent(
		system_domain.EventSystemLog,
		system_domain.SystemLogPayload{
			Action:     "DELETE",
			TargetType: "SALES_CHANNEL",
			TargetID:   strconv.Itoa(id),
			Changes:    &changesStr,
			IP:         &ip,
			UserAgent:  &userAgent,
		},
		userID,
	))

	return nil
}
