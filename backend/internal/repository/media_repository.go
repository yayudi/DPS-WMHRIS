package repository

import (
	"context"
	"encoding/json"
	"strings"

	"github.com/dps-wmhris/backend/internal/dto"
	"github.com/dps-wmhris/backend/internal/utils"
	"github.com/jmoiron/sqlx"
)

type MediaFilter struct {
	Search     string
	LinkStatus map[string][]string // e.g. {"include": ["linked"], "exclude": ["orphaned"]} or string "linked"
	RawStatus  string              // fallback
}

type MediaRepository interface {
	GetMediaAssets(ctx context.Context, page, limit int, filter MediaFilter) (utils.PaginatedResult[dto.MediaAssetResponse], error)
	GetMediaDetailsWithProducts(ctx context.Context, mediaID int) (*dto.MediaAssetResponse, error)
	CreateMediaAsset(ctx context.Context, db sqlx.ExtContext, payload map[string]interface{}) (int, error)
	GetMediaAssetByHash(ctx context.Context, hash string) (*int, error)
	InsertTrashQueue(ctx context.Context, r2Key string) error
	DeleteMediaAsset(ctx context.Context, mediaID int) error
	GetMediaAssetByID(ctx context.Context, mediaID int) (*dto.MediaAssetResponse, error)
	GetMediaAssetsByIDs(ctx context.Context, mediaIDs []int) ([]dto.MediaAssetResponse, error)
	UpdateMediaTags(ctx context.Context, mediaID int, tags []string) error
	UpdateMediaTitle(ctx context.Context, mediaID int, title string) error
}

type mediaRepositoryImpl struct {
	db *sqlx.DB
}

func NewMediaRepository(db *sqlx.DB) MediaRepository {
	return &mediaRepositoryImpl{db: db}
}

func buildFilterClause(filter MediaFilter) (string, []interface{}) {
	var conditions []string
	var params []interface{}

	if filter.Search != "" {
		keyword := "%" + filter.Search + "%"
		conditions = append(conditions, `(
			m.title LIKE ?
			OR m.tags LIKE ?
			OR EXISTS (
				SELECT 1 FROM product_images pi
				JOIN products prod ON pi.product_id = prod.id
				WHERE pi.media_id = m.id AND (prod.name LIKE ? OR prod.sku LIKE ?)
			)
		)`)
		params = append(params, keyword, keyword, keyword, keyword)
	}

	if filter.RawStatus != "" {
		if filter.RawStatus == "linked" {
			conditions = append(conditions, `EXISTS (SELECT 1 FROM product_images pi WHERE pi.media_id = m.id)`)
		} else if filter.RawStatus == "orphaned" {
			conditions = append(conditions, `NOT EXISTS (SELECT 1 FROM product_images pi WHERE pi.media_id = m.id)`)
		}
	} else if len(filter.LinkStatus) > 0 {
		inc := filter.LinkStatus["include"]
		exc := filter.LinkStatus["exclude"]

		contains := func(slice []string, val string) bool {
			for _, item := range slice {
				if item == val {
					return true
				}
			}
			return false
		}

		if len(inc) > 0 {
			if contains(inc, "linked") && !contains(inc, "orphaned") {
				conditions = append(conditions, `EXISTS (SELECT 1 FROM product_images pi WHERE pi.media_id = m.id)`)
			} else if contains(inc, "orphaned") && !contains(inc, "linked") {
				conditions = append(conditions, `NOT EXISTS (SELECT 1 FROM product_images pi WHERE pi.media_id = m.id)`)
			}
		} else if len(exc) > 0 {
			if contains(exc, "linked") && !contains(exc, "orphaned") {
				conditions = append(conditions, `NOT EXISTS (SELECT 1 FROM product_images pi WHERE pi.media_id = m.id)`)
			} else if contains(exc, "orphaned") && !contains(exc, "linked") {
				conditions = append(conditions, `EXISTS (SELECT 1 FROM product_images pi WHERE pi.media_id = m.id)`)
			}
		}
	}

	clause := ""
	if len(conditions) > 0 {
		clause = " WHERE " + strings.Join(conditions, " AND ")
	}
	return clause, params
}

func (r *mediaRepositoryImpl) GetMediaAssets(ctx context.Context, page, limit int, filter MediaFilter) (utils.PaginatedResult[dto.MediaAssetResponse], error) {
	clause, params := buildFilterClause(filter)

	query := `
		SELECT m.*,
			(SELECT COUNT(p.id) FROM product_images p WHERE p.media_id = m.id) AS usage_count,
			(SELECT GROUP_CONCAT(prod.name SEPARATOR '||') FROM product_images p JOIN products prod ON p.product_id = prod.id WHERE p.media_id = m.id) AS linked_products
		FROM media_assets m
		` + clause + `
		ORDER BY m.created_at DESC
	`

	return utils.FetchPaginated[dto.MediaAssetResponse](ctx, r.db, query, page, limit, params...)
}

func (r *mediaRepositoryImpl) GetMediaDetailsWithProducts(ctx context.Context, mediaID int) (*dto.MediaAssetResponse, error) {
	var media dto.MediaAssetResponse
	err := r.db.GetContext(ctx, &media, "SELECT * FROM media_assets WHERE id = ?", mediaID)
	if err != nil {
		return nil, err
	}

	type ProductItem struct {
		ID        int    `json:"id" db:"id"`
		SKU       string `json:"sku" db:"sku"`
		Name      string `json:"name" db:"name"`
		IsActive  bool   `json:"is_active" db:"is_active"`
		PivotID   int    `json:"pivot_id" db:"pivot_id"`
		IsPrimary bool   `json:"is_primary" db:"is_primary"`
	}

	var products []ProductItem
	query := `
		SELECT p.id, p.sku, p.name, p.is_active, pi.id as pivot_id, pi.is_primary
		FROM product_images pi
		JOIN products p ON pi.product_id = p.id
		WHERE pi.media_id = ?
		ORDER BY pi.id DESC
	`
	err = r.db.SelectContext(ctx, &products, query, mediaID)
	if err == nil {
		if products == nil {
			products = []ProductItem{}
		}
		media.Products = products
	}

	return &media, nil
}

func (r *mediaRepositoryImpl) CreateMediaAsset(ctx context.Context, db sqlx.ExtContext, payload map[string]interface{}) (int, error) {
	var tagsStr *string
	if tags, ok := payload["tags"].([]string); ok && len(tags) > 0 {
		bytes, _ := json.Marshal(tags)
		s := string(bytes)
		tagsStr = &s
	}

	query := `
		INSERT INTO media_assets (
			title, main_path, thumbnail_path, status, uploader_id, tags, hash, duplicate_of,
			size_bytes, width, height
		)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`
	res, err := db.ExecContext(ctx, query,
		payload["title"], payload["mainPath"], payload["thumbnailPath"], payload["status"],
		payload["uploaderId"], tagsStr, payload["hash"], payload["duplicateOf"],
		payload["sizeBytes"], payload["width"], payload["height"],
	)
	if err != nil {
		return 0, err
	}
	id, err := res.LastInsertId()
	return int(id), err
}

func (r *mediaRepositoryImpl) GetMediaAssetByHash(ctx context.Context, hash string) (*int, error) {
	var id int
	err := r.db.GetContext(ctx, &id, "SELECT id FROM media_assets WHERE hash = ?", hash)
	if err != nil {
		return nil, nil // Return nil, nil if not found (or error)
	}
	return &id, nil
}

func (r *mediaRepositoryImpl) InsertTrashQueue(ctx context.Context, r2Key string) error {
	if r2Key == "" {
		return nil
	}
	_, err := r.db.ExecContext(ctx, "INSERT INTO r2_trash_queue (r2_key) VALUES (?)", r2Key)
	return err
}

func (r *mediaRepositoryImpl) DeleteMediaAsset(ctx context.Context, mediaID int) error {
	_, err := r.db.ExecContext(ctx, "DELETE FROM media_assets WHERE id = ?", mediaID)
	return err
}

func (r *mediaRepositoryImpl) GetMediaAssetByID(ctx context.Context, mediaID int) (*dto.MediaAssetResponse, error) {
	var media dto.MediaAssetResponse
	err := r.db.GetContext(ctx, &media, "SELECT * FROM media_assets WHERE id = ?", mediaID)
	if err != nil {
		return nil, err
	}
	return &media, nil
}

func (r *mediaRepositoryImpl) GetMediaAssetsByIDs(ctx context.Context, mediaIDs []int) ([]dto.MediaAssetResponse, error) {
	if len(mediaIDs) == 0 {
		return []dto.MediaAssetResponse{}, nil
	}
	query, args, err := sqlx.In("SELECT id, status, main_path, thumbnail_path FROM media_assets WHERE id IN (?)", mediaIDs)
	if err != nil {
		return nil, err
	}
	query = r.db.Rebind(query)
	var rows []dto.MediaAssetResponse
	err = r.db.SelectContext(ctx, &rows, query, args...)
	if err != nil {
		return nil, err
	}
	if rows == nil {
		rows = []dto.MediaAssetResponse{}
	}
	return rows, nil
}

func (r *mediaRepositoryImpl) UpdateMediaTags(ctx context.Context, mediaID int, tags []string) error {
	var tagsStr *string
	if len(tags) > 0 {
		for i := range tags {
			tags[i] = strings.ToLower(tags[i])
		}
		bytes, _ := json.Marshal(tags)
		s := string(bytes)
		tagsStr = &s
	}

	_, err := r.db.ExecContext(ctx, "UPDATE media_assets SET tags = ? WHERE id = ?", tagsStr, mediaID)
	return err
}

func (r *mediaRepositoryImpl) UpdateMediaTitle(ctx context.Context, mediaID int, title string) error {
	_, err := r.db.ExecContext(ctx, "UPDATE media_assets SET title = ? WHERE id = ?", title, mediaID)
	return err
}
