package domain

import (
	"errors"
	"time"
)

var (
	ErrInvalidQuantity        = errors.New("invalid quantity")
	ErrCrossBuildingFulfilment   = errors.New("cross building fulfilment is not allowed for this transaction")
	ErrInvalidLocationPurpose = errors.New("location purpose is not allowed for fulfilment")
)

type TransactionMovementLine struct {
	ID                uint
	MovementID        uint
	ScannedLocationID uint
	QtyDone           int
	ScannedBy         uint
	CreatedAt         time.Time
}

type TransactionMovement struct {
	ID             uint
	TransactionID  uint
	ProductID      uint
	TargetQuantity int
	Status         string // PENDING, COMPLETED
	CreatedAt      time.Time
	Lines          []*TransactionMovementLine
}

type StockTransaction struct {
	ID               uint
	TransactionNo    string
	ReferenceType    string
	ReferenceID      string
	AssignedBuilding string
	Status           string // PENDING, PROCESSING, COMPLETED, CANCELLED
	Notes            *string
	CreatedBy        *uint
	CreatedAt        time.Time
	UpdatedAt        time.Time
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

func (st *StockTransaction) FulfillLine(movementID uint, scannedLoc *Location, qty int, scannedBy uint) error {
	if qty <= 0 {
		return ErrInvalidQuantity
	}

	// Guard Clause: Prevent cross building fulfilment
	if scannedLoc.Building != st.AssignedBuilding {
		return ErrCrossBuildingFulfilment
	}

	// Guard Clause: Only allow fulfilment from WAREHOUSE or DISPLAY
	if scannedLoc.Purpose != "WAREHOUSE" && scannedLoc.Purpose != "DISPLAY" {
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

	if targetMove.IsFullyFulfilled() {
		targetMove.Status = "COMPLETED"
	}

	if st.IsFullyFulfilled() {
		st.Status = "COMPLETED"
	}

	return nil
}

func (tm *TransactionMovement) IsFullyFulfilled() bool {
	totalQtyDone := 0
	for _, line := range tm.Lines {
		totalQtyDone += line.QtyDone
	}
	return totalQtyDone >= tm.TargetQuantity
}

func (st *StockTransaction) IsFullyFulfilled() bool {
	for _, m := range st.Movements {
		if !m.IsFullyFulfilled() {
			return false
		}
	}
	return len(st.Movements) > 0
}
