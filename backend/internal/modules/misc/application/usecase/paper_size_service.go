package usecase

import (
	"context"
	"strconv"

	misc_mysql "github.com/dps-wmhris/backend/internal/modules/misc/adapter/outbound/mysql"
	misc_dto "github.com/dps-wmhris/backend/internal/modules/misc/application/dto"
	"github.com/dps-wmhris/backend/internal/shared/database"
	"github.com/dps-wmhris/backend/internal/shared/eventbus"
)

type PaperSizeService interface {
	GetAllPaperSizes(ctx context.Context) ([]misc_dto.PaperSizeResponse, error)
	GetPaperSizeByID(ctx context.Context, id int) (*misc_dto.PaperSizeResponse, error)
	CreatePaperSize(ctx context.Context, req misc_dto.CreatePaperSizeRequest, userID int, ip, userAgent string) (int, error)
	UpdatePaperSize(ctx context.Context, id int, req misc_dto.UpdatePaperSizeRequest, userID int, ip, userAgent string) error
	DeletePaperSize(ctx context.Context, id int, userID int, ip, userAgent string) error
}

type paperSizeServiceImpl struct {
	txManager     database.TransactionManager
	paperSizeRepo misc_mysql.PaperSizeRepository
	eventBus      eventbus.EventBus
}

func NewPaperSizeService(txManager database.TransactionManager, paperSizeRepo misc_mysql.PaperSizeRepository, eventBus eventbus.EventBus) PaperSizeService {
	return &paperSizeServiceImpl{txManager: txManager, paperSizeRepo: paperSizeRepo, eventBus: eventBus}
}

func (s *paperSizeServiceImpl) GetAllPaperSizes(ctx context.Context) ([]misc_dto.PaperSizeResponse, error) {
	return s.paperSizeRepo.FindAll(ctx)
}

func (s *paperSizeServiceImpl) GetPaperSizeByID(ctx context.Context, id int) (*misc_dto.PaperSizeResponse, error) {
	return s.paperSizeRepo.FindByID(ctx, id)
}

func (s *paperSizeServiceImpl) CreatePaperSize(ctx context.Context, req misc_dto.CreatePaperSizeRequest, userID int, ip, userAgent string) (int, error) {
	id, err := s.paperSizeRepo.Insert(ctx, req)
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
	_, err := s.paperSizeRepo.Update(ctx, id, req)
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
	_, err := s.paperSizeRepo.Delete(ctx, id)
	if err != nil {
		return err
	}

	_ = eventbus.PublishAuditLog(ctx, s.eventBus, eventbus.AuditLogInput{
		UserID:     userID,
		Action:     "DELETE",
		TargetType: "PAPER_SIZE",
		TargetID:   strconv.Itoa(id),
		Changes:    `{"note": "Paper Size Deleted"}`,
		IP:         ip,
		UserAgent:  userAgent,
	})

	return nil
}
