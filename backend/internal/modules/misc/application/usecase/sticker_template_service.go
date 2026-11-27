package usecase

import (
	"context"
	"database/sql"
	"errors"
	"strconv"
	"strings"

	misc_dto "github.com/dps-wmhris/backend/internal/modules/misc/application/dto"
	"github.com/dps-wmhris/backend/internal/modules/misc/domain"
	"github.com/dps-wmhris/backend/internal/modules/misc/port"
	"github.com/dps-wmhris/backend/internal/shared/database"
	"github.com/dps-wmhris/backend/internal/shared/eventbus"
)

// StickerTemplateService aliases the hexagonal inbound port for backward compatibility.
type StickerTemplateService = port.StickerTemplateUseCase

type stickerTemplateServiceImpl struct {
	txManager           database.TransactionManager
	stickerTemplateRepo port.StickerTemplateRepository
	eventBus            eventbus.EventBus
}

// NewStickerTemplateService constructs a StickerTemplateUseCase backed by TransactionManager, repository, and EventBus.
func NewStickerTemplateService(txManager database.TransactionManager, stickerTemplateRepo port.StickerTemplateRepository, eventBus eventbus.EventBus) port.StickerTemplateUseCase {
	return &stickerTemplateServiceImpl{txManager: txManager, stickerTemplateRepo: stickerTemplateRepo, eventBus: eventBus}
}

func (s *stickerTemplateServiceImpl) GetAllStickerTemplates(ctx context.Context) ([]misc_dto.StickerTemplateResponse, error) {
	return s.stickerTemplateRepo.FindAll(ctx)
}

func (s *stickerTemplateServiceImpl) GetStickerTemplateByID(ctx context.Context, id int) (*misc_dto.StickerTemplateResponse, error) {
	res, err := s.stickerTemplateRepo.FindByID(ctx, id)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, domain.ErrStickerTemplateNotFound
		}
		return nil, err
	}
	return res, nil
}

func (s *stickerTemplateServiceImpl) CreateStickerTemplate(ctx context.Context, req misc_dto.CreateStickerTemplateRequest, userID int, ip, userAgent string) (int, error) {
	req.Name = strings.TrimSpace(req.Name)
	configJSONStr, err := domain.NormalizeConfigJSON(req.ConfigJSON)
	if err != nil {
		return 0, err
	}

	var id int
	err = s.txManager.WithTransaction(ctx, func(txCtx context.Context) error {
		var txErr error
		id, txErr = s.stickerTemplateRepo.Insert(txCtx, req, configJSONStr)
		return txErr
	})
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
	req.Name = strings.TrimSpace(req.Name)
	configJSONStr, err := domain.NormalizeConfigJSON(req.ConfigJSON)
	if err != nil {
		return err
	}

	err = s.txManager.WithTransaction(ctx, func(txCtx context.Context) error {
		affected, txErr := s.stickerTemplateRepo.Update(txCtx, id, req, configJSONStr)
		if txErr != nil {
			return txErr
		}
		if affected == 0 {
			if _, findErr := s.stickerTemplateRepo.FindByID(txCtx, id); findErr != nil {
				if errors.Is(findErr, sql.ErrNoRows) {
					return domain.ErrStickerTemplateNotFound
				}
				return findErr
			}
		}
		return nil
	})
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
	err := s.txManager.WithTransaction(ctx, func(txCtx context.Context) error {
		affected, txErr := s.stickerTemplateRepo.Delete(txCtx, id)
		if txErr != nil {
			return txErr
		}
		if affected == 0 {
			return domain.ErrStickerTemplateNotFound
		}
		return nil
	})
	if err != nil {
		return err
	}

	_ = eventbus.PublishAuditLog(ctx, s.eventBus, eventbus.AuditLogInput{
		UserID:     userID,
		Action:     "DELETE",
		TargetType: "STICKER_TEMPLATE",
		TargetID:   strconv.Itoa(id),
		Changes:    map[string]any{"note": "Sticker Template Deleted"},
		IP:         ip,
		UserAgent:  userAgent,
	})

	return nil
}
