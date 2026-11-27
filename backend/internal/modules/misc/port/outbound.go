package port

import (
	"context"

	misc_dto "github.com/dps-wmhris/backend/internal/modules/misc/application/dto"
)

// PaperSizeRepository defines outbound persistence operations for paper sizes.
type PaperSizeRepository interface {
	FindAll(ctx context.Context) ([]misc_dto.PaperSizeResponse, error)
	FindByID(ctx context.Context, id int) (*misc_dto.PaperSizeResponse, error)
	Insert(ctx context.Context, req misc_dto.CreatePaperSizeRequest) (int, error)
	Update(ctx context.Context, id int, req misc_dto.UpdatePaperSizeRequest) (int, error)
	Delete(ctx context.Context, id int) (int, error)
}

// StickerTemplateRepository defines outbound persistence operations for sticker templates.
type StickerTemplateRepository interface {
	FindAll(ctx context.Context) ([]misc_dto.StickerTemplateResponse, error)
	FindByID(ctx context.Context, id int) (*misc_dto.StickerTemplateResponse, error)
	Insert(ctx context.Context, req misc_dto.CreateStickerTemplateRequest, configJSONStr *string) (int, error)
	Update(ctx context.Context, id int, req misc_dto.UpdateStickerTemplateRequest, configJSONStr *string) (int, error)
	Delete(ctx context.Context, id int) (int, error)
}
