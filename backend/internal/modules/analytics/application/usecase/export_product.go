package usecase

import (
	"context"
	"fmt"
	"log"

	"github.com/dps-wmhris/backend/internal/shared/i18n"
	"github.com/dps-wmhris/backend/internal/shared/utils"
	"github.com/xuri/excelize/v2"
)

// ProcessExportProduct generates a product master Excel workbook and uploads it for the given export job.
func (s *exportServiceImpl) ProcessExportProduct(ctx context.Context, jobID int, filtersJSON string) error {
	parsedFilter, err := parseCatalogExportFilter(filtersJSON, false)
	if err != nil {
		return fmt.Errorf("invalid filters: %w", err)
	}
	req := parsedFilter.FilterReq
	status := parsedFilter.Status
	exportName := parsedFilter.ExportName

	res, _, err := s.productRepo.GetProductsWithFilters(ctx, req)
	if err != nil {
		return fmt.Errorf("failed to fetch products: %w", err)
	}

	f := excelize.NewFile()
	defer func() {
		if err := f.Close(); err != nil {
			log.Printf("failed to close excel file: %v", err)
		}
	}()

	sheetName := sanitizeExcelSheetName(i18n.T(ctx, "analytics.export.sheet_product_master"), "Product Master")
	_ = f.SetSheetName("Sheet1", sheetName) // #nosec G104
	styles := utils.InitExcelStyles(f)

	utils.SetLocalizedHeaders(ctx, f, sheetName, []string{
		"common.label.sku",
		"common.label.product_name",
		"common.label.category",
		"common.label.price",
		"analytics.export.col_weight_g",
		"analytics.export.col_total_stock",
		"common.status.active",
		"analytics.export.col_is_package",
	}, styles.Header)

	for r, row := range res {
		catName := ""
		if row.CategoryName != nil {
			catName = *row.CategoryName
		}
		isActive := 0
		if row.IsActive {
			isActive = 1
		}
		isPkg := 0
		if row.IsPackage {
			isPkg = 1
		}
		_ = f.SetSheetRow(sheetName, fmt.Sprintf("A%d", r+2), &[]any{ // #nosec G104
			row.SKU, row.Name, catName, row.Price, row.Weight, row.TotalStock, isActive, isPkg,
		})
	}

	defaultPrefix := "Product_Master"
	if status != "" && status != "all" {
		defaultPrefix += "_" + status
	}
	fileName := utils.GenerateExportFileName(exportName, defaultPrefix)
	return finalizeExportJob(ctx, f, jobID, fileName, "exports/products", s.jobRepo, s.storageService)
}
