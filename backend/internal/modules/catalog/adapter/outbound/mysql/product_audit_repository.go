package mysql

import (
	"context"

	"github.com/dps-wmhris/backend/internal/modules/catalog/domain"
	catalog_port "github.com/dps-wmhris/backend/internal/modules/catalog/port"
	database "github.com/dps-wmhris/backend/internal/shared/database"
	"github.com/jmoiron/sqlx"
)

type productAuditRepositoryImpl struct {
	db *sqlx.DB
}

func NewProductAuditRepository(db *sqlx.DB) catalog_port.ProductAuditRepository {
	return &productAuditRepositoryImpl{db: db}
}

func (r *productAuditRepositoryImpl) Create(ctx context.Context, log *domain.ProductAuditLog) error {
	query := `
		INSERT INTO product_audit_logs (
			product_id, user_id, action, field, old_value, new_value
		) VALUES (?, ?, ?, ?, ?, ?)`

	ext := database.GetExt(ctx, r.db)
	res, err := ext.ExecContext(ctx, query,
		log.ProductID, log.UserID, log.Action, log.Field, log.OldValue, log.NewValue,
	)

	if err != nil {
		return err
	}
	id, err := res.LastInsertId()
	if err == nil {
		log.ID = int(id)
	}
	return err
}
