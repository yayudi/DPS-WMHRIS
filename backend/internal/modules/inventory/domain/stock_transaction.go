package domain

import (
	"encoding/json"
	"strings"
	"time"

	"github.com/dps-wmhris/backend/internal/shared/apperror"
)

// Lifecycle statuses for fulfillment transactions and their child movements.
const (
	TransactionStatusPending           = "PENDING"
	TransactionStatusReadyToPick       = "READY_TO_PICK"
	TransactionStatusHoldReplenishment = "HOLD_REPLENISHMENT"
	TransactionStatusOutOfStock        = "OUT_OF_STOCK"
	TransactionStatusCompleted         = "COMPLETED"
	TransactionStatusCancelled         = "CANCELLED"
	TransactionStatusVoid              = "VOID"
)

// Domain errors for fulfillment transaction invariants.
var (
	ErrInvalidProductID         = apperror.Validation("wms.transaction.err_invalid_product_id", "ID produk tidak valid")
	ErrInvalidQuantity          = apperror.Validation("wms.transaction.err_invalid_quantity", "Jumlah kuantitas tidak valid")
	ErrCrossBuildingProcess     = apperror.Validation("wms.transaction.err_cross_building", "Proses lintas gedung tidak diizinkan untuk transaksi ini")
	ErrInvalidLocationPurpose   = apperror.Validation("wms.transaction.err_invalid_location_purpose", "Fungsi lokasi tidak diizinkan untuk pemrosesan fulfillment")
	ErrCannotReleaseNotHeld     = apperror.Validation("wms.transaction.err_not_held", "Transaksi tidak dalam status tertahan dan tidak dapat dilepas")
	ErrTransactionNotPickable   = apperror.Validation("wms.transaction.err_not_pickable", "Transaksi tidak berada pada status yang dapat diproses untuk picking")
	ErrMovementNotFound         = apperror.NotFound("wms.transaction.err_movement_not_found", "Pergerakan barang tidak ditemukan dalam transaksi ini")
	ErrMovementAlreadyCompleted = apperror.Validation("wms.transaction.err_movement_completed", "Pergerakan barang pada transaksi ini sudah selesai dipenuhi")
)

// TransactionMovementLine records an individual warehouse pick scan against a movement.
// keep: domain model uses uint IDs for Kelja fulfillment aggregate and operations
type TransactionMovementLine struct {
	ID                uint      `db:"id"`
	MovementID        uint      `db:"movement_id"`
	ScannedLocationID uint      `db:"scanned_location_id"`
	QtyDone           int       `db:"qty_done"`
	ScannedBy         uint      `db:"scanned_by"`
	CreatedAt         time.Time `db:"created_at"`
}

// TransactionMovement represents a single product demand line within a StockTransaction.
type TransactionMovement struct {
	ID             uint                       `db:"id"`
	TransactionID  uint                       `db:"transaction_id"`
	ProductID      uint                       `db:"product_id"`
	TargetQuantity int                        `db:"target_quantity"`
	Status         string                     `db:"status"` // PENDING, COMPLETED
	CreatedAt      time.Time                  `db:"created_at"`
	Lines          []*TransactionMovementLine `db:"-"`
}

// StockTransaction is the aggregate root for an inbound/outbound fulfillment order in inv_transactions.
// keep: domain model uses uint IDs for Kelja fulfillment aggregate and operations
type StockTransaction struct {
	ID               uint                   `db:"id"`
	TransactionNo    string                 `db:"transaction_number"`
	ReferenceType    string                 `db:"reference_type"`
	ReferenceID      string                 `db:"reference_id"`
	AssignedBuilding string                 `db:"assigned_building"`
	Status           string                 `db:"status"` // PENDING, READY_TO_PICK, HOLD_REPLENISHMENT, OUT_OF_STOCK, COMPLETED, CANCELLED, VOID
	Notes            *string                `db:"notes"`
	CreatedBy        *uint                  `db:"created_by"`
	CreatedAt        time.Time              `db:"created_at"`
	UpdatedAt        time.Time              `db:"updated_at"`
	Movements        []*TransactionMovement `db:"-"`
}

// AddDemand appends a product demand movement to the transaction.
func (st *StockTransaction) AddDemand(productID uint, targetQty int) error {
	if productID == 0 {
		return ErrInvalidProductID
	}
	if targetQty <= 0 {
		return ErrInvalidQuantity
	}
	st.Movements = append(st.Movements, &TransactionMovement{
		ProductID:      productID,
		TargetQuantity: targetQty,
		Status:         TransactionStatusPending,
		CreatedAt:      time.Now(),
	})
	return nil
}

// CanBePicked reports whether this transaction is in a pickable state.
func (st *StockTransaction) CanBePicked() bool {
	return st.Status == "" || st.Status == TransactionStatusPending || st.Status == TransactionStatusReadyToPick
}

// ProcessLine validates location and status guards, records a scanned pick line, and updates completion statuses.
func (st *StockTransaction) ProcessLine(movementID uint, scannedLoc *Location, qty int, scannedBy uint) error {
	if qty <= 0 {
		return ErrInvalidQuantity
	}
	if !st.CanBePicked() {
		return ErrTransactionNotPickable
	}
	// Guard Clause: Only allow processing from valid fulfillment source locations
	if scannedLoc == nil || !scannedLoc.IsFulfillmentSource {
		return ErrInvalidLocationPurpose
	}

	// Find the movement
	var targetMove *TransactionMovement
	for _, m := range st.Movements {
		if m.ID == movementID {
			targetMove = m
			break
		}
	}

	if targetMove == nil {
		return ErrMovementNotFound
	}
	if targetMove.Status == TransactionStatusCompleted || targetMove.IsCompleted() {
		return ErrMovementAlreadyCompleted
	}

	// Add the line
	targetMove.Lines = append(targetMove.Lines, &TransactionMovementLine{
		MovementID:        movementID,
		ScannedLocationID: uint(scannedLoc.ID),
		QtyDone:           qty,
		ScannedBy:         scannedBy,
		CreatedAt:         time.Now(),
	})

	if targetMove.IsCompleted() {
		targetMove.Status = TransactionStatusCompleted
	}

	if st.IsCompleted() {
		st.Status = TransactionStatusCompleted
	}

	return nil
}

// IsCompleted reports whether the cumulative picked quantity meets or exceeds TargetQuantity.
func (tm *TransactionMovement) IsCompleted() bool {
	totalQtyDone := 0
	for _, line := range tm.Lines {
		totalQtyDone += line.QtyDone
	}
	return totalQtyDone >= tm.TargetQuantity
}

// IsCompleted reports whether all movements in this transaction are completed.
func (st *StockTransaction) IsCompleted() bool {
	for _, m := range st.Movements {
		if !m.IsCompleted() {
			return false
		}
	}
	return len(st.Movements) > 0
}

// MarkOnHoldForReplenishment holds the transaction while serializing deficit details into notes.
func (st *StockTransaction) MarkOnHoldForReplenishment(deficits []ReplenishmentDeficit) error {
	st.Status = TransactionStatusHoldReplenishment
	if len(deficits) > 0 {
		data, err := json.Marshal(deficits)
		if err != nil {
			return err
		}
		notes := string(data)
		st.Notes = &notes
	}
	return nil
}

// MarkOutOfStock sets the transaction status to OUT_OF_STOCK with an optional explanatory note.
func (st *StockTransaction) MarkOutOfStock(reason string) {
	st.Status = TransactionStatusOutOfStock
	trimmed := strings.TrimSpace(reason)
	if trimmed != "" {
		st.Notes = &trimmed
	}
}

// CanBeReleased checks whether this transaction is currently in a held state eligible for release.
func (st *StockTransaction) CanBeReleased() bool {
	return st.Status == TransactionStatusHoldReplenishment || st.Status == TransactionStatusOutOfStock
}
