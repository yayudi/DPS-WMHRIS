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

func (s *exportServiceImpl) ProcessExportProduct(ctx context.Context, jobID int, filtersJSON string) error {
	s.jobRepo.UpdateExportJobStatus(ctx, jobID, "PROCESSING", nil, nil)

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
	
	isPackage := false
	if v, ok := filters["isPackage"].(bool); ok {
		isPackage = v
	}

	exportName := ""
	if v, ok := filters["exportName"].(string); ok {
		exportName = v
	}

	req := dto.ProductFilterRequest{
		Page:            1,
		Limit:           100000,
		Search:          search,
		SearchBy:        searchBy,
		SortBy:          sortBy,
		SortOrder:       sortOrder,
		Status:          status,
	}

	if isPackage {
		pkgOnly := true
		req.PackageOnly = &pkgOnly
	}

	res, _, err := s.productRepo.GetProductsWithFilters(ctx, req)
	if err != nil {
		return failExportJob(ctx, jobID, fmt.Errorf("failed to fetch products: %v", err), s.jobRepo)
	}

	f := excelize.NewFile()
	defer func() {
		if err := f.Close(); err != nil {
			log.Printf("failed to close excel file: %v", err)
		}
	}()

	sheetName := "Master Produk"
	f.SetSheetName("Sheet1", sheetName)
	styles := utils.InitExcelStyles(f)

	utils.SetHeaders(f, sheetName, []string{"SKU", "Nama Produk", "Kategori", "Harga", "Berat (g)", "Total Stock", "Aktif", "Is Package"}, styles.Header)

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
		f.SetSheetRow(sheetName, fmt.Sprintf("A%d", r+2), &[]interface{}{
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
