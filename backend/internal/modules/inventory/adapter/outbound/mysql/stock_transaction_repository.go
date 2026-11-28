package mysql

import (
	"context"
	"database/sql"
	"errors"

	"github.com/dps-wmhris/backend/internal/modules/inventory/domain"
	inventory_port "github.com/dps-wmhris/backend/internal/modules/inventory/port"
	"github.com/dps-wmhris/backend/internal/shared/database"
	"github.com/jmoiron/sqlx"
)

type stockTransactionRepositoryImpl struct {
	db *sqlx.DB
}

// NewStockTransactionRepository creates a MySQL-backed StockTransactionRepository.
func NewStockTransactionRepository(db *sqlx.DB) inventory_port.StockTransactionRepository {
	return &stockTransactionRepositoryImpl{
		db: db,
	}
}

// CreateTx inserts a StockTransaction header and all its child inv_movements inside the active transaction.
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
	trx.ID = uint(trxID) // #nosec G115

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
		mov.ID = uint(movID) // #nosec G115
		mov.TransactionID = trx.ID
	}

	return nil
}

func (r *stockTransactionRepositoryImpl) hydrateMovementsAndLines(ctx context.Context, ext database.ExtContext, trx *domain.StockTransaction) error {
	queryMov := `SELECT id, transaction_id, product_id, target_quantity, status, created_at FROM inv_movements WHERE transaction_id = ? ORDER BY id ASC`
	rows, err := ext.QueryxContext(ctx, queryMov, trx.ID)
	if err != nil {
		return err
	}
	defer rows.Close()

	movIDs := make([]uint, 0)
	movByID := make(map[uint]*domain.TransactionMovement)
	for rows.Next() {
		var mov domain.TransactionMovement
		if err := rows.StructScan(&mov); err != nil {
			return err
		}
		mov.Lines = make([]*domain.TransactionMovementLine, 0)
		trx.Movements = append(trx.Movements, &mov)
		movIDs = append(movIDs, mov.ID)
		movByID[mov.ID] = &mov
	}
	if err := rows.Err(); err != nil {
		return err
	}
	if len(movIDs) == 0 {
		return nil
	}

	linesQuery, args, err := sqlx.In(`
		SELECT id, movement_id, scanned_location_id, qty_done, scanned_by, created_at
		FROM inv_movement_lines
		WHERE movement_id IN (?)
		ORDER BY id ASC`, movIDs)
	if err != nil {
		return err
	}

	var lines []domain.TransactionMovementLine
	if err := ext.SelectContext(ctx, &lines, ext.Rebind(linesQuery), args...); err != nil {
		return err
	}
	for i := range lines {
		lineCopy := lines[i]
		if mov, ok := movByID[lineCopy.MovementID]; ok {
			mov.Lines = append(mov.Lines, &lineCopy)
		}
	}
	return nil
}

// GetByID retrieves a StockTransaction aggregate fully hydrated with inv_movements and inv_movement_lines.
func (r *stockTransactionRepositoryImpl) GetByID(ctx context.Context, id uint) (*domain.StockTransaction, error) {
	ext := database.GetExt(ctx, r.db)

	var trx domain.StockTransaction
	queryTrx := `SELECT id, transaction_number, reference_type, reference_id, assigned_building, status, notes, created_by, created_at, updated_at FROM inv_transactions WHERE id = ?`
	err := ext.QueryRowxContext(ctx, queryTrx, id).StructScan(&trx)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, nil
		}
		return nil, err
	}

	if err := r.hydrateMovementsAndLines(ctx, ext, &trx); err != nil {
		return nil, err
	}
	return &trx, nil
}

// GetByTransactionNo retrieves a StockTransaction aggregate by unique transaction_number hydrated with movements and lines.
func (r *stockTransactionRepositoryImpl) GetByTransactionNo(ctx context.Context, trxNo string) (*domain.StockTransaction, error) {
	ext := database.GetExt(ctx, r.db)

	var trx domain.StockTransaction
	queryTrx := `SELECT id, transaction_number, reference_type, reference_id, assigned_building, status, notes, created_by, created_at, updated_at FROM inv_transactions WHERE transaction_number = ? LIMIT 1`
	err := ext.QueryRowxContext(ctx, queryTrx, trxNo).StructScan(&trx)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, nil
		}
		return nil, err
	}

	if err := r.hydrateMovementsAndLines(ctx, ext, &trx); err != nil {
		return nil, err
	}
	return &trx, nil
}

// GetByReference retrieves a StockTransaction header by external reference_type and reference_id.
func (r *stockTransactionRepositoryImpl) GetByReference(ctx context.Context, refType string, refID string) (*domain.StockTransaction, error) {
	ext := database.GetExt(ctx, r.db)
	var trx domain.StockTransaction
	query := `SELECT id, transaction_number, reference_type, reference_id, assigned_building, status, notes, created_by, created_at, updated_at FROM inv_transactions WHERE reference_type = ? AND reference_id = ? LIMIT 1`
	err := ext.QueryRowxContext(ctx, query, refType, refID).StructScan(&trx)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, nil
		}
		return nil, err
	}
	return &trx, nil
}

// SaveFulfillmentTx persists all unsaved inv_movement_lines and updates inv_movements and inv_transactions statuses atomically.
func (r *stockTransactionRepositoryImpl) SaveFulfillmentTx(ctx context.Context, trx *domain.StockTransaction) error {
	ext := database.GetExt(ctx, r.db)

	queryLine := `
		INSERT INTO inv_movement_lines (movement_id, scanned_location_id, qty_done, scanned_by, created_at)
		VALUES (?, ?, ?, ?, ?)
	`

	for _, mov := range trx.Movements {
		for _, line := range mov.Lines {
			if line.ID != 0 {
				continue
			}
			res, err := ext.ExecContext(ctx, queryLine, line.MovementID, line.ScannedLocationID, line.QtyDone, line.ScannedBy, line.CreatedAt)
			if err != nil {
				return err
			}
			lineID, err := res.LastInsertId()
			if err != nil {
				return err
			}
			line.ID = uint(lineID) // #nosec G115
		}
	}

	return r.UpdateTransactionTx(ctx, trx)
}

// GetHeldTransactions retrieves all HOLD_REPLENISHMENT and OUT_OF_STOCK transactions with movements batch-loaded via sqlx.In.
func (r *stockTransactionRepositoryImpl) GetHeldTransactions(ctx context.Context, building string) ([]domain.StockTransaction, error) {
	ext := database.GetExt(ctx, r.db)
	transactions := make([]domain.StockTransaction, 0)
	var query string
	var args []any

	if building != "" {
		query = `SELECT id, transaction_number, reference_type, reference_id, assigned_building, status, notes, created_by, created_at, updated_at
		         FROM inv_transactions
		         WHERE status IN (?, ?) AND assigned_building = ?
		         ORDER BY id ASC`
		args = []any{domain.TransactionStatusHoldReplenishment, domain.TransactionStatusOutOfStock, building}
	} else {
		query = `SELECT id, transaction_number, reference_type, reference_id, assigned_building, status, notes, created_by, created_at, updated_at
		         FROM inv_transactions
		         WHERE status IN (?, ?)
		         ORDER BY id ASC`
		args = []any{domain.TransactionStatusHoldReplenishment, domain.TransactionStatusOutOfStock}
	}

	if err := ext.SelectContext(ctx, &transactions, query, args...); err != nil {
		return nil, err
	}
	if len(transactions) == 0 {
		return []domain.StockTransaction{}, nil
	}

	trxIDs := make([]uint, len(transactions))
	for i := range transactions {
		trxIDs[i] = transactions[i].ID
	}

	movQuery, movArgs, err := sqlx.In(`
		SELECT id, transaction_id, product_id, target_quantity, status, created_at
		FROM inv_movements
		WHERE transaction_id IN (?)
		ORDER BY id ASC`, trxIDs)
	if err != nil {
		return nil, err
	}

	var allMovs []domain.TransactionMovement
	if err := ext.SelectContext(ctx, &allMovs, ext.Rebind(movQuery), movArgs...); err != nil {
		return nil, err
	}

	movsByTrxID := make(map[uint][]*domain.TransactionMovement, len(transactions))
	for i := range allMovs {
		m := allMovs[i]
		movsByTrxID[m.TransactionID] = append(movsByTrxID[m.TransactionID], &m)
	}

	for i := range transactions {
		transactions[i].Movements = movsByTrxID[transactions[i].ID]
		if transactions[i].Movements == nil {
			transactions[i].Movements = []*domain.TransactionMovement{}
		}
	}

	return transactions, nil
}

// UpdateTransactionTx updates inv_transactions status/notes and each child inv_movements status inside the active transaction.
func (r *stockTransactionRepositoryImpl) UpdateTransactionTx(ctx context.Context, trx *domain.StockTransaction) error {
	ext := database.GetExt(ctx, r.db)
	query := `UPDATE inv_transactions SET status = ?, notes = ?, updated_at = NOW() WHERE id = ?`
	if _, err := ext.ExecContext(ctx, query, trx.Status, trx.Notes, trx.ID); err != nil {
		return err
	}

	for _, mov := range trx.Movements {
		if mov.ID > 0 {
			if _, err := ext.ExecContext(ctx, `UPDATE inv_movements SET status = ? WHERE id = ?`, mov.Status, mov.ID); err != nil {
				return err
			}
		}
	}

	return nil
}
