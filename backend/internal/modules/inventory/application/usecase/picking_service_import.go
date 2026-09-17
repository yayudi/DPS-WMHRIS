package usecase

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"os"
	"path/filepath"

	inventory_parser "github.com/dps-wmhris/backend/internal/modules/inventory/application/parser"

	"github.com/dps-wmhris/backend/internal/modules/inventory/domain"
)

func (s *pickingService) ProcessSalesImport(
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

	// 1. Parse File (CSV or Excel)
	cleanPath := filepath.Clean(filePath)
	ext := filepath.Ext(cleanPath)
	file, err := os.Open(cleanPath)
	if err != nil {
		_ = s.jobService.UpdateImportJobStatus(ctx, jobID, "FAILED") // #nosec G104
		return fmt.Errorf("failed to open file: %w", err)
	}
	defer file.Close()

	parsedOrders, err := inventory_parser.ParseSalesFile(file, ext, source)
	if err != nil {
		_ = s.jobService.UpdateImportJobStatus(ctx, jobID, "FAILED") // #nosec G104
		return fmt.Errorf("failed to parse CSV: %w", err)
	}

	totalOrders := len(parsedOrders)
	if totalOrders == 0 {
		log.Printf("[ProcessSalesImport] No orders to process for Job #%d", jobID)
		_ = s.jobService.UpdateImportJobStatus(ctx, jobID, "COMPLETED") // #nosec G104
		return nil
	}

	// Initial progress
	_ = s.jobService.UpdateImportJobProgress(ctx, jobID, 0, totalOrders) // #nosec G104

	// 2. Fetch Reference Data (SKU -> Product ID)
	var allSkus []string
	skuSet := make(map[string]bool)
	for _, order := range parsedOrders {
		for _, item := range order.Items {
			if !skuSet[item.SKU] {
				allSkus = append(allSkus, item.SKU)
				skuSet[item.SKU] = true
			}
		}
	}

	productMap, err := s.productRepo.GetProductMapWithComponents(ctx, allSkus)
	if err != nil {
		_ = s.jobService.UpdateImportJobStatus(ctx, jobID, "FAILED") // #nosec G104
		return fmt.Errorf("failed to fetch product reference data: %w", err)
	}

	// Note: In a full migration, handleExistingInvoices, deduction logic, and transactions would go here.
	// For now, we will loop through parsed orders, insert basic picking list data.
	// Because the Node.js logic is very large (hundreds of lines of complex rules),
	// this is a simplified adaptation focusing on core structures to ensure the pipeline runs.

	var errorsList []string
	err = s.txManager.WithTransaction(ctx, func(ctx context.Context) error {
		processed := 0

		for _, order := range parsedOrders {
			processed++
			if processed%10 == 0 || processed == totalOrders {
				_ = s.jobService.UpdateImportJobProgress(ctx, jobID, processed, totalOrders) // #nosec G104
			}

			// Simplified inserting
			listID, err := s.pickingRepo.CreatePickingListTx(ctx, &domain.PickingList{
				OriginalInvoiceID: &order.InvoiceID,
				Source:            &source,
				Status:            "NEW",
				IsActive:          true,
				UserID:            userID,
				OrderDate:         order.OrderDate,
				LocationPurpose:   &locationPurpose,
				ShopName:          &shopName,
				CustomerName:      &order.Customer,
				MarketplaceStatus: &order.Status,
			})
			if err != nil {
				errorsList = append(errorsList, fmt.Sprintf("Invoice %s: %s", order.InvoiceID, err.Error()))
				continue
			}

			for _, item := range order.Items {
				prod, exists := productMap[item.SKU]
				if !exists {
					errorsList = append(errorsList, fmt.Sprintf("Invoice %s: SKU %s not found", order.InvoiceID, item.SKU))
					continue
				}

				err = s.pickingRepo.CreatePickingListItemTx(ctx, &domain.PickingListItem{
					PickingListID: listID,
					ProductID:     prod.ID,
					Quantity:      item.Quantity,
					Status:        "PENDING",
				})
				if err != nil {
					errorsList = append(errorsList, fmt.Sprintf("Invoice %s Item %s: %s", order.InvoiceID, item.SKU, err.Error()))
				}
			}
		}

		if isDryRun {
			return fmt.Errorf("dry_run_rollback")
		}
		return nil
	})

	if err != nil && err.Error() == "dry_run_rollback" {
		log.Printf("[ProcessSalesImport] Dry Run completed. Rolled back transaction.")
		err = nil
	} else if err != nil {
		_ = s.jobService.UpdateImportJobStatus(ctx, jobID, "FAILED") // #nosec G104
		return err
	}

	finalStatus := "COMPLETED"
	if len(errorsList) > 0 {
		finalStatus = "COMPLETED_WITH_ERRORS"
		errJSON, _ := json.Marshal(errorsList)
		log.Printf("[ProcessSalesImport] Job #%d finished with errors: %s", jobID, string(errJSON))
	}
	_ = s.jobService.UpdateImportJobStatus(ctx, jobID, finalStatus) // #nosec G104

	return nil
}
