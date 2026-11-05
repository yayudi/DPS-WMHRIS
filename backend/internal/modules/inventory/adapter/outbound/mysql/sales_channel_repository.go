package mysql

import (
	"context"

	inventory_dto "github.com/dps-wmhris/backend/internal/modules/inventory/application/dto"
	"github.com/dps-wmhris/backend/internal/shared/database"
	"github.com/jmoiron/sqlx"
)

type SalesChannelRepository interface {
	FindAll(ctx context.Context, activeOnly bool) ([]inventory_dto.SalesChannelResponse, error)
	FindByID(ctx context.Context, id int) (*inventory_dto.SalesChannelResponse, error)
	Insert(ctx context.Context, req inventory_dto.CreateSalesChannelRequest) (int, error)
	Update(ctx context.Context, id int, req inventory_dto.UpdateSalesChannelRequest) (int, error)
	Delete(ctx context.Context, id int) (int, error)
}

type salesChannelRepositoryImpl struct {
	database.BaseRepository[inventory_dto.SalesChannelResponse]
	db *sqlx.DB
}

func NewSalesChannelRepository(db *sqlx.DB) SalesChannelRepository {
	base := database.NewBaseRepository[inventory_dto.SalesChannelResponse](db, "sales_channels")
	return &salesChannelRepositoryImpl{
		BaseRepository: base,
		db:             db,
	}
}

func (r *salesChannelRepositoryImpl) FindAll(ctx context.Context, activeOnly bool) ([]inventory_dto.SalesChannelResponse, error) {
	if activeOnly {
		return r.BaseRepository.FindAll(ctx)
	}

	query := "SELECT id, platform, name, description, is_active, created_at, updated_at FROM sales_channels ORDER BY id DESC"
	ext := database.GetExt(ctx, r.db)
	var channels []inventory_dto.SalesChannelResponse
	err := ext.SelectContext(ctx, &channels, query)
	if err != nil {
		return nil, err
	}
	if channels == nil {
		channels = []inventory_dto.SalesChannelResponse{}
	}
	return channels, nil
}

func (r *salesChannelRepositoryImpl) FindByID(ctx context.Context, id int) (*inventory_dto.SalesChannelResponse, error) {
	return r.BaseRepository.FindByID(ctx, id)
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
	args := []interface{}{req.Platform, req.Name, req.Description}

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
	return int(affected), err
}

func (r *salesChannelRepositoryImpl) Delete(ctx context.Context, id int) (int, error) {
	query := "DELETE FROM sales_channels WHERE id = ?"
	ext := database.GetExt(ctx, r.db)
	res, err := ext.ExecContext(ctx, query, id)
	if err != nil {
		return 0, err
	}
	affected, err := res.RowsAffected()
	return int(affected), err
}
