package usecase

import (
	system_usecase "github.com/dps-wmhris/backend/internal/modules/system/application/usecase"
	"github.com/dps-wmhris/backend/internal/shared/database"

	catalog_port "github.com/dps-wmhris/backend/internal/modules/catalog/port"
	inventory_dto "github.com/dps-wmhris/backend/internal/modules/inventory/application/dto"

	"context"
	"errors"
	"fmt"
	"sort"
	"strings"

	"github.com/dps-wmhris/backend/internal/modules/inventory/domain"
	inventory_port "github.com/dps-wmhris/backend/internal/modules/inventory/port"

	"github.com/jmoiron/sqlx"
)

type pickingService struct {
	txManager    database.TransactionManager
	pickingRepo  inventory_port.PickingRepository
	locationRepo inventory_port.LocationRepository
	stockRepo    inventory_port.StockRepository
	jobService   system_usecase.JobService
	productRepo  catalog_port.ProductRepository
}

func NewPickingUseCase(
	txManager database.TransactionManager,
	pickingRepo inventory_port.PickingRepository,
	locationRepo inventory_port.LocationRepository,
	stockRepo inventory_port.StockRepository,
	jobService system_usecase.JobService,
	productRepo catalog_port.ProductRepository,
) inventory_port.PickingUseCase {
	return &pickingService{
		txManager:    txManager,
		pickingRepo:  pickingRepo,
		locationRepo: locationRepo,
		stockRepo:    stockRepo,
		jobService:   jobService,
		productRepo:  productRepo,
	}
}

func (s *pickingService) GetPendingItems(ctx context.Context) ([]inventory_dto.PendingPickingItemResponse, error) {
	return s.pickingRepo.GetPendingItems(ctx)
}

func (s *pickingService) GetHistoryItems(ctx context.Context, limit int) ([]inventory_dto.HistoryPickingItemResponse, error) {
	return s.pickingRepo.GetHistoryItems(ctx, limit)
}

func (s *pickingService) GetPickingDetail(ctx context.Context, pickingListID int) ([]inventory_dto.PickingListDetailResponse, error) {
	return s.pickingRepo.GetListDetails(ctx, pickingListID)
}

// ensureStockLocation re-validates stock or finds a new location if insufficient
func (s *pickingService) ensureStockLocation(
	ctx context.Context,
	productID int,
	qtyNeeded int,
	currentLocID *int,
	locationPurpose string,
) (*int, bool, error) {
	if currentLocID != nil {
		currentStock, err := s.locationRepo.GetStockAtLocation(ctx, productID, *currentLocID, true)
		if err != nil {
			return nil, false, err
		}
		if currentStock >= qtyNeeded {
			return currentLocID, false, nil
		}
	}

	// Find best location
	newLocID, err := s.locationRepo.FindBestStock(ctx, productID, qtyNeeded, locationPurpose)
	if err != nil {
		return nil, false, err
	}
	if newLocID != nil {
		newStock, err := s.locationRepo.GetStockAtLocation(ctx, productID, *newLocID, true)
		if err != nil {
			return nil, false, err
		}
		if newStock >= qtyNeeded {
			return newLocID, true, nil
		}
	}

	return nil, false, nil
}

func (s *pickingService) VoidPickingList(ctx context.Context, pickingListID int, userID int) error {
	return s.txManager.WithTransaction(ctx, func(ctx context.Context) error {
		itemsToRestock, err := s.pickingRepo.GetItemsToRestock(ctx, pickingListID)
		if err != nil {
			return err
		}

		for _, item := range itemsToRestock {
			if item.PickedFromLocationID != nil {
				err = s.locationRepo.IncrementStock(ctx, item.ProductID, *item.PickedFromLocationID, item.Quantity)
				if err != nil {
					return err
				}

				notes := fmt.Sprintf("Manual Void Picking List #%d", pickingListID)
				err = s.stockRepo.RecordMovement(ctx, &domain.StockMovement{
					ProductID:    item.ProductID,
					Quantity:     item.Quantity,
					ToLocationID: item.PickedFromLocationID,
					MovementType: "VOID_RESTOCK",
					UserID:       userID,
					Notes:        notes,
				})
				if err != nil {
					return err
				}
			}
		}

		affectedRows, err := s.pickingRepo.VoidHeader(ctx, pickingListID)
		if err != nil {
			return err
		}
		if affectedRows == 0 {
			return errors.New("picking list tidak ditemukan atau sudah dibatalkan")
		}

		err = s.pickingRepo.VoidItemsByListID(ctx, pickingListID)
		if err != nil {
			return err
		}

		return nil
	})
}

func (s *pickingService) RetryBackorders(ctx context.Context, pickingListID int) (string, error) {
	var resStr string
	err := s.txManager.WithTransaction(ctx, func(ctx context.Context) error {
		items, err := s.pickingRepo.GetUnfulfillableItems(ctx, pickingListID)
		if err != nil {
			return err
		}

		if len(items) == 0 {
			resStr = "Tidak ada item backorder untuk pesanan ini."
			return nil
		}

		header, err := s.pickingRepo.GetHeaderByID(ctx, pickingListID)
		if err != nil || header == nil {
			return errors.New("header picking list tidak ditemukan")
		}

		purpose := "DISPLAY"
		if header.LocationPurpose != nil {
			purpose = *header.LocationPurpose
		}

		recoveredCount := 0
		for _, item := range items {
			locID, err := s.locationRepo.FindBestStock(ctx, item.ProductID, item.Quantity, purpose)
			if err != nil {
				return err
			}
			if locID != nil {
				err = s.pickingRepo.UpdateSuggestedLocation(ctx, item.ID, locID)
				if err != nil {
					return err
				}
				err = s.pickingRepo.UpdateItemStatus(ctx, item.ID, "PENDING")
				if err != nil {
					return err
				}
				recoveredCount++
			}
		}

		if recoveredCount > 0 {
			resStr = fmt.Sprintf("Berhasil mendapatkan stok untuk %d dari %d item backorder.", recoveredCount, len(items))
			return nil
		}
		resStr = fmt.Sprintf("Stok masih belum tersedia untuk %d item.", len(items))
		return nil
	})
	return resStr, err
}

func (s *pickingService) RetryBackordersBatch(ctx context.Context, req inventory_dto.RetryBackordersBatchRequest) (string, error) {
	if len(req.PickingListIDs) == 0 {
		return "Tidak ada picking list yang dipilih.", nil
	}

	var resStr string
	err := s.txManager.WithTransaction(ctx, func(ctx context.Context) error {
		items, err := s.pickingRepo.GetPendingAndBackorderItems(ctx, req.PickingListIDs)
		if err != nil {
			return err
		}

		if len(items) == 0 {
			resStr = "Tidak ada item pending/backorder pada pesanan yang dipilih."
			return nil
		}

		recoveredCount := 0
		downgradedCount := 0

		for _, item := range items {
			header, err := s.pickingRepo.GetHeaderByID(ctx, item.PickingListID)
			if err != nil || header == nil {
				continue
			}
			purpose := "DISPLAY"
			if header.LocationPurpose != nil {
				purpose = *header.LocationPurpose
			}

			locID, isChanged, err := s.ensureStockLocation(ctx, item.ProductID, item.Quantity, item.SuggestedLocationID, purpose)
			if err != nil {
				return err
			}

			if locID != nil {
				if isChanged || item.Status == "BACKORDER" {
					if err := s.pickingRepo.UpdateSuggestedLocation(ctx, item.ID, locID); err != nil {
						return err
					}
					if item.Status == "BACKORDER" {
						if err := s.pickingRepo.UpdateItemStatus(ctx, item.ID, "PENDING"); err != nil {
							return err
						}
					}
					recoveredCount++
				}
			} else {
				if item.Status != "BACKORDER" || item.SuggestedLocationID != nil {
					if err := s.pickingRepo.UpdateSuggestedLocation(ctx, item.ID, nil); err != nil {
						return err
					}
					if err := s.pickingRepo.UpdateItemStatus(ctx, item.ID, "BACKORDER"); err != nil {
						return err
					}
					downgradedCount++
				}
			}
		}

		var msg []string
		if recoveredCount > 0 {
			msg = append(msg, fmt.Sprintf("Berhasil memulihkan %d item.", recoveredCount))
		}
		if downgradedCount > 0 {
			msg = append(msg, fmt.Sprintf("%d item kehabisan stok & menjadi BACKORDER.", downgradedCount))
		}

		if len(msg) == 0 {
			resStr = fmt.Sprintf("Stok untuk %d item dievaluasi dan tidak ada perubahan.", len(items))
			return nil
		}
		resStr = strings.Join(msg, " ")
		return nil
	})
	return resStr, err
}

func (s *pickingService) CompletePickingItems(ctx context.Context, req inventory_dto.CompletePickingRequest, userID int) (string, []string, error) {
	if len(req.Items) == 0 {
		return "", nil, errors.New("tidak ada item dipilih")
	}

	var resStr string
	var resErrs []string
	err := s.txManager.WithTransaction(ctx, func(ctx context.Context) error {
		ext := database.GetExt(ctx, nil)

		listIDMap := make(map[int]bool)
		var itemIDs []int
		for _, item := range req.Items {
			listIDMap[item.PickingListID] = true
			itemIDs = append(itemIDs, item.ID)
		}

		invoiceMap := make(map[int]string)
		purposeMap := make(map[int]string)
		var validationErrors []string
		invalidListIDs := make(map[int]bool)

		// SAFETY CHECKS
		for listID := range listIDMap {
			header, err := s.pickingRepo.GetHeaderByID(ctx, listID)
			if err != nil || header == nil {
				return fmt.Errorf("Data Picking List #%d tidak ditemukan", listID)
			}

			if header.OriginalInvoiceID != nil && strings.Contains(*header.OriginalInvoiceID, "_REV_") {
				return fmt.Errorf("Order %s telah direvisi! Mohon refresh halaman.", *header.OriginalInvoiceID)
			}

			if header.Status == "VOID" || header.Status == "CANCELLED" || header.Status == "CANCEL" {
				return fmt.Errorf("Order #%d telah dibatalkan.", listID)
			}

			unfulfillable, err := s.pickingRepo.GetUnfulfillableItems(ctx, listID)
			if err != nil {
				return err
			}
			if len(unfulfillable) > 0 {
				invalidListIDs[listID] = true
				for _, u := range unfulfillable {
					sku := "UNKNOWN"
					if u.OriginalSKU != nil {
						sku = *u.OriginalSKU
					}
					validationErrors = append(validationErrors, fmt.Sprintf("INV [%s] - SKU %s: Stok habis (Anti-Parsial).", *header.OriginalInvoiceID, sku))
				}
			}

			invoiceMap[listID] = *header.OriginalInvoiceID
			if header.LocationPurpose != nil {
				purposeMap[listID] = *header.LocationPurpose
			} else {
				purposeMap[listID] = "DISPLAY"
			}
		}

		dbItems, err := s.pickingRepo.GetItemsByIDs(ctx, itemIDs)
		if err != nil {
			return err
		}

		// Memory stock lock
		var uniqueProductIDs []int
		prodIDMap := make(map[int]bool)
		for _, item := range dbItems {
			if !prodIDMap[item.ProductID] {
				prodIDMap[item.ProductID] = true
				uniqueProductIDs = append(uniqueProductIDs, item.ProductID)
			}
		}
		sort.Ints(uniqueProductIDs)

		type StockInfo struct {
			LocationID int
			Quantity   int
			Purpose    string
		}
		stockMap := make(map[int][]*StockInfo)
		if len(uniqueProductIDs) > 0 {
			query, args, _ := sqlx.In(`
			SELECT sl.product_id, sl.location_id, sl.quantity, l.purpose
			FROM stock_locations sl
			JOIN locations l ON sl.location_id = l.id
			WHERE sl.product_id IN (?)
			FOR UPDATE
		`, uniqueProductIDs)
			query = ext.Rebind(query)

			type StockResult struct {
				ProductID  int    `db:"product_id"`
				LocationID int    `db:"location_id"`
				Quantity   int    `db:"quantity"`
				Purpose    string `db:"purpose"`
			}
			var stocks []StockResult
			if err := ext.SelectContext(ctx, &stocks, query, args...); err != nil {
				return err
			}

			for _, s := range stocks {
				info := &StockInfo{LocationID: s.LocationID, Quantity: s.Quantity, Purpose: s.Purpose}
				stockMap[s.ProductID] = append(stockMap[s.ProductID], info)
			}
		}

		type ExecPlan struct {
			ItemID        int
			ProductID     int
			Quantity      int
			PickingListID int
			FinalLocID    int
			IsChanged     bool
		}
		var executionPlan []ExecPlan

		for _, item := range dbItems {
			if invalidListIDs[item.PickingListID] {
				continue
			}
			purpose := purposeMap[item.PickingListID]
			sku := "Unknown"
			if item.OriginalSKU != nil {
				sku = *item.OriginalSKU
			}

			if item.Status != "PENDING" && item.Status != "BACKORDER" {
				validationErrors = append(validationErrors, fmt.Sprintf("INV [%s] - SKU %s: Item sudah diproses (Status: %s).", invoiceMap[item.PickingListID], sku, item.Status))
				continue
			}

			var finalLocID *int
			isChanged := false
			stocks := stockMap[item.ProductID]

			// 1. Check suggested
			if item.SuggestedLocationID != nil {
				for _, s := range stocks {
					if s.LocationID == *item.SuggestedLocationID && s.Quantity >= item.Quantity {
						id := *item.SuggestedLocationID
						finalLocID = &id
						s.Quantity -= item.Quantity // reserve
						break
					}
				}
			}

			// 2. Fallback
			if finalLocID == nil {
				for _, s := range stocks {
					if s.Purpose == purpose && s.Quantity >= item.Quantity {
						finalLocID = &s.LocationID
						isChanged = true
						s.Quantity -= item.Quantity
						break
					}
				}
			}

			if finalLocID == nil {
				validationErrors = append(validationErrors, fmt.Sprintf("INV [%s] - SKU %s: Stok habis di lokasi manapun.", invoiceMap[item.PickingListID], sku))
			} else {
				executionPlan = append(executionPlan, ExecPlan{
					ItemID:        item.ID,
					ProductID:     item.ProductID,
					Quantity:      item.Quantity,
					PickingListID: item.PickingListID,
					FinalLocID:    *finalLocID,
					IsChanged:     isChanged,
				})
			}
		}

		if len(validationErrors) > 0 {
			resStr = ""
			resErrs = validationErrors
			return errors.New("Sebagian pesanan gagal diproses karena masalah ketersediaan stok atau status.")
		}

		affectedListIDs := make(map[int]bool)
		processedCount := 0

		for _, plan := range executionPlan {
			if plan.IsChanged {
				if err := s.pickingRepo.UpdateSuggestedLocation(ctx, plan.ItemID, &plan.FinalLocID); err != nil {
					return err
				}
			}

			if err := s.pickingRepo.ValidateItem(ctx, plan.ItemID, plan.FinalLocID); err != nil {
				return err
			}

			if err := s.locationRepo.DeductStock(ctx, plan.ProductID, plan.FinalLocID, plan.Quantity); err != nil {
				return err
			}

			invoiceRef := invoiceMap[plan.PickingListID]
			notes := fmt.Sprintf("Sale Ref: %s (Item #%d)", invoiceRef, plan.ItemID)
			if err := s.stockRepo.RecordMovement(ctx, &domain.StockMovement{
				ProductID:      plan.ProductID,
				Quantity:       plan.Quantity,
				FromLocationID: &plan.FinalLocID,
				MovementType:   "SALE",
				UserID:         userID,
				Notes:          notes,
			}); err != nil {
				return err
			}

			affectedListIDs[plan.PickingListID] = true
			processedCount++
		}

		for listID := range affectedListIDs {
			count, err := s.pickingRepo.CountPendingItems(ctx, listID)
			if err != nil {
				return err
			}
			if count == 0 {
				if err := s.pickingRepo.ValidateHeader(ctx, listID); err != nil {
					return err
				}
			}
		}

		if len(validationErrors) > 0 {
			resStr = "Penyelesaian berhasil dengan beberapa error."
			resErrs = validationErrors
			return nil
		}
		resStr = fmt.Sprintf("Berhasil memproses %d item dari %d pesanan.", processedCount, len(affectedListIDs))
		return nil
	})
	return resStr, resErrs, err
}
