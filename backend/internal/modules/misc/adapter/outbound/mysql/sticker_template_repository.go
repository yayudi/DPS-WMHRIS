package mysql

import (
	"context"

	misc_dto "github.com/dps-wmhris/backend/internal/modules/misc/application/dto"

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
	db *sqlx.DB
}

func NewStickerTemplateRepository(db *sqlx.DB) StickerTemplateRepository {
	return &stickerTemplateRepositoryImpl{db: db}
}

func (r *stickerTemplateRepositoryImpl) FindAll(ctx context.Context) ([]misc_dto.StickerTemplateResponse, error) {
	query := "SELECT id, name, paper_size, config_json, is_active FROM sticker_templates ORDER BY id DESC"
	var templates []misc_dto.StickerTemplateResponse
	err := r.db.SelectContext(ctx, &templates, query)
	if err != nil {
		return nil, err
	}
	if templates == nil {
		templates = []misc_dto.StickerTemplateResponse{}
	}
	return templates, nil
}

func (r *stickerTemplateRepositoryImpl) FindByID(ctx context.Context, id int) (*misc_dto.StickerTemplateResponse, error) {
	query := "SELECT id, name, paper_size, config_json, is_active FROM sticker_templates WHERE id = ?"
	var template misc_dto.StickerTemplateResponse
	err := r.db.GetContext(ctx, &template, query, id)
	if err != nil {
		return nil, err
	}
	return &template, nil
}

func (r *stickerTemplateRepositoryImpl) Insert(ctx context.Context, req misc_dto.CreateStickerTemplateRequest, configJsonStr *string) (int, error) {
	isActive := true
	if req.IsActive != nil {
		isActive = *req.IsActive
	}

	query := "INSERT INTO sticker_templates (name, paper_size, config_json, is_active) VALUES (?, ?, ?, ?)"
	res, err := r.db.ExecContext(ctx, query, req.Name, req.PaperSize, configJsonStr, isActive)
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

	res, err := r.db.ExecContext(ctx, query, args...)
	if err != nil {
		return 0, err
	}
	affected, err := res.RowsAffected()
	return int(affected), err
}

func (r *stickerTemplateRepositoryImpl) Delete(ctx context.Context, id int) (int, error) {
	query := "DELETE FROM sticker_templates WHERE id = ?"
	res, err := r.db.ExecContext(ctx, query, id)
	if err != nil {
		return 0, err
	}
	affected, err := res.RowsAffected()
	return int(affected), err
}
