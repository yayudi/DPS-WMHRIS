package usecase

import (
	"context"
	"fmt"
	"log"

	"github.com/dps-wmhris/backend/internal/shared/i18n"
	"github.com/dps-wmhris/backend/internal/shared/utils"
	"github.com/xuri/excelize/v2"
)

// ProcessExportPackage generates a package catalog Excel workbook with component columns and a category reference sheet.
func (s *exportServiceImpl) ProcessExportPackage(ctx context.Context, jobID int, filtersJSON string) error {
	parsedFilter, err := parseCatalogExportFilter(filtersJSON, true)
	if err != nil {
		return fmt.Errorf("invalid filters: %w", err)
	}
	req := parsedFilter.FilterReq
	status := parsedFilter.Status
	exportName := parsedFilter.ExportName

	res, _, err := s.productRepo.GetProductsWithFilters(ctx, req)
	if err != nil {
		return fmt.Errorf("failed to fetch packages: %w", err)
	}

	maxComponentCount := 0
	for _, row := range res {
		if len(row.Components) > maxComponentCount {
			maxComponentCount = len(row.Components)
		}
	}
	if maxComponentCount < 5 {
		maxComponentCount = 5
	}

	f := excelize.NewFile()
	defer func() {
		if err := f.Close(); err != nil {
			log.Printf("failed to close excel file: %v", err)
		}
	}()

	sheetName := sanitizeExcelSheetName(i18n.T(ctx, "analytics.export.sheet_package_data"), "Package Data")
	_ = f.SetSheetName("Sheet1", sheetName) // #nosec G104
	styles := utils.InitExcelStyles(f)

	headers := []string{
		"common.label.sku",
		"common.label.package_name",
		"common.label.category",
		"analytics.export.col_selling_price",
	}
	for i := 1; i <= maxComponentCount; i++ {
		headers = append(headers, fmt.Sprintf("Component_%d", i))
		headers = append(headers, fmt.Sprintf("Qty_%d", i))
	}

	utils.SetLocalizedHeaders(ctx, f, sheetName, headers, styles.Header)
	_ = f.SetRowHeight(sheetName, 1, 20) // #nosec G104

	for r, row := range res {
		catName := ""
		if row.CategoryName != nil {
			catName = *row.CategoryName
		}

		_ = f.SetSheetRow(sheetName, fmt.Sprintf("A%d", r+2), &[]any{row.SKU, row.Name, catName, row.Price}) // #nosec G104

		compRow := make([]any, 0, len(row.Components)*2)
		for _, comp := range row.Components {
			compRow = append(compRow, comp.SKU, comp.Quantity)
		}
		if len(compRow) > 0 {
			_ = f.SetSheetRow(sheetName, fmt.Sprintf("E%d", r+2), &compRow) // #nosec G104
		}
	}

	// Categories Reference Sheet
	catSheetName := sanitizeExcelSheetName(i18n.T(ctx, "analytics.export.sheet_category_reference"), "Category Reference")
	_, _ = f.NewSheet(catSheetName) // #nosec G104
	categories, err := s.categoryRepo.FindAllActive(ctx)
	if err == nil {
		catHeaders := []string{
			"analytics.export.col_id",
			"analytics.export.col_category_name_ref",
		}

		utils.SetLocalizedHeaders(ctx, f, catSheetName, catHeaders, styles.Header)
		_ = f.SetRowHeight(catSheetName, 1, 20) // #nosec G104

		for r, c := range categories {
			_ = f.SetSheetRow(catSheetName, fmt.Sprintf("A%d", r+2), &[]any{c.ID, c.Name}) // #nosec G104
		}
	} else {
		log.Printf("Failed to fetch categories for export: %v", err)
	}

	defaultPrefix := "Data_Paket"
	if status != "" && status != "all" {
		defaultPrefix += "_" + status
	}
	fileName := utils.GenerateExportFileName(exportName, defaultPrefix)
	return finalizeExportJob(ctx, f, jobID, fileName, "exports/packages", s.jobRepo, s.storageService)
}
