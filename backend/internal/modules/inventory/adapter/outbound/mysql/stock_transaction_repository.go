package mysql

import (
	"context"
	"database/sql"

	"github.com/dps-wmhris/backend/internal/modules/inventory/domain"
	inventory_port "github.com/dps-wmhris/backend/internal/modules/inventory/port"
	database "github.com/dps-wmhris/backend/internal/shared/database"
	"github.com/jmoiron/sqlx"
)

type stockTransactionRepositoryImpl struct {
	db *sqlx.DB
}

func NewStockTransactionRepository(db *sqlx.DB) inventory_port.StockTransactionRepository {
	return &stockTransactionRepositoryImpl{
		db: db,
	}
}

func (r *stockTransactionRepositoryImpl) CreateTx(ctx context.Context, trx *domain.StockTransaction) error {
	ext := database.GetExt(ctx, r.db)

	queryTrx := `
		INSERT INTO inv_transactions (transaction_number, reference_type, reference_id, assigned_building, status, notes, created_by, created_at, updated_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
	`
	res, err := ext.ExecContext(ctx, queryTrx,
		trx.TransactionNo, trx.ReferenceType, trx.ReferenceID,
		trx.AssignedBuilding, trx.Status, trx.Notes,
		trx.CreatedBy, trx.CreatedAt, trx.UpdatedAt)
	if err != nil {
		return err
	}

	trxID, err := res.LastInsertId()
	if err != nil {
		return err
	}
	trx.ID = uint(trxID)

	queryMov := `
		INSERT INTO inv_movements (transaction_id, product_id, target_quantity, status, created_at)
		VALUES (?, ?, ?, ?, ?)
	`
	for _, mov := range trx.Movements {
		res, err := ext.ExecContext(ctx, queryMov, trx.ID, mov.ProductID, mov.TargetQuantity, mov.Status, mov.CreatedAt)
		if err != nil {
			return err
		}
		movID, err := res.LastInsertId()
		if err != nil {
			return err
		}
		mov.ID = uint(movID)
		mov.TransactionID = trx.ID
	}

	return nil
}

func (r *stockTransactionRepositoryImpl) GetByID(ctx context.Context, id uint) (*domain.StockTransaction, error) {
	ext := database.GetExt(ctx, r.db)

	var trx domain.StockTransaction
	queryTrx := `SELECT id, transaction_number, reference_type, reference_id, assigned_building, status, notes, created_by, created_at, updated_at FROM inv_transactions WHERE id = ?`
	err := ext.QueryRowxContext(ctx, queryTrx, id).StructScan(&trx)
	if err != nil {
		if err == sql.ErrNoRows {
			return nil, nil
		}
		return nil, err
	}

	queryMov := `SELECT id, transaction_id, product_id, target_quantity, status, created_at FROM inv_movements WHERE transaction_id = ?`
	rows, err := ext.QueryxContext(ctx, queryMov, id)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	for rows.Next() {
		var mov domain.TransactionMovement
		if err := rows.StructScan(&mov); err != nil {
			return nil, err
		}
		trx.Movements = append(trx.Movements, &mov)
	}

	return &trx, nil
}

func (r *stockTransactionRepositoryImpl) GetByTransactionNo(ctx context.Context, trxNo string) (*domain.StockTransaction, error) {
	// Not needed right now, placeholder
	return nil, nil 
}

func (r *stockTransactionRepositoryImpl) SaveFulfillmentTx(ctx context.Context, trx *domain.StockTransaction) error {
	ext := database.GetExt(ctx, r.db)

	queryLine := `
		INSERT INTO inv_movement_lines (movement_id, scanned_location_id, qty_done, scanned_by, created_at)
		VALUES (?, ?, ?, ?, ?)
	`
	
	// Untuk keamanan, kita hanya insert line baru (ID == 0)
	for _, mov := range trx.Movements {
		if len(mov.Lines) > 0 {
			line := mov.Lines[len(mov.Lines)-1] 
			if line.ID == 0 { // Unsaved line baru ditambahkan oleh FulfillLine
				res, err := ext.ExecContext(ctx, queryLine, line.MovementID, line.ScannedLocationID, line.QtyDone, line.ScannedBy, line.CreatedAt)
				if err != nil {
					return err
				}
				lineID, err := res.LastInsertId()
				if err != nil {
					return err
				}
				line.ID = uint(lineID)
			}
		}
	}
	return nil
}
