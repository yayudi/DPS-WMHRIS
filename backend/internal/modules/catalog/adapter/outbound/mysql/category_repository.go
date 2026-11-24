package mysql

import (
	"github.com/dps-wmhris/backend/internal/modules/catalog/domain"
	catalog_port "github.com/dps-wmhris/backend/internal/modules/catalog/port"

	"context"

	sq "github.com/Masterminds/squirrel"
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
	case "archived":
		builder = builder.Where(sq.Eq{"c.is_active": 0})
	case "all":
		// Tanpa filter is_active
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
