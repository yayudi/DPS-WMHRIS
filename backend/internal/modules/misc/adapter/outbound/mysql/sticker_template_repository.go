package mysql

import (
	"context"

	misc_dto "github.com/dps-wmhris/backend/internal/modules/misc/application/dto"
	"github.com/dps-wmhris/backend/internal/shared/database"
	"github.com/jmoiron/sqlx"
)

type StickerTemplateRepository interface {
	FindAll(ctx context.Context) ([]misc_dto.StickerTemplateResponse, error)
	FindByID(ctx context.Context, id int) (*misc_dto.StickerTemplateResponse, error)
	Insert(ctx context.Context, req misc_dto.CreateStickerTemplateRequest, configJsonStr *string) (int, error)
	Update(ctx context.Context, id int, req misc_dto.UpdateStickerTemplateRequest, configJsonStr *string) (int, error)
	Delete(ctx context.Context, id int) (int, error)
}

type stickerTemplateRepositoryImpl struct {
	database.BaseRepository[misc_dto.StickerTemplateResponse]
	db *sqlx.DB
}

func NewStickerTemplateRepository(db *sqlx.DB) StickerTemplateRepository {
	base := database.NewBaseRepository[misc_dto.StickerTemplateResponse](db, "sticker_templates")
	return &stickerTemplateRepositoryImpl{
		BaseRepository: base,
		db:             db,
	}
}

func (r *stickerTemplateRepositoryImpl) FindAll(ctx context.Context) ([]misc_dto.StickerTemplateResponse, error) {
	return r.BaseRepository.FindAll(ctx)
}

func (r *stickerTemplateRepositoryImpl) FindByID(ctx context.Context, id int) (*misc_dto.StickerTemplateResponse, error) {
	return r.BaseRepository.FindByID(ctx, id)
}

func (r *stickerTemplateRepositoryImpl) Insert(ctx context.Context, req misc_dto.CreateStickerTemplateRequest, configJsonStr *string) (int, error) {
	isActive := true
	if req.IsActive != nil {
		isActive = *req.IsActive
	}

	query := "INSERT INTO sticker_templates (name, paper_size, config_json, is_active) VALUES (?, ?, ?, ?)"
	ext := database.GetExt(ctx, r.db)
	res, err := ext.ExecContext(ctx, query, req.Name, req.PaperSize, configJsonStr, isActive)
	if err != nil {
		return 0, err
	}
	id, err := res.LastInsertId()
	return int(id), err
}

func (r *stickerTemplateRepositoryImpl) Update(ctx context.Context, id int, req misc_dto.UpdateStickerTemplateRequest, configJsonStr *string) (int, error) {
	query := "UPDATE sticker_templates SET name = ?, paper_size = ?, config_json = ?"
	args := []interface{}{req.Name, req.PaperSize, configJsonStr}

	if req.IsActive != nil {
		query += ", is_active = ?"
		args = append(args, *req.IsActive)
	}

	query += " WHERE id = ?"
	args = append(args, id)

	ext := database.GetExt(ctx, r.db)
	res, err := ext.ExecContext(ctx, query, args...)
	if err != nil {
		return 0, err
	}
	affected, err := res.RowsAffected()
	return int(affected), err
}

func (r *stickerTemplateRepositoryImpl) Delete(ctx context.Context, id int) (int, error) {
	query := "DELETE FROM sticker_templates WHERE id = ?"
	ext := database.GetExt(ctx, r.db)
	res, err := ext.ExecContext(ctx, query, id)
	if err != nil {
		return 0, err
	}
	affected, err := res.RowsAffected()
	return int(affected), err
}
