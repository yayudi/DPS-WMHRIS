package usecase

import (
	"github.com/dps-wmhris/backend/internal/shared/database"
	"github.com/dps-wmhris/backend/internal/shared/eventbus"

	"context"
	"encoding/json"
	"strconv"

	misc_dto "github.com/dps-wmhris/backend/internal/modules/misc/application/dto"

	misc_mysql "github.com/dps-wmhris/backend/internal/modules/misc/adapter/outbound/mysql"

	system_domain "github.com/dps-wmhris/backend/internal/modules/system/domain"
)

type StickerTemplateService interface {
	GetAllStickerTemplates(ctx context.Context) ([]misc_dto.StickerTemplateResponse, error)
	GetStickerTemplateByID(ctx context.Context, id int) (*misc_dto.StickerTemplateResponse, error)
	CreateStickerTemplate(ctx context.Context, req misc_dto.CreateStickerTemplateRequest, userID int, ip, userAgent string) (int, error)
	UpdateStickerTemplate(ctx context.Context, id int, req misc_dto.UpdateStickerTemplateRequest, userID int, ip, userAgent string) error
	DeleteStickerTemplate(ctx context.Context, id int, userID int, ip, userAgent string) error
}

type stickerTemplateServiceImpl struct {
	txManager           database.TransactionManager
	stickerTemplateRepo misc_mysql.StickerTemplateRepository
	eventBus            eventbus.EventBus
}

func NewStickerTemplateService(txManager database.TransactionManager, stickerTemplateRepo misc_mysql.StickerTemplateRepository, eventBus eventbus.EventBus) StickerTemplateService {
	return &stickerTemplateServiceImpl{txManager: txManager, stickerTemplateRepo: stickerTemplateRepo, eventBus: eventBus}
}

func (s *stickerTemplateServiceImpl) GetAllStickerTemplates(ctx context.Context) ([]misc_dto.StickerTemplateResponse, error) {
	return s.stickerTemplateRepo.FindAll(ctx)
}

func (s *stickerTemplateServiceImpl) GetStickerTemplateByID(ctx context.Context, id int) (*misc_dto.StickerTemplateResponse, error) {
	return s.stickerTemplateRepo.FindByID(ctx, id)
}

func (s *stickerTemplateServiceImpl) CreateStickerTemplate(ctx context.Context, req misc_dto.CreateStickerTemplateRequest, userID int, ip, userAgent string) (int, error) {
	var configJsonStr *string
	if req.ConfigJSON != nil {
		bytes, _ := json.Marshal(req.ConfigJSON)
		str := string(bytes)
		configJsonStr = &str
	}

	id, err := s.stickerTemplateRepo.Insert(ctx, req, configJsonStr)
	if err != nil {
		return 0, err
	}

	changesBytes, _ := json.Marshal(req)
	changesStr := string(changesBytes)
	_ = s.eventBus.Publish(ctx, eventbus.NewEvent(
		system_domain.EventSystemLog,
		system_domain.SystemLogPayload{
			Action:     "CREATE",
			TargetType: "STICKER_TEMPLATE",
			TargetID:   strconv.Itoa(id),
			Changes:    &changesStr,
			IP:         &ip,
			UserAgent:  &userAgent,
		},
		userID,
	))

	return id, nil
}

func (s *stickerTemplateServiceImpl) UpdateStickerTemplate(ctx context.Context, id int, req misc_dto.UpdateStickerTemplateRequest, userID int, ip, userAgent string) error {
	var configJsonStr *string
	if req.ConfigJSON != nil {
		bytes, _ := json.Marshal(req.ConfigJSON)
		str := string(bytes)
		configJsonStr = &str
	}

	_, err := s.stickerTemplateRepo.Update(ctx, id, req, configJsonStr)
	if err != nil {
		return err
	}

	changesBytes, _ := json.Marshal(req)
	changesStr := string(changesBytes)
	_ = s.eventBus.Publish(ctx, eventbus.NewEvent(
		system_domain.EventSystemLog,
		system_domain.SystemLogPayload{
			Action:     "UPDATE",
			TargetType: "STICKER_TEMPLATE",
			TargetID:   strconv.Itoa(id),
			Changes:    &changesStr,
			IP:         &ip,
			UserAgent:  &userAgent,
		},
		userID,
	))

	return nil
}

func (s *stickerTemplateServiceImpl) DeleteStickerTemplate(ctx context.Context, id int, userID int, ip, userAgent string) error {
	_, err := s.stickerTemplateRepo.Delete(ctx, id)
	if err != nil {
		return err
	}

	changesStr := `{"note": "Sticker Template Deleted"}`
	_ = s.eventBus.Publish(ctx, eventbus.NewEvent(
		system_domain.EventSystemLog,
		system_domain.SystemLogPayload{
			Action:     "DELETE",
			TargetType: "STICKER_TEMPLATE",
			TargetID:   strconv.Itoa(id),
			Changes:    &changesStr,
			IP:         &ip,
			UserAgent:  &userAgent,
		},
		userID,
	))

	return nil
}
