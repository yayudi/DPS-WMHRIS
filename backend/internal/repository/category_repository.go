package repository

import (
	"context"

	"github.com/dps-wmhris/backend/internal/model"
	"github.com/jmoiron/sqlx"
)

type CategoryRepository interface {
	BaseRepository[model.Category]
	FindAllActive(ctx context.Context) ([]model.Category, error)
	Create(ctx context.Context, category *model.Category) error
	Update(ctx context.Context, id int, name string) error
	Delete(ctx context.Context, id int) error
}

type categoryRepositoryImpl struct {
	BaseRepository[model.Category]
	db *sqlx.DB
}


func (r *categoryRepositoryImpl) FindAllActive(ctx context.Context) ([]model.Category, error) {
	var categories []model.Category
	query := "SELECT id, name, is_active, created_at, updated_at FROM categories WHERE is_active = 1"
	err := r.db.SelectContext(ctx, &categories, query)
	return categories, err
}


func (r *categoryRepositoryImpl) Create(ctx context.Context, category *model.Category) error {
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
	base := NewBaseRepository[model.Category](db, "categories")
	return &categoryRepositoryImpl{
		BaseRepository: base,
		db:             db,
	}
}
