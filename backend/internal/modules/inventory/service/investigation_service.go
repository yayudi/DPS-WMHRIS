package service

import (
	"context"
	"errors"
	"fmt"
	"math"
	"regexp"
	"strings"
	"time"

	inventory_model "github.com/dps-wmhris/backend/internal/modules/inventory/model"
	inventory_repo "github.com/dps-wmhris/backend/internal/modules/inventory/repository"

	"github.com/dps-wmhris/backend/internal/dto"
	"github.com/dps-wmhris/backend/internal/shared/database"
	"github.com/jmoiron/sqlx"
)

type InvestigationService interface {
	GetDuplicateTransactions(ctx context.Context, req dto.GetDuplicateTransactionsRequest) (interface{}, error)
	RevertTransaction(ctx context.Context, transactionID int, userID int) error
}

type investigationServiceImpl struct {
	db                *sqlx.DB
	investigationRepo inventory_repo.InvestigationRepository
	locationRepo      inventory_repo.LocationRepository
	stockRepo         inventory_repo.StockRepository
	// global_service.JobService? For emit signal, maybe in handler or later
}

func NewInvestigationService(db *sqlx.DB, investigationRepo inventory_repo.InvestigationRepository, locationRepo inventory_repo.LocationRepository, stockRepo inventory_repo.StockRepository) InvestigationService {
	return &investigationServiceImpl{
		db:                db,
		investigationRepo: investigationRepo,
		locationRepo:      locationRepo,
		stockRepo:         stockRepo,
	}
}

func (s *investigationServiceImpl) GetDuplicateTransactions(ctx context.Context, req dto.GetDuplicateTransactionsRequest) (interface{}, error) {
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

	invoiceSet := make(map[string]bool)
	itemIdSet := make(map[int]bool)
	invoiceRegex := regexp.MustCompile(`(?i)Sale Ref:\s+(.*?)\s+\(Item`)

	grouped := make(map[string]*inventory_model.DuplicateGroup)

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
					invoiceSet[extracted] = true
				}
			}

			group = &inventory_model.DuplicateGroup{
				BaseNote:         baseNote,
				MovementType:     curr.MovementType,
				ExtractedInvoice: extractedInvoice,
				PickingList:      nil,
				Transactions:     []inventory_model.DuplicateTransactionItem{},
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

	var pickingDetails []map[string]interface{}

	if len(invoiceSet) > 0 {
		var invoiceIds []string
		for id := range invoiceSet {
			invoiceIds = append(invoiceIds, id)
		}
		details, err := s.investigationRepo.FindPickingListDetailsByInvoices(ctx, invoiceIds)
		if err == nil {
			pickingDetails = append(pickingDetails, details...)
		}
	}

	if len(itemIdSet) > 0 {
		var itemIds []int
		for id := range itemIdSet {
			itemIds = append(itemIds, id)
		}
		details, err := s.investigationRepo.FindPickingListDetailsByItemIds(ctx, itemIds)
		if err == nil {
			pickingDetails = append(pickingDetails, details...)
		}
	}

	if len(pickingDetails) > 0 {
		pickingLists := make(map[int]*inventory_model.PickingListDetail)
		pickingByInvoice := make(map[string]*inventory_model.PickingListDetail)

		for _, row := range pickingDetails {
			listIdInt64 := row["picking_list_id"].(int64)
			listId := int(listIdInt64)

			if _, ok := pickingLists[listId]; !ok {
				var ms, sn *string
				if v, ok := row["marketplace_status"].(string); ok {
					ms = &v
				}
				if v, ok := row["shop_name"].(string); ok {
					sn = &v
				}

				origInvoice := row["original_invoice_id"].(string)

				// handle time parsing appropriately, skipping precise extraction for brevity if needed
				var orderDate time.Time
				if t, ok := row["order_date"].(time.Time); ok {
					orderDate = t
				} else if s, ok := row["order_date"].(string); ok {
					orderDate, _ = time.Parse(time.RFC3339, s)
				}

				pickingLists[listId] = &inventory_model.PickingListDetail{
					ID:                listId,
					OriginalInvoiceID: origInvoice,
					CustomerName:      row["customer_name"].(string),
					Source:            row["source"].(string),
					OrderDate:         orderDate,
					Status:            row["list_status"].(string),
					MarketplaceStatus: ms,
					ShopName:          sn,
					Items:             []inventory_model.PickingListDetailItem{},
				}
				pickingByInvoice[origInvoice] = pickingLists[listId]
			}

			item := inventory_model.PickingListDetailItem{
				ItemID:      int(row["item_id"].(int64)),
				ProductID:   int(row["product_id"].(int64)),
				OriginalSKU: row["original_sku"].(string),
				ProductName: row["product_name"].(string),
				Quantity:    int(row["quantity"].(int64)),
				Status:      row["item_status"].(string),
			}
			pickingLists[listId].Items = append(pickingLists[listId].Items, item)
		}

		for _, group := range grouped {
			if group.ExtractedInvoice != nil {
				if pl, ok := pickingByInvoice[*group.ExtractedInvoice]; ok {
					group.PickingList = pl
				}
			}
		}
	}

	var finalGrouped []*inventory_model.DuplicateGroup
	for _, g := range grouped {
		finalGrouped = append(finalGrouped, g)
	}

	// Application level filters for Picking Lists could be added here similar to Node.js
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
	return database.WithTransaction(s.db, ctx, func(tx *sqlx.Tx) error {
		var originalTrx struct {
			ID             int     `db:"id"`
			ProductID      int     `db:"product_id"`
			Quantity       int     `db:"quantity"`
			FromLocationID *int    `db:"from_location_id"`
			ToLocationID   *int    `db:"to_location_id"`
			MovementType   string  `db:"movement_type"`
			Notes          *string `db:"notes"`
		}
		err := tx.GetContext(ctx, &originalTrx, "SELECT id, product_id, quantity, from_location_id, to_location_id, movement_type, notes FROM stock_movements WHERE id = ?", transactionID)
		if err != nil {
			return fmt.Errorf("transaksi tidak ditemukan (atau error db): %w", err)
		}

		var count int
		revertNotesPattern := fmt.Sprintf("%%Reversal of Trx #%d%%", transactionID)
		err = tx.GetContext(ctx, &count, "SELECT COUNT(*) FROM stock_movements WHERE notes LIKE ?", revertNotesPattern)
		if err == nil && count > 0 {
			return errors.New("transaksi ini sudah di-revert sebelumnya")
		}

		restored := false

		if originalTrx.FromLocationID != nil {
			err = s.locationRepo.IncrementStock(ctx, tx, originalTrx.ProductID, *originalTrx.FromLocationID, originalTrx.Quantity)
			if err != nil {
				return err
			}
			restored = true
		}

		if originalTrx.ToLocationID != nil {
			// DecrementStock is needed here. If it doesn't exist, we can use IncrementStock with negative qty.
			err = s.locationRepo.IncrementStock(ctx, tx, originalTrx.ProductID, *originalTrx.ToLocationID, -originalTrx.Quantity)
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

		reversalMovement := &inventory_model.StockMovement{
			ProductID:      originalTrx.ProductID,
			Quantity:       originalTrx.Quantity,
			FromLocationID: originalTrx.ToLocationID,
			ToLocationID:   originalTrx.FromLocationID,
			MovementType:   "REVERSAL",
			UserID:         userID,
			Notes:          newNotes,
		}

		err = s.stockRepo.RecordMovement(ctx, tx, reversalMovement)
		if err != nil {
			return err
		}

		_, err = tx.ExecContext(ctx, "UPDATE stock_movements SET notes = CONCAT(IFNULL(notes,''), ' [REVERTED]') WHERE id = ?", transactionID)
		return err
	})
}
