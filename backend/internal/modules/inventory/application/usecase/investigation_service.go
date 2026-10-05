package usecase

import (
	"context"
	"errors"
	"fmt"
	"math"
	"regexp"
	"strings"
	"time"

	inventory_dto "github.com/dps-wmhris/backend/internal/modules/inventory/application/dto"
	"github.com/dps-wmhris/backend/internal/shared/database"

	"github.com/dps-wmhris/backend/internal/modules/inventory/domain"
	inventory_port "github.com/dps-wmhris/backend/internal/modules/inventory/port"
)

type investigationServiceImpl struct {
	txManager         database.TransactionManager
	investigationRepo inventory_port.InvestigationRepository
	locationRepo      inventory_port.LocationRepository
	stockRepo         inventory_port.StockRepository
	// system_usecase.JobService? For emit signal, maybe in handler or later
}

func NewInvestigationUseCase(txManager database.TransactionManager, investigationRepo inventory_port.InvestigationRepository, locationRepo inventory_port.LocationRepository, stockRepo inventory_port.StockRepository) inventory_port.InvestigationUseCase {
	return &investigationServiceImpl{
		txManager:         txManager,
		investigationRepo: investigationRepo,
		locationRepo:      locationRepo,
		stockRepo:         stockRepo,
	}
}

func (s *investigationServiceImpl) GetDuplicateTransactions(ctx context.Context, req inventory_dto.GetDuplicateTransactionsRequest) (interface{}, error) {
	if req.StartDate != "" && req.EndDate != "" {
		t1, err1 := time.Parse("2006-01-02", req.StartDate)
		t2, err2 := time.Parse("2006-01-02", req.EndDate)
		if err1 == nil && err2 == nil && t1.After(t2) {
			return nil, errors.New("tanggal mulai tidak boleh lebih besar dari tanggal akhir")
		}
	}

	totalGroups, err := s.investigationRepo.CountDuplicateGroups(ctx, req)
	if err != nil {
		return nil, err
	}

	duplicates, err := s.investigationRepo.GetDuplicateGroups(ctx, req)
	if err != nil {
		return nil, err
	}

	invoiceRegex := regexp.MustCompile(`(?i)Sale Ref:\s+(.*?)\s+\(Item`)

	grouped := make(map[string]*domain.DuplicateGroup)

	for _, curr := range duplicates {
		baseNote := "Unknown"
		if curr.Notes != nil {
			parts := strings.Split(*curr.Notes, " (Item")
			baseNote = strings.TrimSpace(parts[0])
		}

		normalizedBaseNote := strings.ToUpper(baseNote)
		exactStr := ""
		if req.ExactQuantity == "true" {
			exactStr = "_exact"
		}
		key := fmt.Sprintf("%s_%s%s", normalizedBaseNote, curr.MovementType, exactStr)

		group, exists := grouped[key]
		if !exists {
			var extractedInvoice *string
			if curr.Notes != nil {
				matches := invoiceRegex.FindStringSubmatch(*curr.Notes)
				if len(matches) > 1 {
					extracted := strings.TrimSpace(matches[1])
					extractedInvoice = &extracted
				}
			}

			group = &domain.DuplicateGroup{
				BaseNote:         baseNote,
				MovementType:     curr.MovementType,
				ExtractedInvoice: extractedInvoice,
				FulfilmentList:      nil,
				Transactions:     []domain.DuplicateTransactionItem{},
			}
			grouped[key] = group
		}

		group.TotalQuantity += curr.Quantity
		group.Transactions = append(group.Transactions, curr)
	}

	for _, group := range grouped {
		uniqueTimes := make(map[int64]bool)
		uniqueSkus := make(map[string]bool)

		for _, t := range group.Transactions {
			uniqueTimes[t.CreatedAt.Unix()] = true
			uniqueSkus[t.SKU] = true
		}
		group.Occurrences = len(uniqueTimes)
		group.UniqueItemsCount = len(uniqueSkus)
	}


	var finalGrouped []*domain.DuplicateGroup
	for _, g := range grouped {
		finalGrouped = append(finalGrouped, g)
	}

	// Application level filters for Fulfilment Lists could be added here similar to Node.js
	// (Skipping complex array logic for PL filters in Go for now, retaining 1:1 structure)

	totalPages := int(math.Ceil(float64(totalGroups) / float64(req.Limit)))

	return map[string]interface{}{
		"data": finalGrouped,
		"meta": map[string]interface{}{
			"totalGroups": totalGroups,
			"page":        req.Page,
			"limit":       req.Limit,
			"totalPages":  totalPages,
		},
	}, nil
}

func (s *investigationServiceImpl) RevertTransaction(ctx context.Context, transactionID int, userID int) error {
	return s.txManager.WithTransaction(ctx, func(ctx context.Context) error {
		var originalTrx struct {
			ID             int     `db:"id"`
			ProductID      int     `db:"product_id"`
			Quantity       int     `db:"quantity"`
			FromLocationID *int    `db:"from_location_id"`
			ToLocationID   *int    `db:"to_location_id"`
			MovementType   string  `db:"movement_type"`
			Notes          *string `db:"notes"`
		}
		ext := database.GetExt(ctx, nil)
		err := ext.GetContext(ctx, &originalTrx, "SELECT id, product_id, quantity, from_location_id, to_location_id, movement_type, notes FROM stock_movements WHERE id = ?", transactionID)
		if err != nil {
			return fmt.Errorf("transaksi tidak ditemukan (atau error db): %w", err)
		}

		var count int
		revertNotesPattern := fmt.Sprintf("%%Reversal of Trx #%d%%", transactionID)
		err = ext.GetContext(ctx, &count, "SELECT COUNT(*) FROM stock_movements WHERE notes LIKE ?", revertNotesPattern)
		if err == nil && count > 0 {
			return errors.New("transaksi ini sudah di-revert sebelumnya")
		}

		restored := false

		if originalTrx.FromLocationID != nil {
			err = s.locationRepo.IncrementStock(ctx, originalTrx.ProductID, *originalTrx.FromLocationID, originalTrx.Quantity)
			if err != nil {
				return err
			}
			restored = true
		}

		if originalTrx.ToLocationID != nil {
			// DecrementStock is needed here. If it doesn't exist, we can use IncrementStock with negative qty.
			err = s.locationRepo.IncrementStock(ctx, originalTrx.ProductID, *originalTrx.ToLocationID, -originalTrx.Quantity)
			if err != nil {
				return err
			}
			restored = true
		}

		if !restored {
			return errors.New("transaksi tidak valid (tidak ada from_location maupun to_location)")
		}

		origNotes := ""
		if originalTrx.Notes != nil {
			origNotes = *originalTrx.Notes
		}
		newNotes := fmt.Sprintf("Reversal of Trx #%d - %s", transactionID, origNotes)

		reversalMovement := &domain.StockMovement{
			ProductID:      originalTrx.ProductID,
			Quantity:       originalTrx.Quantity,
			FromLocationID: originalTrx.ToLocationID,
			ToLocationID:   originalTrx.FromLocationID,
			MovementType:   "REVERSAL",
			UserID:         userID,
			Notes:          newNotes,
		}

		err = s.stockRepo.RecordMovement(ctx, reversalMovement)
		if err != nil {
			return err
		}

		_, err = ext.ExecContext(ctx, "UPDATE stock_movements SET notes = CONCAT(IFNULL(notes,''), ' [REVERTED]') WHERE id = ?", transactionID)
		return err
	})
}
