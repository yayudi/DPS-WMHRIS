package usecase

import (
	catalog_domain "github.com/dps-wmhris/backend/internal/modules/catalog/domain"
	catalog_port "github.com/dps-wmhris/backend/internal/modules/catalog/port"
	inventory_dto "github.com/dps-wmhris/backend/internal/modules/inventory/application/dto"
	"github.com/dps-wmhris/backend/internal/modules/inventory/domain"
	inventory_port "github.com/dps-wmhris/backend/internal/modules/inventory/port"
	system_usecase "github.com/dps-wmhris/backend/internal/modules/system/application/usecase"
	"github.com/dps-wmhris/backend/internal/shared/database"
	"github.com/dps-wmhris/backend/internal/shared/eventbus"

	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"sort"
	"strings"
	"time"

	"github.com/jmoiron/sqlx"
)

type fulfilmentService struct {
	txManager    database.TransactionManager
	fulfilmentRepo  inventory_port.FulfilmentRepository
	locationRepo inventory_port.LocationRepository
	stockRepo    inventory_port.StockRepository
	jobService   system_usecase.JobService
	productRepo  catalog_port.ProductRepository
	keljaClient  inventory_port.KeljaERPClient
	eventBus     eventbus.EventBus
}

func NewFulfilmentUseCase(
	txManager database.TransactionManager,
	fulfilmentRepo inventory_port.FulfilmentRepository,
	locationRepo inventory_port.LocationRepository,
	stockRepo inventory_port.StockRepository,
	jobService system_usecase.JobService,
	productRepo catalog_port.ProductRepository,
	keljaClient inventory_port.KeljaERPClient,
	eventBus eventbus.EventBus,
) inventory_port.FulfilmentUseCase {
	return &fulfilmentService{
		txManager:    txManager,
		fulfilmentRepo:  fulfilmentRepo,
		locationRepo: locationRepo,
		stockRepo:    stockRepo,
		jobService:   jobService,
		productRepo:  productRepo,
		keljaClient:  keljaClient,
		eventBus:     eventBus,
	}
}

func (s *fulfilmentService) GetPendingFilterOptions(ctx context.Context) (inventory_dto.PendingFilterOptionsResponse, error) {
	return s.fulfilmentRepo.GetPendingFilterOptions(ctx)
}

func (s *fulfilmentService) GetPendingItems(ctx context.Context, filter inventory_dto.PendingFulfilmentFilter) ([]inventory_dto.PendingFulfilmentItemResponse, int, error) {
	return s.fulfilmentRepo.GetPendingItems(ctx, filter)
}

func (s *fulfilmentService) GetHistoryItems(ctx context.Context, limit int) ([]inventory_dto.HistoryFulfilmentItemResponse, error) {
	return s.fulfilmentRepo.GetHistoryItems(ctx, limit)
}

func (s *fulfilmentService) GetFulfilmentDetail(ctx context.Context, fulfilmentListID int) ([]inventory_dto.FulfilmentListDetailResponse, error) {
	return s.fulfilmentRepo.GetListDetails(ctx, fulfilmentListID)
}

// ensureStockLocation re-validates stock or finds a new location if insufficient
func (s *fulfilmentService) ensureStockLocation(
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

func (s *fulfilmentService) VoidFulfilmentList(ctx context.Context, fulfilmentListID int, userID int) error {
	return s.txManager.WithTransaction(ctx, func(ctx context.Context) error {
		itemsToRestock, err := s.fulfilmentRepo.GetItemsToRestock(ctx, fulfilmentListID)
		if err != nil {
			return err
		}

		for _, item := range itemsToRestock {
			if item.PickedFromLocationID != nil {
				err = s.locationRepo.IncrementStock(ctx, item.ProductID, *item.PickedFromLocationID, item.Quantity)
				if err != nil {
					return err
				}

				notes := fmt.Sprintf("Manual Void Fulfilment List #%d", fulfilmentListID)
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

		affectedRows, err := s.fulfilmentRepo.VoidHeader(ctx, fulfilmentListID)
		if err != nil {
			return err
		}
		if affectedRows == 0 {
			return errors.New("fulfilment list tidak ditemukan atau sudah dibatalkan")
		}

		err = s.fulfilmentRepo.VoidItemsByListID(ctx, fulfilmentListID)
		if err != nil {
			return err
		}

		return nil
	})
}

func (s *fulfilmentService) RetryBackorders(ctx context.Context, fulfilmentListID int) (string, error) {
	var resStr string
	err := s.txManager.WithTransaction(ctx, func(ctx context.Context) error {
		items, err := s.fulfilmentRepo.GetUnfulfillableItems(ctx, fulfilmentListID)
		if err != nil {
			return err
		}

		if len(items) == 0 {
			resStr = "Tidak ada item backorder untuk pesanan ini."
			return nil
		}

		header, err := s.fulfilmentRepo.GetHeaderByID(ctx, fulfilmentListID)
		if err != nil || header == nil {
			return errors.New("header fulfilment list tidak ditemukan")
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
				err = s.fulfilmentRepo.UpdateSuggestedLocation(ctx, item.ID, locID)
				if err != nil {
					return err
				}
				err = s.fulfilmentRepo.UpdateItemStatus(ctx, item.ID, "READY TO PICK")
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

func (s *fulfilmentService) AutoRecoverBackorderByProductID(ctx context.Context, productID int) error {
	return s.txManager.WithTransaction(ctx, func(txCtx context.Context) error {
		items, err := s.fulfilmentRepo.GetUnfulfillableItemsByProductID(txCtx, productID)
		if err != nil {
			return err
		}
		if len(items) == 0 {
			return nil
		}
		
		for _, item := range items {
			header, err := s.fulfilmentRepo.GetHeaderByID(txCtx, item.FulfilmentListID)
			if err != nil || header == nil {
				continue // Skip if header not found
			}
			
			purpose := "DISPLAY"
			if header.LocationPurpose != nil {
				purpose = *header.LocationPurpose
			}

			locID, err := s.locationRepo.FindBestStock(txCtx, item.ProductID, item.Quantity, purpose)
			if err != nil {
				continue // skip error
			}
			if locID != nil {
				err = s.fulfilmentRepo.UpdateSuggestedLocation(txCtx, item.ID, locID)
				if err != nil {
					return err
				}
				err = s.fulfilmentRepo.UpdateItemStatus(txCtx, item.ID, "READY TO PICK")
				if err != nil {
					return err
				}
				// Reserve stock to prevent other items taking it
				err = s.locationRepo.ReserveStock(txCtx, item.ProductID, *locID, item.Quantity)
				if err != nil {
					return err
				}
			} else {
				// No more stock available for this product, break early to save processing
				break
			}
		}
		return nil
	})
}

func (s *fulfilmentService) RetryBackordersBatch(ctx context.Context, req inventory_dto.RetryBackordersBatchRequest) (string, error) {
	if len(req.FulfilmentListIDs) == 0 {
		return "Tidak ada fulfilment list yang dipilih.", nil
	}

	var resStr string
	err := s.txManager.WithTransaction(ctx, func(ctx context.Context) error {
		items, err := s.fulfilmentRepo.GetPendingAndBackorderItems(ctx, req.FulfilmentListIDs)
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
			header, err := s.fulfilmentRepo.GetHeaderByID(ctx, item.FulfilmentListID)
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
					if err := s.fulfilmentRepo.UpdateSuggestedLocation(ctx, item.ID, locID); err != nil {
						return err
					}
					if item.Status == "BACKORDER" {
						if err := s.fulfilmentRepo.UpdateItemStatus(ctx, item.ID, "PENDING"); err != nil {
							return err
						}
					}
					recoveredCount++
				}
			} else {
				if item.Status != "BACKORDER" || item.SuggestedLocationID != nil {
					if err := s.fulfilmentRepo.UpdateSuggestedLocation(ctx, item.ID, nil); err != nil {
						return err
					}
					if err := s.fulfilmentRepo.UpdateItemStatus(ctx, item.ID, "BACKORDER"); err != nil {
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

func (s *fulfilmentService) CompleteFulfilmentItems(ctx context.Context, req inventory_dto.CompleteFulfilmentRequest, userID int) (string, []string, error) {
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
			listIDMap[item.FulfilmentListID] = true
			itemIDs = append(itemIDs, item.ID)
		}

		invoiceMap := make(map[int]string)
		purposeMap := make(map[int]string)
		var validationErrors []string
		invalidListIDs := make(map[int]bool)

		// SAFETY CHECKS
		for listID := range listIDMap {
			header, err := s.fulfilmentRepo.GetHeaderByID(ctx, listID)
			if err != nil || header == nil {
				return fmt.Errorf("Data Fulfilment List #%d tidak ditemukan", listID)
			}

			if header.OriginalInvoiceID != nil && strings.Contains(*header.OriginalInvoiceID, "_REV_") {
				return fmt.Errorf("Order %s telah direvisi! Mohon refresh halaman.", *header.OriginalInvoiceID)
			}

			if header.Status == "VOID" || header.Status == "CANCELLED" || header.Status == "CANCEL" {
				return fmt.Errorf("Order #%d telah dibatalkan.", listID)
			}

			unfulfillable, err := s.fulfilmentRepo.GetUnfulfillableItems(ctx, listID)
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

		dbItems, err := s.fulfilmentRepo.GetItemsByIDs(ctx, itemIDs)
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
			SELECT sl.product_id, sl.location_id, sl.quantity, COALESCE(l.purpose, '') as purpose
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
			log.Printf("stocks: %+v", stocks)
			log.Println("stocks:", stocks)

			for _, s := range stocks {
				info := &StockInfo{LocationID: s.LocationID, Quantity: s.Quantity, Purpose: s.Purpose}
				stockMap[s.ProductID] = append(stockMap[s.ProductID], info)
			}
		}

		type ExecPlan struct {
			ItemID        int
			ProductID     int
			Quantity      int
			FulfilmentListID int
			FinalLocID    int
			IsChanged     bool
		}
		var executionPlan []ExecPlan

		for _, item := range dbItems {
			if invalidListIDs[item.FulfilmentListID] {
				continue
			}
			purpose := purposeMap[item.FulfilmentListID]
			sku := "Unknown"
			if item.OriginalSKU != nil {
				sku = *item.OriginalSKU
			}

			allowedStatuses := []string{"PENDING", "BACKORDER", "READY TO PICK"}
			if req.Action == "pack" {
				allowedStatuses = []string{"PICKED", "VALIDATED", "READY TO PACK"}
			} else if req.Action == "ship" {
				allowedStatuses = []string{"PACKED", "READY TO SHIP"}
			} else if req.Action == "force_complete" {
				allowedStatuses = []string{"PENDING", "BACKORDER", "READY TO PICK", "PICKED", "VALIDATED", "READY TO PACK", "PACKED", "READY TO SHIP"}
			}

			isValidStatus := false
			for _, s := range allowedStatuses {
				if item.Status == s {
					isValidStatus = true
					break
				}
			}

			if !isValidStatus {
				validationErrors = append(validationErrors, fmt.Sprintf("INV [%s] - SKU %s: Item tidak dapat diproses (Status: %s).", invoiceMap[item.FulfilmentListID], sku, item.Status))
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
					log.Printf("Fallback check - SKU %s: comparing s.Purpose '%s' with purpose '%s', s.Qty %d >= item.Qty %d", sku, s.Purpose, purpose, s.Quantity, item.Quantity)
					if s.Purpose == purpose && s.Quantity >= item.Quantity {
						finalLocID = &s.LocationID
						isChanged = true
						s.Quantity -= item.Quantity
						break
					}
				}
			}

			if finalLocID == nil {
				log.Printf("Failed to find finalLocID for SKU %s. purpose: %s, stocks available: %+v", sku, purpose, stocks)
				validationErrors = append(validationErrors, fmt.Sprintf("INV [%s] - SKU %s: Stok habis di lokasi manapun.", invoiceMap[item.FulfilmentListID], sku))
			} else {
				executionPlan = append(executionPlan, ExecPlan{
					ItemID:        item.ID,
					ProductID:     item.ProductID,
					Quantity:      item.Quantity,
					FulfilmentListID: item.FulfilmentListID,
					FinalLocID:    *finalLocID,
					IsChanged:     isChanged,
				})
			}
		}

		if len(validationErrors) > 0 {
			log.Printf("Validation errors: %v", validationErrors)
			resStr = ""
			resErrs = validationErrors
			return errors.New("Sebagian pesanan gagal diproses karena masalah ketersediaan stok atau status.")
		}

		affectedListIDs := make(map[int]bool)
		processedCount := 0

		for _, plan := range executionPlan {
			if plan.IsChanged {
				if err := s.fulfilmentRepo.UpdateSuggestedLocation(ctx, plan.ItemID, &plan.FinalLocID); err != nil {
					return err
				}
			}

			targetItemStatus := "ON DELIVERY"
			isFinalAction := true
			if req.Action == "pick" {
				targetItemStatus = "READY TO PACK"
				isFinalAction = false
			} else if req.Action == "pack" {
				targetItemStatus = "READY TO SHIP"
				isFinalAction = false
			} else if req.Action == "ship" || req.Action == "force_complete" || req.Action == "" {
				targetItemStatus = "ON DELIVERY"
				isFinalAction = true
			}

			if err := s.fulfilmentRepo.ValidateItem(ctx, plan.ItemID, plan.FinalLocID, targetItemStatus); err != nil {
				return err
			}

			if isFinalAction {
				if err := s.locationRepo.DeductStock(ctx, plan.ProductID, plan.FinalLocID, plan.Quantity); err != nil {
					return err
				}

				invoiceRef := invoiceMap[plan.FulfilmentListID]
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
			}

			affectedListIDs[plan.FulfilmentListID] = true
			processedCount++
		}

		for listID := range affectedListIDs {
			countStatuses := []string{"PENDING", "BACKORDER", "READY TO PICK"}
			if req.Action == "pack" {
				countStatuses = append(countStatuses, "PICKED", "VALIDATED", "READY TO PACK")
			} else if req.Action == "ship" || req.Action == "force_complete" {
				countStatuses = append(countStatuses, "PICKED", "VALIDATED", "READY TO PACK", "PACKED", "READY TO SHIP")
			}

			count, err := s.fulfilmentRepo.CountPendingItems(ctx, listID, countStatuses...)
			if err != nil {
				return err
			}
			targetHeaderStatus := "ON DELIVERY"
			if req.Action == "pick" {
				targetHeaderStatus = "READY TO PACK"
			} else if req.Action == "pack" {
				targetHeaderStatus = "READY TO SHIP"
			}

			if count == 0 {
				if err := s.fulfilmentRepo.ValidateHeader(ctx, listID, targetHeaderStatus); err != nil {
					return err
				}
				if targetHeaderStatus == "ON DELIVERY" && s.eventBus != nil {
					header, err := s.fulfilmentRepo.GetHeaderByID(ctx, listID)
					if err == nil && header != nil && header.OriginalInvoiceID != nil {
						payload := map[string]interface{}{
							"list_id":             listID,
							"original_invoice_id": *header.OriginalInvoiceID,
							"source":              header.Source,
						}
						if header.ExpeditionID != nil {
							payload["expedition_id"] = *header.ExpeditionID
						}
						if header.AWB != nil {
							payload["awb"] = *header.AWB
						}
						s.eventBus.Publish(ctx, eventbus.Event{
							Type:       "FulfillmentCompleted",
							Payload:    payload,
							UserID:     userID,
							OccurredAt: time.Now(),
						})
					}
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

func (s *fulfilmentService) ProcessKeljaSync(ctx context.Context, jobID int, userID int) error {
	log.Printf("[ProcessKeljaSync] Job %d starting", jobID)
	s.jobService.UpdateImportJobStatus(ctx, jobID, "PROCESSING")

	list, err := s.keljaClient.FetchAllFulfillments(ctx)
	if err != nil {
		log.Printf("[ProcessKeljaSync] Job %d failed to fetch fulfillments: %v", jobID, err)
		s.jobService.UpdateImportJobStatusWithSummary(ctx, jobID, "FAILED", fmt.Sprintf("Failed to fetch list: %v", err))
		return err
	}

	if len(list) == 0 {
		log.Printf("[ProcessKeljaSync] Job %d found no pending fulfillments in Kelja", jobID)
		s.jobService.UpdateImportJobStatusWithSummary(ctx, jobID, "COMPLETED", "No pending fulfillments found in Kelja")
		return nil
	}

	log.Printf("[ProcessKeljaSync] Job %d fetched %d fulfillments from Kelja", jobID, len(list))
	successCount := 0
	errorCount := 0
	
	type logDetail struct {
		KeljaID   int    `json:"kelja_id"`
		InvoiceNo string `json:"invoice_no"`
		Status    string `json:"status"`
		Error     string `json:"error,omitempty"`
	}
	var logs []logDetail

	for i, f := range list {
		s.jobService.UpdateImportJobProgress(ctx, jobID, (i*100)/len(list), 100)
		
		keljaIDFloat, ok := f["id"].(float64)
		if !ok { continue }
		keljaID := int(keljaIDFloat)
		
		invoiceNo, _ := f["code"].(string)
		
		fStatusObj, _ := f["fulfillment_status"].(map[string]interface{})
		fStatusDesc, _ := fStatusObj["description"].(string)
		if fStatusDesc != "READY TO PICK" {
			logs = append(logs, logDetail{
				KeljaID:   keljaID,
				InvoiceNo: invoiceNo,
				Status:    "SKIPPED",
				Error:     fmt.Sprintf("Status is %s, not READY TO PICK", fStatusDesc),
			})
			continue
		}

		// Dedup: check if invoice_no already exists in WMS
		if invoiceNo != "" {
			exists, err := s.fulfilmentRepo.ExistsByInvoiceNo(ctx, invoiceNo)
			if err != nil {
				log.Printf("[KeljaSync] Error checking dedup for %s: %v", invoiceNo, err)
			}
			if exists {
				logs = append(logs, logDetail{
					KeljaID:   keljaID,
					InvoiceNo: invoiceNo,
					Status:    "SKIPPED",
					Error:     "Already exists in WMS",
				})
				continue
			}
		}

		detail, err := s.keljaClient.FetchFulfillmentDetail(ctx, keljaID)
		if err != nil {
			errorCount++
			logs = append(logs, logDetail{
				KeljaID:   keljaID,
				InvoiceNo: invoiceNo,
				Status:    "FAILED",
				Error:     fmt.Sprintf("Failed to fetch detail: %v", err),
			})
			continue
		}

		err = s.txManager.WithTransaction(ctx, func(txCtx context.Context) error {
			isOnlineFloat, _ := detail["is_online"].(float64)
			isOnline := int(isOnlineFloat)

			var source string
			var shopName string
			var syncOrderTpID string
			
			if isOnline == 1 {
				syncPlatformName, _ := detail["sync_platform_name"].(string)
				syncStoreTpName, _ := detail["sync_store_tp_name"].(string)
				syncOrderTpID, _ = detail["sync_order_tp_id"].(string)
				source = syncPlatformName
				shopName = syncStoreTpName
			} else {
				source = "Offline"
				salesName := ""
				if salesObj, ok := detail["sales"].(map[string]interface{}); ok && salesObj != nil {
					salesName, _ = salesObj["name"].(string)
				}
				shopName = salesName
			}

			if source == "" {
				source = "Offline"
			}
			if shopName == "" {
				shopName = "Unknown"
			}

			status := "READY TO PICK"
			var marketplaceStatus *string

			if isOnline == 1 {
				onlineStatusMap := map[int]string{
					159: "WAITING APPROVAL",
					160: "WAITING COLLECTED",
					161: "WAITING FULFILLED",
					162: "WAITING CANCELLATION",
					163: "WAITING RETURN / REFUND",
					164: "CANCELLED",
					165: "RETURNED / REFUNDED",
					166: "FULFILLED",
				}
				if osIDFloat, ok := detail["online_status_id"].(float64); ok {
					if mappedStatus, exists := onlineStatusMap[int(osIDFloat)]; exists {
						marketplaceStatus = &mappedStatus
					}
				}
				if marketplaceStatus == nil {
					fallback := "PENDING"
					marketplaceStatus = &fallback
				}
			}

			contactName, _ := detail["contact_name"].(string)
			
			tDate, _ := detail["transaction_date"].(string)
			var orderDate *time.Time
			if tDate != "" {
				parsed, err := time.Parse(time.RFC3339, tDate)
				if err == nil {
					orderDate = &parsed
				}
			}

			expName := ""
			var expeditionID *int
			if exp, ok := detail["expedition"].(map[string]interface{}); ok && exp != nil {
				expName, _ = exp["name"].(string)
				if idFloat, ok := exp["id"].(float64); ok {
					idInt := int(idFloat)
					expeditionID = &idInt
				}
			}
			awb, _ := detail["expedition_tracking"].(string)
			locationPurpose := "DISPLAY"

			origInvID := invoiceNo
			if isOnline == 1 && syncOrderTpID != "" {
				origInvID = syncOrderTpID
			}

			var keljaHistoriesStr *string
			if histories, ok := detail["fulfillment_histories"]; ok && histories != nil {
				historiesBytes, err := json.Marshal(histories)
				if err == nil {
					str := string(historiesBytes)
					keljaHistoriesStr = &str
				}
			}

			header := &domain.FulfilmentList{
				UserID:            userID,
				OriginalInvoiceID: &origInvID,
				Source:            &source,
				Status:            status,
				IsActive:          true,
				CustomerName:      &contactName,
				OrderDate:         orderDate,
				MarketplaceStatus: marketplaceStatus,
				LocationPurpose:   &locationPurpose,
				ShopName:          &shopName,
				InvoiceNo:         &invoiceNo,
				Courier:           &expName,
				ExpeditionID:      expeditionID,
				AWB:               &awb,
				KeljaHistories:    keljaHistoriesStr,
			}

			headerID, err := s.fulfilmentRepo.CreateFulfilmentListTx(txCtx, header)
			if err != nil {
				if strings.Contains(err.Error(), "Duplicate entry") {
					// We don't log this as an error, just skip
					return errors.New("SKIPPED: Duplicate entry")
				}
				return err
			}

			items, ok := detail["transaction_items"].([]interface{})
			if ok {
				for _, itmObj := range items {
					itm, ok := itmObj.(map[string]interface{})
					if !ok { continue }

					qtyFloat, _ := itm["qty"].(float64)
					qty := int(qtyFloat)
					price, _ := itm["price"].(float64)
					
					var sku string
					if prod, ok := itm["product"].(map[string]interface{}); ok {
						sku, _ = prod["code"].(string)
						prodName, _ := prod["name"].(string)
						
						productID, err := s.productRepo.GetProductIDBySKUTx(txCtx, sku)
						if err != nil || productID == 0 {
							newProd := &catalog_domain.Product{
								SKU:      sku,
								Name:     prodName,
								IsActive: true,
							}
							createdID, err := s.productRepo.CreateProductTx(txCtx, newProd)
							if err != nil {
								return fmt.Errorf("failed to auto-create SKU %s: %w", sku, err)
							}
							productID = createdID
						}

						item := &domain.FulfilmentListItem{
							FulfilmentListID: headerID,
							ProductID:        productID,
							Quantity:         qty,
							Status:           "READY TO PICK",
							OriginalSKU:      &sku,
							Price:            &price,
						}

						locationID, err := s.locationRepo.FindBestStock(txCtx, productID, qty, locationPurpose)
						if err == nil && locationID != nil {
							item.SuggestedLocationID = locationID
							s.locationRepo.ReserveStock(txCtx, productID, *locationID, qty)
						} else {
							item.Status = "BACKORDER"
						}

						if err := s.fulfilmentRepo.CreateFulfilmentListItemTx(txCtx, item); err != nil {
							return err
						}
					}
				}
			}
			s.fulfilmentRepo.ValidateHeader(txCtx, headerID, "READY TO PICK")

			successCount++
			return nil
		})

		if err != nil {
			if strings.HasPrefix(err.Error(), "SKIPPED:") {
				logs = append(logs, logDetail{
					KeljaID:   keljaID,
					InvoiceNo: invoiceNo,
					Status:    "SKIPPED",
					Error:     err.Error(),
				})
			} else {
				errorCount++
				logs = append(logs, logDetail{
					KeljaID:   keljaID,
					InvoiceNo: invoiceNo,
					Status:    "FAILED",
					Error:     err.Error(),
				})
			}
		} else {
			successCount++
			logs = append(logs, logDetail{
				KeljaID:   keljaID,
				InvoiceNo: invoiceNo,
				Status:    "SUCCESS",
			})
		}
	}

	logJSON, _ := json.Marshal(logs)
	logStr := string(logJSON)

	summary := fmt.Sprintf("Synced %d fulfillments. Success: %d, Failed: %d", len(list), successCount, errorCount)
	
	if errorCount > 0 && successCount == 0 {
		s.jobService.UpdateImportJobStatusWithLog(ctx, jobID, "FAILED", summary, logStr)
	} else if errorCount > 0 {
		s.jobService.UpdateImportJobStatusWithLog(ctx, jobID, "COMPLETED_WITH_ERRORS", summary, logStr)
	} else {
		s.jobService.UpdateImportJobStatusWithLog(ctx, jobID, "COMPLETED", summary, logStr)
	}
	return nil
}
