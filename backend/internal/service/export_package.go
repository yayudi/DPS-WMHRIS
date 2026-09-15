package service

import (
	"context"
	"encoding/json"
	"fmt"
	"log"

	"github.com/dps-wmhris/backend/internal/dto"
	"github.com/dps-wmhris/backend/internal/utils"

	"github.com/xuri/excelize/v2"
)

func (s *exportServiceImpl) ProcessExportPackage(ctx context.Context, jobID int, filtersJSON string) error {
	_ = s.jobRepo.UpdateExportJobStatus(ctx, jobID, "PROCESSING", nil, nil) // #nosec G104



	var filters map[string]interface{}
	if filtersJSON != "" {
		if err := json.Unmarshal([]byte(filtersJSON), &filters); err != nil {
			return failExportJob(ctx, jobID, fmt.Errorf("invalid filters: %v", err), s.jobRepo)
		}
	}

	search := ""
	if v, ok := filters["search"].(string); ok {
		search = v
	}
	searchBy := "name"
	if v, ok := filters["searchBy"].(string); ok {
		searchBy = v
	}
	sortBy := "sku"
	if v, ok := filters["sortBy"].(string); ok {
		sortBy = v
	}
	sortOrder := "ASC"
	if v, ok := filters["sortOrder"].(string); ok {
		sortOrder = v
	}
	status := "active"
	if v, ok := filters["status"].(string); ok {
		status = v
	}
	exportName := ""
	if v, ok := filters["exportName"].(string); ok {
		exportName = v
	}
	
	pkgOnly := true
	req := dto.ProductFilterRequest{
		Page:            1,
		Limit:           100000,
		Search:          search,
		SearchBy:        searchBy,
		SortBy:          sortBy,
		SortOrder:       sortOrder,
		Status:          status,
		PackageOnly:     &pkgOnly,
	}

	res, _, err := s.productRepo.GetProductsWithFilters(ctx, req)
	if err != nil {
		return failExportJob(ctx, jobID, fmt.Errorf("failed to fetch packages: %v", err), s.jobRepo)
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

	sheetName := "Data Paket"
	_ = f.SetSheetName("Sheet1", sheetName) // #nosec G104
	styles := utils.InitExcelStyles(f)

	headers := []string{"SKU", "Nama Paket", "Kategori", "Harga Jual"}
	for i := 1; i <= maxComponentCount; i++ {
		headers = append(headers, fmt.Sprintf("Component_%d", i))
		headers = append(headers, fmt.Sprintf("Qty_%d", i))
	}

	utils.SetHeaders(f, sheetName, headers, styles.Header)
	_ = f.SetRowHeight(sheetName, 1, 20) // #nosec G104

	for r, row := range res {
		catName := ""
		if row.CategoryName != nil {
			catName = *row.CategoryName
		}
		
		_ = f.SetSheetRow(sheetName, fmt.Sprintf("A%d", r+2), &[]interface{}{row.SKU, row.Name, catName, row.Price}) // #nosec G104
		
		var compRow []interface{}
		for _, comp := range row.Components {
			compRow = append(compRow, comp.SKU, comp.Quantity)
		}
		if len(compRow) > 0 {
			_ = f.SetSheetRow(sheetName, fmt.Sprintf("E%d", r+2), &compRow) // #nosec G104
		}
	}

	// Categories Reference Sheet
	catSheetName := "Referensi Kategori"
	_, _ = f.NewSheet(catSheetName) // #nosec G104
	categories, err := s.categoryRepo.FindAllActive(ctx)
	if err == nil {
		catHeaders := []string{"ID", "Nama Kategori (Gunakan Ini)"}
		
		utils.SetHeaders(f, catSheetName, catHeaders, styles.Header)
		_ = f.SetRowHeight(catSheetName, 1, 20) // #nosec G104
		
		for r, c := range categories {
			_ = f.SetSheetRow(catSheetName, fmt.Sprintf("A%d", r+2), &[]interface{}{c.ID, c.Name}) // #nosec G104
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
