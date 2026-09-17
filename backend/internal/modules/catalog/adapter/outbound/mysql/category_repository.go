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
	var categories []domain.Category
	query := "SELECT id, name, is_active, created_at, updated_at FROM categories WHERE is_active = 1"
	err := r.db.SelectContext(ctx, &categories, query)
	return categories, err
}

func (r *categoryRepositoryImpl) Create(ctx context.Context, category *domain.Category) error {
	query := "INSERT INTO categories (name, is_active) VALUES (?, ?)"
	res, err := r.db.ExecContext(ctx, query, category.Name, category.IsActive)
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
	_, err := r.db.ExecContext(ctx, query, name, id)
	return err
}

func (r *categoryRepositoryImpl) Delete(ctx context.Context, id int) error {
	query := "UPDATE categories SET is_active = 0 WHERE id = ?"
	_, err := r.db.ExecContext(ctx, query, id)
	return err
}

func NewCategoryRepository(db *sqlx.DB) catalog_port.CategoryRepository {
	base := database.NewBaseRepository[domain.Category](db, "categories")
	return &categoryRepositoryImpl{
		BaseRepository: base,
		db:             db,
	}
}
