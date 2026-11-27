// Package mysql implements MySQL persistence repositories for the catalog module.
package mysql

import (
	"context"
	"database/sql"

	sq "github.com/Masterminds/squirrel"
	"github.com/dps-wmhris/backend/internal/modules/catalog/domain"
	catalog_port "github.com/dps-wmhris/backend/internal/modules/catalog/port"
	"github.com/dps-wmhris/backend/internal/shared/database"
	"github.com/jmoiron/sqlx"
)

type categoryRepositoryImpl struct {
	database.BaseRepository[domain.Category]
	db *sqlx.DB
}

// NewCategoryRepository creates a MySQL-backed CategoryRepository.
func NewCategoryRepository(db *sqlx.DB) catalog_port.CategoryRepository {
	base := database.NewBaseRepository[domain.Category](db, "categories")
	return &categoryRepositoryImpl{
		BaseRepository: base,
		db:             db,
	}
}

func (r *categoryRepositoryImpl) FindAllActive(ctx context.Context) ([]domain.Category, error) {
	return r.FindAll(ctx)
}

type categoryWithCountRow struct {
	domain.Category
	ProductCount int `db:"product_count"`
}

func (r *categoryRepositoryImpl) FindByStatus(ctx context.Context, status string) ([]domain.Category, error) {
	builder := sq.Select(
		"c.id",
		"c.name",
		"c.is_active",
		"c.created_at",
		"c.updated_at",
		"COUNT(p.id) AS product_count",
	).
		From("categories c").
		LeftJoin("products p ON p.category_id = c.id AND p.is_active = 1 AND p.deleted_at IS NULL").
		GroupBy("c.id", "c.name", "c.is_active", "c.created_at", "c.updated_at")

	switch status {
	case domain.CategoryStatusArchived:
		builder = builder.Where(sq.Eq{"c.is_active": 0})
	case domain.CategoryStatusAll:
		// No is_active filter
	default:
		builder = builder.Where(sq.Eq{"c.is_active": 1})
	}

	query, args, err := builder.ToSql()
	if err != nil {
		return nil, err
	}

	var rows []categoryWithCountRow
	ext := database.GetExt(ctx, r.db)
	if err := ext.SelectContext(ctx, &rows, query, args...); err != nil {
		return nil, err
	}

	results := make([]domain.Category, len(rows))
	for i, row := range rows {
		cat := row.Category
		cat.ProductCount = row.ProductCount
		results[i] = cat
	}
	return results, nil
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

func (r *categoryRepositoryImpl) ensureExists(ctx context.Context, ext database.ExtContext, id int) error {
	var count int
	if err := ext.GetContext(ctx, &count, "SELECT COUNT(*) FROM categories WHERE id = ?", id); err != nil {
		return err
	}
	if count == 0 {
		return sql.ErrNoRows
	}
	return nil
}

func (r *categoryRepositoryImpl) Update(ctx context.Context, id int, name string) error {
	ext := database.GetExt(ctx, r.db)
	res, err := ext.ExecContext(ctx, "UPDATE categories SET name = ? WHERE id = ?", name, id)
	if err != nil {
		return err
	}
	if affected, err := res.RowsAffected(); err == nil && affected == 0 {
		return r.ensureExists(ctx, ext, id)
	}
	return nil
}

func (r *categoryRepositoryImpl) Delete(ctx context.Context, id int) error {
	ext := database.GetExt(ctx, r.db)
	res, err := ext.ExecContext(ctx, "UPDATE categories SET is_active = 0 WHERE id = ?", id)
	if err != nil {
		return err
	}
	if affected, err := res.RowsAffected(); err == nil && affected == 0 {
		return r.ensureExists(ctx, ext, id)
	}
	return nil
}

func (r *categoryRepositoryImpl) Restore(ctx context.Context, id int) error {
	ext := database.GetExt(ctx, r.db)
	res, err := ext.ExecContext(ctx, "UPDATE categories SET is_active = 1 WHERE id = ?", id)
	if err != nil {
		return err
	}
	if affected, err := res.RowsAffected(); err == nil && affected == 0 {
		return r.ensureExists(ctx, ext, id)
	}
	return nil
}
