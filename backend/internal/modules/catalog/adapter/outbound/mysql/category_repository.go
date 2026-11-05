package mysql

import (
	"github.com/dps-wmhris/backend/internal/modules/catalog/domain"
	catalog_port "github.com/dps-wmhris/backend/internal/modules/catalog/port"

	"context"

	database "github.com/dps-wmhris/backend/internal/shared/database"
	"github.com/jmoiron/sqlx"
)

type categoryRepositoryImpl struct {
	database.BaseRepository[domain.Category]
	db *sqlx.DB
}

func (r *categoryRepositoryImpl) FindAllActive(ctx context.Context) ([]domain.Category, error) {
	return r.FindAll(ctx)
}

func (r *categoryRepositoryImpl) Create(ctx context.Context, category *domain.Category) error {
	query := "INSERT INTO categories (name, is_active) VALUES (?, ?)"
	ext := database.GetExt(ctx, r.db)
	res, err := ext.ExecContext(ctx, query, category.Name, category.IsActive)
	if err != nil {
		return err
	}
	id, err := res.LastInsertId()
	if err == nil {
		category.ID = int(id)
	}
	return err
}

func (r *categoryRepositoryImpl) Update(ctx context.Context, id int, name string) error {
	query := "UPDATE categories SET name = ? WHERE id = ?"
	ext := database.GetExt(ctx, r.db)
	_, err := ext.ExecContext(ctx, query, name, id)
	return err
}

func (r *categoryRepositoryImpl) Delete(ctx context.Context, id int) error {
	return r.SoftDelete(ctx, id)
}

func NewCategoryRepository(db *sqlx.DB) catalog_port.CategoryRepository {
	base := database.NewBaseRepository[domain.Category](db, "categories")
	return &categoryRepositoryImpl{
		BaseRepository: base,
		db:             db,
	}
}
