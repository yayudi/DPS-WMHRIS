package repository

import (
	catalog_model "github.com/dps-wmhris/backend/internal/modules/catalog/model"
	database "github.com/dps-wmhris/backend/internal/shared/database"

	"context"

	"github.com/jmoiron/sqlx"
)

type CategoryRepository interface {
	database.BaseRepository[catalog_model.Category]
	FindAllActive(ctx context.Context) ([]catalog_model.Category, error)
	Create(ctx context.Context, category *catalog_model.Category) error
	Update(ctx context.Context, id int, name string) error
	Delete(ctx context.Context, id int) error
}

type categoryRepositoryImpl struct {
	database.BaseRepository[catalog_model.Category]
	db *sqlx.DB
}

func (r *categoryRepositoryImpl) FindAllActive(ctx context.Context) ([]catalog_model.Category, error) {
	var categories []catalog_model.Category
	query := "SELECT id, name, is_active, created_at, updated_at FROM categories WHERE is_active = 1"
	err := r.db.SelectContext(ctx, &categories, query)
	return categories, err
}

func (r *categoryRepositoryImpl) Create(ctx context.Context, category *catalog_model.Category) error {
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

func NewCategoryRepository(db *sqlx.DB) CategoryRepository {
	base := database.NewBaseRepository[catalog_model.Category](db, "categories")
	return &categoryRepositoryImpl{
		BaseRepository: base,
		db:             db,
	}
}
