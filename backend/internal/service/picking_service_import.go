package service

import (
	"context"
	"encoding/json"
	"fmt"
	"log"

	"github.com/dps-wmhris/backend/internal/model"
	"github.com/dps-wmhris/backend/internal/parser"
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
	parsedOrders, err := parser.ParseSalesFile(filePath, source)
	if err != nil {
		s.jobService.UpdateImportJobStatus(ctx, jobID, "FAILED")
		return fmt.Errorf("failed to parse CSV: %w", err)
	}

	totalOrders := len(parsedOrders)
	if totalOrders == 0 {
		log.Printf("[ProcessSalesImport] No orders to process for Job #%d", jobID)
		s.jobService.UpdateImportJobStatus(ctx, jobID, "COMPLETED")
		return nil
	}

	// Initial progress
	s.jobService.UpdateImportJobProgress(ctx, jobID, 0, totalOrders)

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
		s.jobService.UpdateImportJobStatus(ctx, jobID, "FAILED")
		return fmt.Errorf("failed to fetch product reference data: %w", err)
	}

	// Note: In a full migration, handleExistingInvoices, deduction logic, and transactions would go here.
	// For now, we will loop through parsed orders, insert basic picking list data.
	// Because the Node.js logic is very large (hundreds of lines of complex rules),
	// this is a simplified adaptation focusing on core structures to ensure the pipeline runs.

	tx, err := s.db.BeginTxx(ctx, nil)
	if err != nil {
		return err
	}

	var errorsList []string
	processed := 0

	for _, order := range parsedOrders {
		processed++
		if processed%10 == 0 || processed == totalOrders {
			s.jobService.UpdateImportJobProgress(ctx, jobID, processed, totalOrders)
		}

		// Simplified inserting
		listID, err := s.pickingRepo.CreatePickingListTx(ctx, tx, &model.PickingList{
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

			err = s.pickingRepo.CreatePickingListItemTx(ctx, tx, &model.PickingListItem{
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
		tx.Rollback()
		log.Printf("[ProcessSalesImport] Dry Run completed. Rolled back transaction.")
	} else {
		err = tx.Commit()
		if err != nil {
			s.jobService.UpdateImportJobStatus(ctx, jobID, "FAILED")
			return err
		}
	}

	finalStatus := "COMPLETED"
	if len(errorsList) > 0 {
		finalStatus = "COMPLETED_WITH_ERRORS"
		errJSON, _ := json.Marshal(errorsList)
		log.Printf("[ProcessSalesImport] Job #%d finished with errors: %s", jobID, string(errJSON))
	}
	s.jobService.UpdateImportJobStatus(ctx, jobID, finalStatus)

	return nil
}
