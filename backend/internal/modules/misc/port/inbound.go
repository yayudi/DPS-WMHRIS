// Package port defines the inbound and outbound hexagonal ports for the misc module.
package port

import (
	"context"

	misc_dto "github.com/dps-wmhris/backend/internal/modules/misc/application/dto"
)

// PaperSizeUseCase defines inbound application operations for managing paper size presets.
type PaperSizeUseCase interface {
	GetAllPaperSizes(ctx context.Context) ([]misc_dto.PaperSizeResponse, error)
	GetPaperSizeByID(ctx context.Context, id int) (*misc_dto.PaperSizeResponse, error)
	CreatePaperSize(ctx context.Context, req misc_dto.CreatePaperSizeRequest, userID int, ip, userAgent string) (int, error)
	UpdatePaperSize(ctx context.Context, id int, req misc_dto.UpdatePaperSizeRequest, userID int, ip, userAgent string) error
	DeletePaperSize(ctx context.Context, id int, userID int, ip, userAgent string) error
}

// StickerTemplateUseCase defines inbound application operations for managing sticker templates.
type StickerTemplateUseCase interface {
	GetAllStickerTemplates(ctx context.Context) ([]misc_dto.StickerTemplateResponse, error)
	GetStickerTemplateByID(ctx context.Context, id int) (*misc_dto.StickerTemplateResponse, error)
	CreateStickerTemplate(ctx context.Context, req misc_dto.CreateStickerTemplateRequest, userID int, ip, userAgent string) (int, error)
	UpdateStickerTemplate(ctx context.Context, id int, req misc_dto.UpdateStickerTemplateRequest, userID int, ip, userAgent string) error
	DeleteStickerTemplate(ctx context.Context, id int, userID int, ip, userAgent string) error
}
