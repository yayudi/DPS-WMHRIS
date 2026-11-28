package mysql

import (
	"context"

	"github.com/dps-wmhris/backend/internal/modules/inventory/domain"
	inventory_port "github.com/dps-wmhris/backend/internal/modules/inventory/port"
	"github.com/dps-wmhris/backend/internal/shared/database"
	"github.com/jmoiron/sqlx"
)

type stockRequestRepositoryImpl struct {
	database.BaseRepository[domain.StockRequest]
	db *sqlx.DB
}

// NewStockRequestRepository creates a MySQL-backed StockRequestRepository.
func NewStockRequestRepository(db *sqlx.DB) inventory_port.StockRequestRepository {
	base := database.NewBaseRepository[domain.StockRequest](db, "stock_requests")
	return &stockRequestRepositoryImpl{
		BaseRepository: base,
		db:             db,
	}
}

// CreateTx inserts a new stock_requests header inside the active transaction.
func (r *stockRequestRepositoryImpl) CreateTx(ctx context.Context, request *domain.StockRequest) error {
	ext := database.GetExt(ctx, r.db)
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

// CreateItemTx inserts a single stock_request_items row inside the active transaction.
func (r *stockRequestRepositoryImpl) CreateItemTx(ctx context.Context, item *domain.StockRequestItem) error {
	ext := database.GetExt(ctx, r.db)
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

// UpdateStatusTx updates the lifecycle status of a stock request inside the active transaction.
func (r *stockRequestRepositoryImpl) UpdateStatusTx(ctx context.Context, id int, status string) error {
	ext := database.GetExt(ctx, r.db)
	query := `UPDATE stock_requests SET status = ?, updated_at = NOW() WHERE id = ?`
	_, err := ext.ExecContext(ctx, query, status, id)
	return err
}

// UpdateItemReceivedQtyTx updates the received_quantity of a stock request item inside the active transaction.
func (r *stockRequestRepositoryImpl) UpdateItemReceivedQtyTx(ctx context.Context, itemID int, qty int) error {
	ext := database.GetExt(ctx, r.db)
	query := `UPDATE stock_request_items SET received_quantity = ? WHERE id = ?`
	_, err := ext.ExecContext(ctx, query, qty, itemID)
	return err
}

// FindItemsByRequestID retrieves all line items for a single stock request joined with product SKU and name.
func (r *stockRequestRepositoryImpl) FindItemsByRequestID(ctx context.Context, reqID int) ([]domain.StockRequestItem, error) {
	ext := database.GetExt(ctx, r.db)
	items := make([]domain.StockRequestItem, 0)
	query := `
		SELECT sri.id, sri.stock_request_id, sri.product_id, sri.quantity, sri.received_quantity,
		       p.name AS product_name, p.sku
		FROM stock_request_items sri
		JOIN products p ON sri.product_id = p.id
		WHERE sri.stock_request_id = ?`

	if err := ext.SelectContext(ctx, &items, query, reqID); err != nil {
		return nil, err
	}
	if items == nil {
		return []domain.StockRequestItem{}, nil
	}
	return items, nil
}

// FindItemsByRequestIDs batch-loads line items for multiple stock request IDs in a single IN query to avoid N+1 queries.
func (r *stockRequestRepositoryImpl) FindItemsByRequestIDs(ctx context.Context, reqIDs []int) (map[int][]domain.StockRequestItem, error) {
	result := make(map[int][]domain.StockRequestItem, len(reqIDs))
	if len(reqIDs) == 0 {
		return result, nil
	}

	ext := database.GetExt(ctx, r.db)
	query, args, err := sqlx.In(`
		SELECT sri.id, sri.stock_request_id, sri.product_id, sri.quantity, sri.received_quantity,
		       p.name AS product_name, p.sku
		FROM stock_request_items sri
		JOIN products p ON sri.product_id = p.id
		WHERE sri.stock_request_id IN (?)
		ORDER BY sri.id ASC`, reqIDs)
	if err != nil {
		return nil, err
	}

	var items []domain.StockRequestItem
	if err := ext.SelectContext(ctx, &items, ext.Rebind(query), args...); err != nil {
		return nil, err
	}
	for _, item := range items {
		result[item.StockRequestID] = append(result[item.StockRequestID], item)
	}
	return result, nil
}

// FindAllWithJoins retrieves all stock requests with requester name and origin/destination location details.
func (r *stockRequestRepositoryImpl) FindAllWithJoins(ctx context.Context) ([]domain.StockRequest, error) {
	ext := database.GetExt(ctx, r.db)
	query := `
		SELECT sr.id, sr.request_number, sr.type, sr.requester_id,
			sr.from_location_id, sr.to_location_id, sr.status,
			COALESCE(sr.notes, '') AS notes, sr.created_at, sr.updated_at,
			COALESCE(u.nickname, u.username, '') AS requester_name,
			COALESCE(fl.name, '') AS from_location_name,
			COALESCE(fl.code, '') AS from_location_code,
			COALESCE(tl.name, '') AS to_location_name,
			COALESCE(tl.code, '') AS to_location_code
		FROM stock_requests sr
		LEFT JOIN users u ON sr.requester_id = u.id
		LEFT JOIN locations fl ON sr.from_location_id = fl.id
		LEFT JOIN locations tl ON sr.to_location_id = tl.id
		ORDER BY sr.created_at DESC`

	rows, err := ext.QueryxContext(ctx, query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	results := make([]domain.StockRequest, 0)
	for rows.Next() {
		var sr domain.StockRequest
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
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return results, nil
}
