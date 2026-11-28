package mysql

import (
	"context"
	"database/sql"

	inventory_dto "github.com/dps-wmhris/backend/internal/modules/inventory/application/dto"
	inventory_port "github.com/dps-wmhris/backend/internal/modules/inventory/port"
	"github.com/dps-wmhris/backend/internal/shared/database"
	"github.com/jmoiron/sqlx"
)

// SalesChannelRepository is a compatibility alias for inventory_port.SalesChannelRepository.
type SalesChannelRepository = inventory_port.SalesChannelRepository

type salesChannelRepositoryImpl struct {
	db *sqlx.DB
}

// NewSalesChannelRepository creates a MySQL-backed SalesChannelRepository.
func NewSalesChannelRepository(db *sqlx.DB) inventory_port.SalesChannelRepository {
	return &salesChannelRepositoryImpl{db: db}
}

func (r *salesChannelRepositoryImpl) FindAll(ctx context.Context, activeOnly bool) ([]inventory_dto.SalesChannelResponse, error) {
	query := "SELECT id, platform, name, description, is_active, created_at, updated_at FROM sales_channels"
	if activeOnly {
		query += " WHERE is_active = 1"
	}
	query += " ORDER BY id DESC"

	ext := database.GetExt(ctx, r.db)
	channels := make([]inventory_dto.SalesChannelResponse, 0)
	if err := ext.SelectContext(ctx, &channels, query); err != nil {
		return nil, err
	}
	if channels == nil {
		return []inventory_dto.SalesChannelResponse{}, nil
	}
	return channels, nil
}

func (r *salesChannelRepositoryImpl) FindByID(ctx context.Context, id int) (*inventory_dto.SalesChannelResponse, error) {
	query := "SELECT id, platform, name, description, is_active, created_at, updated_at FROM sales_channels WHERE id = ?"
	ext := database.GetExt(ctx, r.db)
	var ch inventory_dto.SalesChannelResponse
	if err := ext.GetContext(ctx, &ch, query, id); err != nil {
		return nil, err
	}
	return &ch, nil
}

func (r *salesChannelRepositoryImpl) Insert(ctx context.Context, req inventory_dto.CreateSalesChannelRequest) (int, error) {
	isActive := true
	if req.IsActive != nil {
		isActive = *req.IsActive
	}

	query := "INSERT INTO sales_channels (platform, name, description, is_active) VALUES (?, ?, ?, ?)"
	ext := database.GetExt(ctx, r.db)
	res, err := ext.ExecContext(ctx, query, req.Platform, req.Name, req.Description, isActive)
	if err != nil {
		return 0, err
	}
	id, err := res.LastInsertId()
	return int(id), err
}

func (r *salesChannelRepositoryImpl) Update(ctx context.Context, id int, req inventory_dto.UpdateSalesChannelRequest) (int, error) {
	query := "UPDATE sales_channels SET platform = ?, name = ?, description = ?"
	args := []any{req.Platform, req.Name, req.Description}

	if req.IsActive != nil {
		query += ", is_active = ?"
		args = append(args, *req.IsActive)
	}

	query += " WHERE id = ?"
	args = append(args, id)

	ext := database.GetExt(ctx, r.db)
	res, err := ext.ExecContext(ctx, query, args...)
	if err != nil {
		return 0, err
	}
	affected, err := res.RowsAffected()
	if err != nil {
		return 0, err
	}
	if affected == 0 {
		var count int
		if err := ext.GetContext(ctx, &count, "SELECT COUNT(*) FROM sales_channels WHERE id = ?", id); err != nil {
			return 0, err
		}
		if count == 0 {
			return 0, sql.ErrNoRows
		}
		return 1, nil
	}
	return int(affected), nil
}

func (r *salesChannelRepositoryImpl) Delete(ctx context.Context, id int) (int, error) {
	query := "DELETE FROM sales_channels WHERE id = ?"
	ext := database.GetExt(ctx, r.db)
	res, err := ext.ExecContext(ctx, query, id)
	if err != nil {
		return 0, err
	}
	affected, err := res.RowsAffected()
	if err != nil {
		return 0, err
	}
	if affected == 0 {
		return 0, sql.ErrNoRows
	}
	return int(affected), nil
}
