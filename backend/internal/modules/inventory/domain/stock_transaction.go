package domain

import (
	"encoding/json"
	"errors"
	"time"
)

const (
	TransactionStatusPending           = "PENDING"
	TransactionStatusReadyToPick       = "READY_TO_PICK"
	TransactionStatusHoldReplenishment = "HOLD_REPLENISHMENT"
	TransactionStatusOutOfStock        = "OUT_OF_STOCK"
	TransactionStatusCompleted         = "COMPLETED"
	TransactionStatusCancelled         = "CANCELLED"
	TransactionStatusVoid              = "VOID"
)

var (
	ErrInvalidQuantity        = errors.New("invalid quantity")
	ErrCrossBuildingProcess   = errors.New("cross building process is not allowed for this transaction")
	ErrInvalidLocationPurpose = errors.New("location purpose is not allowed for processing")
	ErrCannotReleaseNotHeld   = errors.New("transaction is not currently held and cannot be released")
)

// keep: domain model uses uint IDs for Kelja fulfillment aggregate and operations
type TransactionMovementLine struct {
	ID                uint
	MovementID        uint
	ScannedLocationID uint
	QtyDone           int
	ScannedBy         uint
	CreatedAt         time.Time
}

type TransactionMovement struct {
	ID             uint      `db:"id"`
	TransactionID  uint      `db:"transaction_id"`
	ProductID      uint      `db:"product_id"`
	TargetQuantity int       `db:"target_quantity"`
	Status         string    `db:"status"` // PENDING, COMPLETED
	CreatedAt      time.Time `db:"created_at"`
	Lines          []*TransactionMovementLine
}

// keep: domain model uses uint IDs for Kelja fulfillment aggregate and operations
type StockTransaction struct {
	ID               uint      `db:"id"`
	TransactionNo    string    `db:"transaction_number"`
	ReferenceType    string    `db:"reference_type"`
	ReferenceID      string    `db:"reference_id"`
	AssignedBuilding string    `db:"assigned_building"`
	Status           string    `db:"status"` // PENDING, READY_TO_PICK, HOLD_REPLENISHMENT, OUT_OF_STOCK, COMPLETED, CANCELLED, VOID
	Notes            *string   `db:"notes"`
	CreatedBy        *uint     `db:"created_by"`
	CreatedAt        time.Time `db:"created_at"`
	UpdatedAt        time.Time `db:"updated_at"`
	Movements        []*TransactionMovement
}

func (st *StockTransaction) AddDemand(productID uint, targetQty int) error {
	if targetQty <= 0 {
		return ErrInvalidQuantity
	}
	st.Movements = append(st.Movements, &TransactionMovement{
		ProductID:      productID,
		TargetQuantity: targetQty,
		Status:         "PENDING",
		CreatedAt:      time.Now(),
	})
	return nil
}

func (st *StockTransaction) ProcessLine(movementID uint, scannedLoc *Location, qty int, scannedBy uint) error {
	if qty <= 0 {
		return ErrInvalidQuantity
	}

	// Guard Clause: Only allow processing from fulfillment source locations
	if !scannedLoc.IsFulfillmentSource {
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
		return errors.New("movement not found in this transaction")
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
		targetMove.Status = "COMPLETED"
	}

	if st.IsCompleted() {
		st.Status = "COMPLETED"
	}

	return nil
}

func (tm *TransactionMovement) IsCompleted() bool {
	totalQtyDone := 0
	for _, line := range tm.Lines {
		totalQtyDone += line.QtyDone
	}
	return totalQtyDone >= tm.TargetQuantity
}

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
	if reason != "" {
		st.Notes = &reason
	}
}

// CanBeReleased checks whether this transaction is currently in a held state eligible for release.
func (st *StockTransaction) CanBeReleased() bool {
	return st.Status == TransactionStatusHoldReplenishment || st.Status == TransactionStatusOutOfStock
}
