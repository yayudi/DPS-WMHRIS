package usecase

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"time"

	catalog_domain "github.com/dps-wmhris/backend/internal/modules/catalog/domain"
	inventory_parser "github.com/dps-wmhris/backend/internal/modules/inventory/application/parser"

	"github.com/dps-wmhris/backend/internal/modules/inventory/domain"
)

// ProcessSalesImport processes a CSV/Excel sales file into fulfilment lists.
// Adapted to match the same infrastructure as ProcessKeljaSync:
// - Dedup by original_invoice_id
// - Auto-create unknown SKUs in catalog
// - Stock location assignment with BACKORDER fallback
// - Structured job logging
func (s *fulfilmentService) ProcessSalesImport(
	ctx context.Context,
	jobID int,
	filePath string,
	source string,
	userID int,
	isDryRun bool,
	locationPurpose string,
	shopName string,
) error {
	log.Printf("[ProcessSalesImport] Starting Job #%d from source %s (DryRun: %v)", jobID, source, isDryRun)
	s.jobService.UpdateImportJobStatus(ctx, jobID, "PROCESSING") // #nosec G104

	// 1. Parse File (CSV or Excel)
	cleanPath := filepath.Clean(filePath)
	if !filepath.IsAbs(cleanPath) {
		cwd, _ := os.Getwd()
		cleanPath = filepath.Join(cwd, cleanPath)
	}
	ext := filepath.Ext(cleanPath)
	
	var file *os.File
	var err error
	
	if runtime.GOOS == "windows" {
		for retry := 0; retry < 10; retry++ {
			file, err = os.Open(cleanPath)
			if err == nil {
				break
			}
			time.Sleep(1 * time.Second)
		}
	} else {
		file, err = os.Open(cleanPath)
	}

	if err != nil {
		s.jobService.UpdateImportJobStatusWithSummary(ctx, jobID, "FAILED", fmt.Sprintf("Failed to open file: %v (path: %s)", err, cleanPath)) // #nosec G104
		return fmt.Errorf("failed to open file: %w", err)
	}
	defer file.Close()

	parsedOrders, err := inventory_parser.ParseSalesFile(file, ext, source)
	if err != nil {
		s.jobService.UpdateImportJobStatusWithSummary(ctx, jobID, "FAILED", fmt.Sprintf("Failed to parse file: %v", err)) // #nosec G104
		return fmt.Errorf("failed to parse file: %w", err)
	}

	totalOrders := len(parsedOrders)
	if totalOrders == 0 {
		log.Printf("[ProcessSalesImport] No orders to process for Job #%d", jobID)
		s.jobService.UpdateImportJobStatusWithSummary(ctx, jobID, "COMPLETED", "No orders found in file") // #nosec G104
		return nil
	}

	log.Printf("[ProcessSalesImport] Job #%d parsed %d orders", jobID, totalOrders)

	type logDetail struct {
		InvoiceID string `json:"invoice_id"`
		Status    string `json:"status"`
		Error     string `json:"error,omitempty"`
	}
	var logs []logDetail

	successCount := 0
	errorCount := 0
	skippedCount := 0

	for i, order := range parsedOrders {
		s.jobService.UpdateImportJobProgress(ctx, jobID, (i*100)/totalOrders, 100) // #nosec G104

		// 2. Dedup: check if invoice already exists in WMS
		if order.InvoiceID != "" {
			existingListID, err := s.fulfilmentRepo.GetListIDByKeljaIDOrInvoiceNo(ctx, 0, order.InvoiceID)
			if err != nil {
				log.Printf("[ProcessSalesImport] Error checking dedup for %s: %v", order.InvoiceID, err)
			}
			if existingListID != nil {
				logs = append(logs, logDetail{
					InvoiceID: order.InvoiceID,
					Status:    "SKIPPED",
					Error:     "Already exists in WMS",
				})
				skippedCount++
				continue
			}
		}

		// Skip VOID / RETURNED orders — they don't create fulfilment lists
		if order.Status == "VOID" || order.Status == "RETURNED" {
			logs = append(logs, logDetail{
				InvoiceID: order.InvoiceID,
				Status:    "SKIPPED",
				Error:     fmt.Sprintf("Order status is %s, skipped", order.Status),
			})
			skippedCount++
			continue
		}

		// 3. Create header + items within a transaction
		err = s.txManager.WithTransaction(ctx, func(txCtx context.Context) error {
			// Map parsed status to WMS status
			wmsStatus := "READY TO PICK" // default for NEW / SHIPPED
			switch order.Status {
			case "NEW":
				wmsStatus = "READY TO PICK"
			case "SHIPPED":
				wmsStatus = "ON DELIVERY"
			case "COMPLETED":
				wmsStatus = "COMPLETED"
			}

			var finalOrderDate *time.Time
			if order.OrderDate != nil && !order.OrderDate.IsZero() {
				finalOrderDate = order.OrderDate
			}

			header := &domain.FulfilmentList{
				UserID:            userID,
				OriginalInvoiceID: &order.InvoiceID,
				Source:            &source,
				Status:            wmsStatus,
				IsActive:          true,
				CustomerName:      &order.Customer,
				OrderDate:         finalOrderDate,
				MarketplaceStatus: &order.Status,
				LocationPurpose:   &locationPurpose,
				ShopName:          &shopName,
				InvoiceNo:         &order.InvoiceID,
			}

			headerID, err := s.fulfilmentRepo.CreateFulfilmentListTx(txCtx, header)
			if err != nil {
				if strings.Contains(err.Error(), "Duplicate entry") {
					return fmt.Errorf("SKIPPED: Duplicate entry for %s", order.InvoiceID)
				}
				return err
			}

			hasBackorder := false
			var autoProcessItems []domain.FulfilmentListItem

			for _, item := range order.Items {
				if item.SKU == "" || item.Quantity == 0 {
					continue
				}

				// Auto-resolve or auto-create SKU (same pattern as KeljaSync)
				productID, err := s.productRepo.GetProductIDBySKUTx(txCtx, item.SKU)
				if err != nil || productID == 0 {
					newProd := &catalog_domain.Product{
						SKU:      item.SKU,
						Name:     item.SKU, // No product name from CSV, use SKU
						IsActive: true,
					}
					createdID, err := s.productRepo.CreateProductTx(txCtx, newProd)
					if err != nil {
						return fmt.Errorf("failed to auto-create SKU %s: %w", item.SKU, err)
					}
					productID = createdID
					log.Printf("[ProcessSalesImport] Auto-created SKU %s with ID %d", item.SKU, productID)
				}

				fulfilmentItem := &domain.FulfilmentListItem{
					FulfilmentListID: headerID,
					ProductID:        productID,
					Quantity:         item.Quantity,
					Status:           "READY TO PICK",
					OriginalSKU:      &item.SKU,
				}

				// Stock location assignment (same pattern as KeljaSync)
				locationID, err := s.locationRepo.FindBestStock(txCtx, productID, item.Quantity, locationPurpose)
				if err == nil && locationID != nil {
					fulfilmentItem.SuggestedLocationID = locationID
					s.locationRepo.ReserveStock(txCtx, productID, *locationID, item.Quantity) // #nosec G104
				} else {
					fulfilmentItem.Status = "BACKORDER"
					hasBackorder = true
				}

				itemID, err := s.fulfilmentRepo.CreateFulfilmentListItemTx(txCtx, fulfilmentItem)
				if err != nil {
					return err
				}
				fulfilmentItem.ID = itemID

				if fulfilmentItem.SuggestedLocationID != nil {
					autoProcessItems = append(autoProcessItems, *fulfilmentItem)
				}
			}

			// Handle ON DELIVERY / COMPLETED automation
			if wmsStatus == "ON DELIVERY" || wmsStatus == "COMPLETED" {
				if hasBackorder {
					wmsStatus = "PENDING"
				} else {
					// Fully available -> auto-deduct stock
					for _, pItem := range autoProcessItems {
						// 1. Release the reservation made above
						s.locationRepo.ReleaseStock(txCtx, pItem.ProductID, *pItem.SuggestedLocationID, pItem.Quantity) // #nosec G104

						// 2. Physically deduct stock
						if err := s.locationRepo.DeductStock(txCtx, pItem.ProductID, *pItem.SuggestedLocationID, pItem.Quantity); err != nil {
							return err
						}

						// 3. Record movement
						notes := fmt.Sprintf("Sale Ref: %s (Item #%d) [AUTO-FULFILLED]", order.InvoiceID, pItem.ID)
						if err := s.stockRepo.RecordMovement(txCtx, &domain.StockMovement{
							ProductID:      pItem.ProductID,
							Quantity:       pItem.Quantity,
							FromLocationID: pItem.SuggestedLocationID,
							MovementType:   "SALE",
							UserID:         userID,
							Notes:          notes,
						}); err != nil {
							return err
						}

						// 4. Update item status to ON DELIVERY/COMPLETED
						if err := s.fulfilmentRepo.ValidateItem(txCtx, pItem.ID, *pItem.SuggestedLocationID, wmsStatus); err != nil {
							return err
						}
					}
				}
			}

			// Validate header status based on items
			s.fulfilmentRepo.ValidateHeader(txCtx, headerID, wmsStatus) // #nosec G104

			if isDryRun {
				return fmt.Errorf("dry_run_rollback")
			}
			return nil
		})

		if err != nil {
			if err.Error() == "dry_run_rollback" {
				logs = append(logs, logDetail{
					InvoiceID: order.InvoiceID,
					Status:    "DRY_RUN_OK",
				})
				successCount++
			} else if strings.HasPrefix(err.Error(), "SKIPPED:") {
				logs = append(logs, logDetail{
					InvoiceID: order.InvoiceID,
					Status:    "SKIPPED",
					Error:     err.Error(),
				})
				skippedCount++
			} else {
				errorCount++
				logs = append(logs, logDetail{
					InvoiceID: order.InvoiceID,
					Status:    "FAILED",
					Error:     err.Error(),
				})
			}
		} else {
			successCount++
			logs = append(logs, logDetail{
				InvoiceID: order.InvoiceID,
				Status:    "SUCCESS",
			})
		}
	}

	// Final job status update
	logJSON, _ := json.Marshal(logs)
	logStr := string(logJSON)

	summary := fmt.Sprintf("Processed %d orders. Success: %d, Skipped: %d, Failed: %d", totalOrders, successCount, skippedCount, errorCount)

	if isDryRun {
		summary = "[DRY RUN] " + summary
		log.Printf("[ProcessSalesImport] Dry Run completed. Rolled back all transactions.")
	}

	if errorCount > 0 && successCount == 0 {
		s.jobService.UpdateImportJobStatusWithLog(ctx, jobID, "FAILED", summary, logStr) // #nosec G104
	} else if errorCount > 0 {
		s.jobService.UpdateImportJobStatusWithLog(ctx, jobID, "COMPLETED_WITH_ERRORS", summary, logStr) // #nosec G104
	} else {
		s.jobService.UpdateImportJobStatusWithLog(ctx, jobID, "COMPLETED", summary, logStr) // #nosec G104
	}

	return nil
}
