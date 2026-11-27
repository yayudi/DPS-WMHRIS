package port

import (
	"context"

	system_dto "github.com/dps-wmhris/backend/internal/modules/system/application/dto"
	"github.com/dps-wmhris/backend/internal/shared/utils"
	"github.com/xuri/excelize/v2"
)

// MediaRepository defines outbound persistence operations for media assets and R2 trash queue entries.
type MediaRepository interface {
	GetMediaAssets(ctx context.Context, page, limit int, filter system_dto.MediaFilter) (utils.PaginatedResult[system_dto.MediaAssetResponse], error)
	GetMediaDetailsWithProducts(ctx context.Context, mediaID int) (*system_dto.MediaAssetResponse, error)
	CreateMediaAsset(ctx context.Context, payload map[string]any) (int, error)
	GetMediaAssetByHash(ctx context.Context, hash string) (*int, error)
	InsertTrashQueue(ctx context.Context, r2Key string) error
	DeleteMediaAsset(ctx context.Context, mediaID int) error
	GetMediaAssetByID(ctx context.Context, mediaID int) (*system_dto.MediaAssetResponse, error)
	GetMediaAssetsByIDs(ctx context.Context, mediaIDs []int) ([]system_dto.MediaAssetResponse, error)
	UpdateMediaTags(ctx context.Context, mediaID int, tags []string) error
	UpdateMediaTitle(ctx context.Context, mediaID int, title string) error
	FindMediaIDByPathLike(ctx context.Context, searchPath string) (*int, error)
}

// MediaService defines inbound application operations for media asset management and bulk linking.
type MediaService interface {
	SaveMediaMetadata(ctx context.Context, asset system_dto.ConfirmUploadAsset, userID int) (int, error)
	SaveMediaBatch(ctx context.Context, assets []system_dto.ConfirmUploadAsset, products any, userID int) ([]map[string]any, error)
	DeleteMediaAndQueueTrash(ctx context.Context, mediaID int) error
	GetMediaAssets(ctx context.Context, page, limit int, filter system_dto.MediaFilter) (utils.PaginatedResult[system_dto.MediaAssetResponse], error)
	GetMediaDetailsWithProducts(ctx context.Context, mediaID int) (*system_dto.MediaAssetResponse, error)
	GetMediaAssetsByIDs(ctx context.Context, mediaIDs []int) ([]system_dto.MediaAssetResponse, error)
	DeleteMediaAsset(ctx context.Context, mediaID int) (mainPath string, thumbPath string, err error)
	InsertTrashQueue(ctx context.Context, r2Key string) error
	UpdateMediaTags(ctx context.Context, mediaID int, tags []string) error
	UpdateMediaTitle(ctx context.Context, mediaID int, title string) error
	ProcessMediaLinkImport(ctx context.Context, filePath string, userID int) (string, error)
	GenerateBulkLinkTemplate() *excelize.File
}
