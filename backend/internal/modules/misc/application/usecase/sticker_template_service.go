package usecase

import (
	"context"
	"encoding/json"
	"strconv"

	misc_mysql "github.com/dps-wmhris/backend/internal/modules/misc/adapter/outbound/mysql"
	misc_dto "github.com/dps-wmhris/backend/internal/modules/misc/application/dto"
	"github.com/dps-wmhris/backend/internal/shared/database"
	"github.com/dps-wmhris/backend/internal/shared/eventbus"
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

	_ = eventbus.PublishAuditLog(ctx, s.eventBus, eventbus.AuditLogInput{
		UserID:     userID,
		Action:     "CREATE",
		TargetType: "STICKER_TEMPLATE",
		TargetID:   strconv.Itoa(id),
		Changes:    req,
		IP:         ip,
		UserAgent:  userAgent,
	})

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

	_ = eventbus.PublishAuditLog(ctx, s.eventBus, eventbus.AuditLogInput{
		UserID:     userID,
		Action:     "UPDATE",
		TargetType: "STICKER_TEMPLATE",
		TargetID:   strconv.Itoa(id),
		Changes:    req,
		IP:         ip,
		UserAgent:  userAgent,
	})

	return nil
}

func (s *stickerTemplateServiceImpl) DeleteStickerTemplate(ctx context.Context, id int, userID int, ip, userAgent string) error {
	_, err := s.stickerTemplateRepo.Delete(ctx, id)
	if err != nil {
		return err
	}

	_ = eventbus.PublishAuditLog(ctx, s.eventBus, eventbus.AuditLogInput{
		UserID:     userID,
		Action:     "DELETE",
		TargetType: "STICKER_TEMPLATE",
		TargetID:   strconv.Itoa(id),
		Changes:    `{"note": "Sticker Template Deleted"}`,
		IP:         ip,
		UserAgent:  userAgent,
	})

	return nil
}
