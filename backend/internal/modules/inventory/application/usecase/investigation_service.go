package usecase

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"math"
	"regexp"
	"strings"
	"time"

	inventory_dto "github.com/dps-wmhris/backend/internal/modules/inventory/application/dto"
	"github.com/dps-wmhris/backend/internal/modules/inventory/domain"
	inventory_port "github.com/dps-wmhris/backend/internal/modules/inventory/port"
	"github.com/dps-wmhris/backend/internal/shared/apperror"
	"github.com/dps-wmhris/backend/internal/shared/database"
)

var saleRefInvoiceRegex = regexp.MustCompile(`(?i)Sale Ref:\s+(.*?)\s+\(Item`)

type investigationServiceImpl struct {
	txManager         database.TransactionManager
	investigationRepo inventory_port.InvestigationRepository
	locationRepo      inventory_port.LocationRepository
	stockRepo         inventory_port.StockRepository
}

// NewInvestigationUseCase creates an InvestigationUseCase for duplicate movement analysis and atomic reversals.
func NewInvestigationUseCase(
	txManager database.TransactionManager,
	investigationRepo inventory_port.InvestigationRepository,
	locationRepo inventory_port.LocationRepository,
	stockRepo inventory_port.StockRepository,
) inventory_port.InvestigationUseCase {
	return &investigationServiceImpl{
		txManager:         txManager,
		investigationRepo: investigationRepo,
		locationRepo:      locationRepo,
		stockRepo:         stockRepo,
	}
}

func (s *investigationServiceImpl) GetDuplicateTransactions(ctx context.Context, req inventory_dto.GetDuplicateTransactionsRequest) (*domain.DuplicateTransactionsResponse, error) {
	if req.Page < 1 {
		req.Page = 1
	}
	if req.Limit < 1 {
		req.Limit = 10
	} else if req.Limit > 100 {
		req.Limit = 100
	}

	if req.StartDate != "" {
		t1, err := time.Parse("2006-01-02", req.StartDate)
		if err != nil {
			return nil, apperror.Validation("wms.investigation.err_date_range", "Format tanggal mulai tidak valid (YYYY-MM-DD).")
		}
		if req.EndDate != "" {
			t2, err := time.Parse("2006-01-02", req.EndDate)
			if err != nil {
				return nil, apperror.Validation("wms.investigation.err_date_range", "Format tanggal akhir tidak valid (YYYY-MM-DD).")
			}
			if t1.After(t2) {
				return nil, apperror.Validation("wms.investigation.err_date_range", "Tanggal mulai tidak boleh lebih besar dari tanggal akhir.")
			}
		}
	} else if req.EndDate != "" {
		if _, err := time.Parse("2006-01-02", req.EndDate); err != nil {
			return nil, apperror.Validation("wms.investigation.err_date_range", "Format tanggal akhir tidak valid (YYYY-MM-DD).")
		}
	}

	if req.IncludeNotes != "" {
		if _, err := regexp.Compile(req.IncludeNotes); err != nil {
			return nil, apperror.Validation("wms.investigation.err_invalid_regex", "Pola regex includeNotes tidak valid.")
		}
	}
	if req.ExcludeNotes != "" {
		if _, err := regexp.Compile(req.ExcludeNotes); err != nil {
			return nil, apperror.Validation("wms.investigation.err_invalid_regex", "Pola regex excludeNotes tidak valid.")
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

	grouped := make(map[string]*domain.DuplicateGroup)
	groupOrder := make([]string, 0)

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
				matches := saleRefInvoiceRegex.FindStringSubmatch(*curr.Notes)
				if len(matches) > 1 {
					extracted := strings.TrimSpace(matches[1])
					extractedInvoice = &extracted
				}
			}

			group = &domain.DuplicateGroup{
				BaseNote:         baseNote,
				MovementType:     curr.MovementType,
				ExtractedInvoice: extractedInvoice,
				FulfilmentList:   nil,
				Transactions:     []domain.DuplicateTransactionItem{},
			}
			grouped[key] = group
			groupOrder = append(groupOrder, key)
		}

		group.TotalQuantity += curr.Quantity
		group.Transactions = append(group.Transactions, curr)
	}

	// Preserve deterministic SQL ordering recorded in groupOrder
	finalGrouped := make([]*domain.DuplicateGroup, 0, len(groupOrder))
	for _, key := range groupOrder {
		group := grouped[key]
		uniqueTimes := make(map[int64]bool, len(group.Transactions))
		uniqueSkus := make(map[string]bool, len(group.Transactions))

		for _, t := range group.Transactions {
			uniqueTimes[t.CreatedAt.Unix()] = true
			uniqueSkus[t.SKU] = true
		}
		group.Occurrences = len(uniqueTimes)
		group.UniqueItemsCount = len(uniqueSkus)
		group.TotalTransaction = len(group.Transactions)
		finalGrouped = append(finalGrouped, group)
	}

	totalPages := int(math.Ceil(float64(totalGroups) / float64(req.Limit)))

	return &domain.DuplicateTransactionsResponse{
		Data: finalGrouped,
		Meta: domain.DuplicateTransactionsMeta{
			TotalGroups: totalGroups,
			Page:        req.Page,
			Limit:       req.Limit,
			TotalPages:  totalPages,
		},
	}, nil
}

func (s *investigationServiceImpl) RevertTransaction(ctx context.Context, transactionID int, userID int) error {
	if transactionID <= 0 {
		return apperror.Validation("wms.investigation.err_invalid_transaction", "ID transaksi tidak valid")
	}

	return s.txManager.WithTransaction(ctx, func(txCtx context.Context) error {
		originalTrx, err := s.investigationRepo.GetMovementByIDForRevert(txCtx, transactionID)
		if err != nil {
			if errors.Is(err, sql.ErrNoRows) {
				return apperror.NotFound("wms.transaction.err_not_found", "transaksi tidak ditemukan")
			}
			return err
		}
		if originalTrx == nil {
			return apperror.NotFound("wms.transaction.err_not_found", "transaksi tidak ditemukan")
		}

		if strings.EqualFold(strings.TrimSpace(originalTrx.MovementType), "REVERSAL") {
			return apperror.Validation("wms.investigation.err_cannot_revert_reversal", "transaksi bertipe REVERSAL tidak dapat di-revert kembali")
		}

		origNotes := ""
		if originalTrx.Notes != nil {
			origNotes = *originalTrx.Notes
		}
		if strings.Contains(origNotes, "[REVERTED]") {
			return apperror.Conflict("wms.investigation.err_already_reverted", "transaksi ini sudah di-revert sebelumnya")
		}

		alreadyReverted, err := s.investigationRepo.IsMovementReverted(txCtx, transactionID)
		if err != nil {
			return err
		}
		if alreadyReverted {
			return apperror.Conflict("wms.investigation.err_already_reverted", "transaksi ini sudah di-revert sebelumnya")
		}

		if originalTrx.FromLocationID == nil && originalTrx.ToLocationID == nil {
			return apperror.Validation("wms.investigation.err_invalid_transaction", "transaksi tidak valid (tidak ada from_location maupun to_location)")
		}
		if originalTrx.Quantity <= 0 {
			return apperror.Validation("wms.investigation.err_invalid_transaction", "transaksi tidak valid (jumlah mutasi harus positif)")
		}

		// Deduct destination stock first with FOR UPDATE lock check to prevent negative physical balances
		if originalTrx.ToLocationID != nil {
			currQty, err := s.locationRepo.GetStockAtLocation(txCtx, originalTrx.ProductID, *originalTrx.ToLocationID, true)
			if err != nil {
				return err
			}
			if currQty < originalTrx.Quantity {
				return apperror.Validation(
					"wms.stock.err_insufficient_stock",
					fmt.Sprintf("Stok di lokasi tujuan tidak mencukupi untuk reversal (tersedia: %d, dibutuhkan: %d)", currQty, originalTrx.Quantity),
					map[string]any{"available": currQty, "requested": originalTrx.Quantity},
				)
			}
			if err := s.locationRepo.DeductStock(txCtx, originalTrx.ProductID, *originalTrx.ToLocationID, originalTrx.Quantity); err != nil {
				return err
			}
		}

		// Restore origin stock
		if originalTrx.FromLocationID != nil {
			if err := s.locationRepo.IncrementStock(txCtx, originalTrx.ProductID, *originalTrx.FromLocationID, originalTrx.Quantity); err != nil {
				return err
			}
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

		if err := s.stockRepo.RecordMovement(txCtx, reversalMovement); err != nil {
			return err
		}

		return s.investigationRepo.MarkMovementReverted(txCtx, transactionID)
	})
}
