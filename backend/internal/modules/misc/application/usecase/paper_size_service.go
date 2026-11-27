// Package usecase implements application use cases for the misc module.
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

// PaperSizeService aliases the hexagonal inbound port for backward compatibility.
type PaperSizeService = port.PaperSizeUseCase

type paperSizeServiceImpl struct {
	txManager     database.TransactionManager
	paperSizeRepo port.PaperSizeRepository
	eventBus      eventbus.EventBus
}

// NewPaperSizeService constructs a PaperSizeUseCase backed by TransactionManager, repository, and EventBus.
func NewPaperSizeService(txManager database.TransactionManager, paperSizeRepo port.PaperSizeRepository, eventBus eventbus.EventBus) port.PaperSizeUseCase {
	return &paperSizeServiceImpl{txManager: txManager, paperSizeRepo: paperSizeRepo, eventBus: eventBus}
}

func (s *paperSizeServiceImpl) GetAllPaperSizes(ctx context.Context) ([]misc_dto.PaperSizeResponse, error) {
	return s.paperSizeRepo.FindAll(ctx)
}

func (s *paperSizeServiceImpl) GetPaperSizeByID(ctx context.Context, id int) (*misc_dto.PaperSizeResponse, error) {
	res, err := s.paperSizeRepo.FindByID(ctx, id)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, domain.ErrPaperSizeNotFound
		}
		return nil, err
	}
	return res, nil
}

func (s *paperSizeServiceImpl) CreatePaperSize(ctx context.Context, req misc_dto.CreatePaperSizeRequest, userID int, ip, userAgent string) (int, error) {
	req.Name = strings.TrimSpace(req.Name)
	if req.NumberAcross <= 0 {
		req.NumberAcross = 1
	}
	if req.NumberDown <= 0 {
		req.NumberDown = 1
	}

	var id int
	err := s.txManager.WithTransaction(ctx, func(txCtx context.Context) error {
		var txErr error
		id, txErr = s.paperSizeRepo.Insert(txCtx, req)
		return txErr
	})
	if err != nil {
		return 0, err
	}

	_ = eventbus.PublishAuditLog(ctx, s.eventBus, eventbus.AuditLogInput{
		UserID:     userID,
		Action:     "CREATE",
		TargetType: "PAPER_SIZE",
		TargetID:   strconv.Itoa(id),
		Changes:    req,
		IP:         ip,
		UserAgent:  userAgent,
	})

	return id, nil
}

func (s *paperSizeServiceImpl) UpdatePaperSize(ctx context.Context, id int, req misc_dto.UpdatePaperSizeRequest, userID int, ip, userAgent string) error {
	req.Name = strings.TrimSpace(req.Name)
	if req.NumberAcross <= 0 {
		req.NumberAcross = 1
	}
	if req.NumberDown <= 0 {
		req.NumberDown = 1
	}

	err := s.txManager.WithTransaction(ctx, func(txCtx context.Context) error {
		affected, txErr := s.paperSizeRepo.Update(txCtx, id, req)
		if txErr != nil {
			return txErr
		}
		if affected == 0 {
			if _, findErr := s.paperSizeRepo.FindByID(txCtx, id); findErr != nil {
				if errors.Is(findErr, sql.ErrNoRows) {
					return domain.ErrPaperSizeNotFound
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
		TargetType: "PAPER_SIZE",
		TargetID:   strconv.Itoa(id),
		Changes:    req,
		IP:         ip,
		UserAgent:  userAgent,
	})

	return nil
}

func (s *paperSizeServiceImpl) DeletePaperSize(ctx context.Context, id int, userID int, ip, userAgent string) error {
	err := s.txManager.WithTransaction(ctx, func(txCtx context.Context) error {
		affected, txErr := s.paperSizeRepo.Delete(txCtx, id)
		if txErr != nil {
			return txErr
		}
		if affected == 0 {
			return domain.ErrPaperSizeNotFound
		}
		return nil
	})
	if err != nil {
		return err
	}

	_ = eventbus.PublishAuditLog(ctx, s.eventBus, eventbus.AuditLogInput{
		UserID:     userID,
		Action:     "DELETE",
		TargetType: "PAPER_SIZE",
		TargetID:   strconv.Itoa(id),
		Changes:    map[string]any{"note": "Paper Size Deleted"},
		IP:         ip,
		UserAgent:  userAgent,
	})

	return nil
}
