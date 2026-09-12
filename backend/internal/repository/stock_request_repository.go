package repository

import (
	"context"

	"github.com/dps-wmhris/backend/internal/model"
	"github.com/jmoiron/sqlx"
)

type StockRequestRepository interface {
	BaseRepository[model.StockRequest]
	CreateTx(ctx context.Context, ext sqlx.ExtContext, request *model.StockRequest) error
	CreateItemTx(ctx context.Context, ext sqlx.ExtContext, item *model.StockRequestItem) error
	UpdateStatusTx(ctx context.Context, ext sqlx.ExtContext, id int, status string) error
	UpdateItemReceivedQtyTx(ctx context.Context, ext sqlx.ExtContext, itemID int, qty int) error
	FindItemsByRequestID(ctx context.Context, reqID int) ([]model.StockRequestItem, error)
	FindAllWithJoins(ctx context.Context) ([]model.StockRequest, error)
}

type stockRequestRepositoryImpl struct {
	BaseRepository[model.StockRequest]
	db *sqlx.DB
}

func (r *stockRequestRepositoryImpl) CreateTx(ctx context.Context, ext sqlx.ExtContext, request *model.StockRequest) error {
	if ext == nil {
		ext = r.db
	}
	query := `
		INSERT INTO stock_requests (
			request_number, type, requester_id, from_location_id, 
			to_location_id, status, notes, created_at, updated_at
		) VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`
		
	res, err := ext.ExecContext(ctx, query,
		request.RequestNumber, request.Type, request.RequesterID,
		request.FromLocationID, request.ToLocationID, request.Status,
		request.Notes,
	)
	
	if err != nil {
		return err
	}
	
	id, err := res.LastInsertId()
	if err == nil {
		request.ID = int(id)
	}
	return err
}

func (r *stockRequestRepositoryImpl) CreateItemTx(ctx context.Context, ext sqlx.ExtContext, item *model.StockRequestItem) error {
	if ext == nil {
		ext = r.db
	}
	query := `
		INSERT INTO stock_request_items (
			stock_request_id, product_id, quantity, received_quantity
		) VALUES (?, ?, ?, ?)`
		
	res, err := ext.ExecContext(ctx, query, item.StockRequestID, item.ProductID, item.Quantity, item.ReceivedQuantity)
	if err != nil {
		return err
	}
	
	id, err := res.LastInsertId()
	if err == nil {
		item.ID = int(id)
	}
	return err
}

func (r *stockRequestRepositoryImpl) UpdateStatusTx(ctx context.Context, ext sqlx.ExtContext, id int, status string) error {
	if ext == nil {
		ext = r.db
	}
	query := `UPDATE stock_requests SET status = ?, updated_at = NOW() WHERE id = ?`
	_, err := ext.ExecContext(ctx, query, status, id)
	return err
}

func (r *stockRequestRepositoryImpl) UpdateItemReceivedQtyTx(ctx context.Context, ext sqlx.ExtContext, itemID int, qty int) error {
	if ext == nil {
		ext = r.db
	}
	query := `UPDATE stock_request_items SET received_quantity = ? WHERE id = ?`
	_, err := ext.ExecContext(ctx, query, qty, itemID)
	return err
}

func (r *stockRequestRepositoryImpl) FindItemsByRequestID(ctx context.Context, reqID int) ([]model.StockRequestItem, error) {
	var items []model.StockRequestItem
	query := `
		SELECT sri.*, p.name as product_name, p.sku
		FROM stock_request_items sri
		JOIN products p ON sri.product_id = p.id
		WHERE sri.stock_request_id = ?`
	
	err := r.db.SelectContext(ctx, &items, query, reqID)
	return items, err
}

// FindAllWithJoins retrieves all stock requests with requester name and location details via JOINs.
func (r *stockRequestRepositoryImpl) FindAllWithJoins(ctx context.Context) ([]model.StockRequest, error) {
	query := `
		SELECT sr.id, sr.request_number, sr.type, sr.requester_id,
			sr.from_location_id, sr.to_location_id, sr.status,
			COALESCE(sr.notes, '') as notes, sr.created_at, sr.updated_at,
			COALESCE(u.nickname, u.username, '') as requester_name,
			COALESCE(fl.name, '') as from_location_name,
			COALESCE(fl.code, '') as from_location_code,
			COALESCE(tl.name, '') as to_location_name,
			COALESCE(tl.code, '') as to_location_code
		FROM stock_requests sr
		LEFT JOIN users u ON sr.requester_id = u.id
		LEFT JOIN locations fl ON sr.from_location_id = fl.id
		LEFT JOIN locations tl ON sr.to_location_id = tl.id
		ORDER BY sr.created_at DESC`

	rows, err := r.db.QueryxContext(ctx, query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var results []model.StockRequest
	for rows.Next() {
		var sr model.StockRequest
		if err := rows.Scan(
			&sr.ID, &sr.RequestNumber, &sr.Type, &sr.RequesterID,
			&sr.FromLocationID, &sr.ToLocationID, &sr.Status,
			&sr.Notes, &sr.CreatedAt, &sr.UpdatedAt,
			&sr.RequesterName, &sr.FromLocationName, &sr.FromLocationCode,
			&sr.ToLocationName, &sr.ToLocationCode,
		); err != nil {
			return nil, err
		}
		results = append(results, sr)
	}
	if results == nil {
		results = []model.StockRequest{}
	}
	return results, nil
}

func NewStockRequestRepository(db *sqlx.DB) StockRequestRepository {
	base := NewBaseRepository[model.StockRequest](db, "stock_requests")
	return &stockRequestRepositoryImpl{
		BaseRepository: base,
		db:             db,
	}
}
