package repository

import (
	"context"

	catalog_model "github.com/dps-wmhris/backend/internal/modules/catalog/model"

	"github.com/jmoiron/sqlx"
)

type ProductAuditRepository interface {
	Create(ctx context.Context, db sqlx.ExtContext, log *catalog_model.ProductAuditLog) error
}

type productAuditRepositoryImpl struct{}

func NewProductAuditRepository() ProductAuditRepository {
	return &productAuditRepositoryImpl{}
}

func (r *productAuditRepositoryImpl) Create(ctx context.Context, db sqlx.ExtContext, log *catalog_model.ProductAuditLog) error {
	query := `
		INSERT INTO product_audit_logs (
			product_id, user_id, action, field, old_value, new_value
		) VALUES (?, ?, ?, ?, ?, ?)`

	res, err := db.ExecContext(ctx, query,
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
