package mysql

import (
	"context"

	misc_dto "github.com/dps-wmhris/backend/internal/modules/misc/application/dto"
	"github.com/dps-wmhris/backend/internal/shared/database"
	"github.com/jmoiron/sqlx"
)

type PaperSizeRepository interface {
	FindAll(ctx context.Context) ([]misc_dto.PaperSizeResponse, error)
	FindByID(ctx context.Context, id int) (*misc_dto.PaperSizeResponse, error)
	Insert(ctx context.Context, req misc_dto.CreatePaperSizeRequest) (int, error)
	Update(ctx context.Context, id int, req misc_dto.UpdatePaperSizeRequest) (int, error)
	Delete(ctx context.Context, id int) (int, error)
}

type paperSizeRepositoryImpl struct {
	database.BaseRepository[misc_dto.PaperSizeResponse]
	db *sqlx.DB
}

func NewPaperSizeRepository(db *sqlx.DB) PaperSizeRepository {
	base := database.NewBaseRepository[misc_dto.PaperSizeResponse](db, "paper_sizes")
	return &paperSizeRepositoryImpl{
		BaseRepository: base,
		db:             db,
	}
}

func (r *paperSizeRepositoryImpl) FindAll(ctx context.Context) ([]misc_dto.PaperSizeResponse, error) {
	return r.BaseRepository.FindAll(ctx)
}

func (r *paperSizeRepositoryImpl) FindByID(ctx context.Context, id int) (*misc_dto.PaperSizeResponse, error) {
	return r.BaseRepository.FindByID(ctx, id)
}

func (r *paperSizeRepositoryImpl) Insert(ctx context.Context, req misc_dto.CreatePaperSizeRequest) (int, error) {
	query := `
		INSERT INTO paper_sizes (
			name, top_margin, side_margin, vertical_pitch, horizontal_pitch,
			label_width, label_height, number_across, number_down, page_width, page_height
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`
	ext := database.GetExt(ctx, r.db)
	res, err := ext.ExecContext(ctx, query,
		req.Name, req.TopMargin, req.SideMargin, req.VerticalPitch, req.HorizontalPitch,
		req.LabelWidth, req.LabelHeight, req.NumberAcross, req.NumberDown, req.PageWidth, req.PageHeight,
	)
	if err != nil {
		return 0, err
	}
	id, err := res.LastInsertId()
	return int(id), err
}

func (r *paperSizeRepositoryImpl) Update(ctx context.Context, id int, req misc_dto.UpdatePaperSizeRequest) (int, error) {
	query := `
		UPDATE paper_sizes SET
			name = ?, top_margin = ?, side_margin = ?, vertical_pitch = ?, horizontal_pitch = ?,
			label_width = ?, label_height = ?, number_across = ?, number_down = ?, page_width = ?, page_height = ?
		WHERE id = ?
	`
	ext := database.GetExt(ctx, r.db)
	res, err := ext.ExecContext(ctx, query,
		req.Name, req.TopMargin, req.SideMargin, req.VerticalPitch, req.HorizontalPitch,
		req.LabelWidth, req.LabelHeight, req.NumberAcross, req.NumberDown, req.PageWidth, req.PageHeight,
		id,
	)
	if err != nil {
		return 0, err
	}
	affected, err := res.RowsAffected()
	return int(affected), err
}

func (r *paperSizeRepositoryImpl) Delete(ctx context.Context, id int) (int, error) {
	query := "DELETE FROM paper_sizes WHERE id = ?"
	ext := database.GetExt(ctx, r.db)
	res, err := ext.ExecContext(ctx, query, id)
	if err != nil {
		return 0, err
	}
	affected, err := res.RowsAffected()
	return int(affected), err
}
