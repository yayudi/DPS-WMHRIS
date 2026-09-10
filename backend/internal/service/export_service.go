package service

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/dps-wmhris/backend/internal/dto"
	"github.com/dps-wmhris/backend/internal/repository"
	"github.com/dps-wmhris/backend/internal/utils"
	"github.com/xuri/excelize/v2"
)

type ExportService interface {
	ProcessExportStockMovement(ctx context.Context, jobID int, filtersJSON string) error
	ProcessExportStockTimeline(ctx context.Context, jobID int, filtersJSON string) error
	ProcessExportBatchLog(ctx context.Context, jobID int, filtersJSON string) error
	ProcessExportStockReport(ctx context.Context, jobID int, filtersJSON string) error
	ProcessExportLocationCapacity(ctx context.Context, jobID int, filtersJSON string) error
	ProcessExportProduct(ctx context.Context, jobID int, filtersJSON string) error
	ProcessExportPackage(ctx context.Context, jobID int, filtersJSON string) error
}

type exportServiceImpl struct {
	jobRepo          repository.JobRepository
	statisticService StatisticService
	storageService   StorageService
	stockRepo        repository.StockRepository
	reportRepo       repository.ReportRepository
	productRepo      repository.ProductRepository
	categoryRepo     repository.CategoryRepository
}

func NewExportService(jobRepo repository.JobRepository, statisticService StatisticService, storageService StorageService, stockRepo repository.StockRepository, reportRepo repository.ReportRepository, productRepo repository.ProductRepository, categoryRepo repository.CategoryRepository) ExportService {
	return &exportServiceImpl{
		jobRepo:          jobRepo,
		statisticService: statisticService,
		storageService:   storageService,
		stockRepo:        stockRepo,
		reportRepo:       reportRepo,
		productRepo:      productRepo,
		categoryRepo:     categoryRepo,
	}
}

func (s *exportServiceImpl) ProcessExportStockMovement(ctx context.Context, jobID int, filtersJSON string) error {
	s.jobRepo.UpdateExportJobStatus(ctx, jobID, "PROCESSING", nil, nil)

	req := dto.StatisticFilterRequest{}
	_ = json.Unmarshal([]byte(filtersJSON), &req)

	data, err := s.statisticService.GetStockMovementStatistics(ctx, req)
	if err != nil {
		return failExportJob(ctx, jobID, err, s.jobRepo)
	}

	// Buat file Excel
	f := excelize.NewFile()
	defer func() {
		if err := f.Close(); err != nil {}
	}()
	styles := utils.InitExcelStyles(f)

	sheetName := "Stock Movements"
	f.SetSheetName("Sheet1", sheetName)

	// Set Headers
	utils.SetHeaders(f, sheetName, []string{"SKU", "Nama Produk", "Stok Saat Ini", "Total Terjual", "Total Masuk", "Rata-rata Terjual Harian", "Estimasi Hari Habis", "Status"}, styles.Header)

	// Set Data
	for r, row := range data.Summary {
		var estimasi string
		if row.DaysOfInventory != nil {
			if *row.DaysOfInventory == -1 {
				estimasi = "N/A"
			} else {
				estimasi = fmt.Sprintf("%.1f", *row.DaysOfInventory)
			}
		}
		
		f.SetSheetRow(sheetName, fmt.Sprintf("A%d", r+2), &[]interface{}{
			row.SKU, row.Name, row.CurrentStock, row.TotalSold, row.TotalInbound, row.AvgDailySales, estimasi, row.Status,
		})
	}

	utils.SetColWidths(f, sheetName, map[string]float64{
		"A": 15, "B": 40, "C": 15, "D": 15,
		"E": 15, "F": 25, "G": 20, "H": 20,
	})

	fileName := utils.GenerateExportFileName(req.ExportName, "stock_movement_export")
	return finalizeExportJob(ctx, f, jobID, fileName, "exports", s.jobRepo, s.storageService)
}

func (s *exportServiceImpl) ProcessExportStockTimeline(ctx context.Context, jobID int, filtersJSON string) error {
	s.jobRepo.UpdateExportJobStatus(ctx, jobID, "PROCESSING", nil, nil)

	req := dto.StatisticFilterRequest{}
	_ = json.Unmarshal([]byte(filtersJSON), &req)
	
	// Untuk timeline asumsikan rentang diambil secara dinamis atau hardcode,
	// karena getStockTimeline tidak selalu minta startDate.
	req.StartDate = "2020-01-01" 
	req.EndDate = "2030-01-01"

	data, err := s.statisticService.GetStockTimelineStatistics(ctx, req)
	if err != nil {
		return failExportJob(ctx, jobID, err, s.jobRepo)
	}

	f := excelize.NewFile()
	defer f.Close()
	styles := utils.InitExcelStyles(f)

	sheetName := "Stock Timeline"
	f.SetSheetName("Sheet1", sheetName)

	utils.SetHeaders(f, sheetName, []string{"Tanggal", "Total Masuk", "Total Keluar", "Net Perubahan"}, styles.Header)

	for r, row := range data {
		f.SetSheetRow(sheetName, fmt.Sprintf("A%d", r+2), &[]interface{}{row.Date, row.TotalIn, row.TotalOut, row.NetChange})
	}

	utils.SetColStyles(f, sheetName, map[string]int{"B": styles.NumInt, "C": styles.NumInt, "D": styles.NumInt})
	f.SetCellStyle(sheetName, "A1", "D1", styles.Header) // Re-apply header style after ColStyle

	utils.SetColWidths(f, sheetName, map[string]float64{"A": 20, "B": 20, "C": 20, "D": 20})

	fileName := utils.GenerateExportFileName(req.ExportName, "stock_timeline_export")
	return finalizeExportJob(ctx, f, jobID, fileName, "exports", s.jobRepo, s.storageService)
}

func (s *exportServiceImpl) ProcessExportBatchLog(ctx context.Context, jobID int, filtersJSON string) error {
	s.jobRepo.UpdateExportJobStatus(ctx, jobID, "PROCESSING", nil, nil)

	var filter dto.BatchLogFilter
	if filtersJSON != "" {
		_ = json.Unmarshal([]byte(filtersJSON), &filter)
	}
	
	// Override limit to get all logs
	filter.Page = 1
	filter.Limit = 999999
	
	// Default dates if not set
	if filter.StartDate == "" {
		filter.StartDate = "2020-01-01"
	}
	if filter.EndDate == "" {
		filter.EndDate = "2030-01-01"
	}

	result, err := s.stockRepo.GetBatchLogs(ctx, filter)
	if err != nil {
		return failExportJob(ctx, jobID, err, s.jobRepo)
	}
	logs := result.Data

	f := excelize.NewFile()
	styles := utils.InitExcelStyles(f)
	sheetName := "Batch Log"
	f.SetSheetName("Sheet1", sheetName)

	utils.SetHeaders(f, sheetName, []string{"No", "Tanggal", "SKU", "Nama Produk", "Tipe Mutasi", "Jumlah", "Dari Lokasi", "Ke Lokasi", "Keterangan", "User"}, styles.Header)

	for i, logItem := range logs {
		row := i + 2
		f.SetSheetRow(sheetName, fmt.Sprintf("A%d", row), &[]interface{}{
			i + 1, logItem.CreatedAt, logItem.SKU, logItem.ProductName, logItem.MovementType, logItem.Quantity, logItem.FromLocation, logItem.ToLocation, logItem.Notes, logItem.User,
		})
	}

	utils.SetColStyles(f, sheetName, map[string]int{"F": styles.NumInt})
	f.SetCellStyle(sheetName, "A1", "J1", styles.Header) // Re-apply header style after ColStyle

	utils.SetColWidths(f, sheetName, map[string]float64{
		"A": 5, "B": 20, "C": 15, "D": 35, "E": 30,
		"F": 15, "G": 15, "H": 15, "I": 35, "J": 25,
	})

	fileName := utils.GenerateExportFileName(filter.ExportName, "batch_log_export")
	return finalizeExportJob(ctx, f, jobID, fileName, "exports", s.jobRepo, s.storageService)
}

func (s *exportServiceImpl) ProcessExportStockReport(ctx context.Context, jobID int, filtersJSON string) error {
	s.jobRepo.UpdateExportJobStatus(ctx, jobID, "PROCESSING", nil, nil)

	var filter dto.StockReportFilter
	if err := json.Unmarshal([]byte(filtersJSON), &filter); err != nil {
		errMsg := fmt.Sprintf("Failed to parse filters: %v", err)
		s.jobRepo.UpdateExportJobStatus(ctx, jobID, "FAILED", nil, &errMsg)
		return err
	}

	data, err := s.reportRepo.GetStockReportData(ctx, filter)
	if err != nil {
		return failExportJob(ctx, jobID, err, s.jobRepo)
	}

	f := excelize.NewFile()
	defer func() {
		if err := f.Close(); err != nil {
			fmt.Println(err)
		}
	}()
	styles := utils.InitExcelStyles(f)

	rawSheet := "Data Mentah"
	f.SetSheetName("Sheet1", rawSheet)

	utils.SetHeaders(f, rawSheet, []string{"SKU", "Nama Produk", "Lokasi", "Kuantitas"}, styles.Header)
	utils.SetColWidths(f, rawSheet, map[string]float64{"A": 20, "B": 50, "C": 15, "D": 12})

	redStyle, _ := f.NewStyle(&excelize.Style{
		Font: &excelize.Font{Color: "#9C0006"},
	})
	
	boldRedStyle, _ := f.NewStyle(&excelize.Style{
		Font: &excelize.Font{Color: "#9C0006", Bold: true},
	})
	
	boldStyle, _ := f.NewStyle(&excelize.Style{
		Font: &excelize.Font{Bold: true},
	})

	pivotData := make(map[string]map[string]interface{})
	var skus []string
	var locationCodes []string
	locSet := make(map[string]bool)

	rowIdx := 2
	for _, row := range data {
		lokasi := "-"
		if row.Lokasi != nil && *row.Lokasi != "" {
			lokasi = *row.Lokasi
		}

		f.SetSheetRow(rawSheet, fmt.Sprintf("A%d", rowIdx), &[]interface{}{row.Sku, row.NamaProduk, lokasi, row.Kuantitas})

		if row.Kuantitas < 0 {
			f.SetCellStyle(rawSheet, fmt.Sprintf("D%d", rowIdx), fmt.Sprintf("D%d", rowIdx), redStyle)
		}

		// Pivot processing
		if _, exists := pivotData[row.Sku]; !exists {
			pivotData[row.Sku] = make(map[string]interface{})
			pivotData[row.Sku]["SKU"] = row.Sku
			pivotData[row.Sku]["NamaProduk"] = row.NamaProduk
			pivotData[row.Sku]["GrandTotal"] = 0
			skus = append(skus, row.Sku)
		}

		if lokasi != "-" {
			if !locSet[lokasi] {
				locSet[lokasi] = true
				locationCodes = append(locationCodes, lokasi)
			}
			val, _ := pivotData[row.Sku][lokasi].(int)
			pivotData[row.Sku][lokasi] = val + row.Kuantitas
		}
		
		total, _ := pivotData[row.Sku]["GrandTotal"].(int)
		pivotData[row.Sku]["GrandTotal"] = total + row.Kuantitas

		rowIdx++
	}

	// Create Pivot Sheet
	pivotSheet := "Ringkasan Stok"
	f.NewSheet(pivotSheet)

	f.MergeCell(pivotSheet, "A1", "B1")
	f.SetCellValue(pivotSheet, "A1", "Laporan Ringkasan Stok (Per Lokasi)")
	titleStyle, _ := f.NewStyle(&excelize.Style{
		Font: &excelize.Font{Size: 14, Bold: true},
		Alignment: &excelize.Alignment{Horizontal: "center"},
	})
	f.SetCellStyle(pivotSheet, "A1", "A1", titleStyle)

	// Headers
	headers := []interface{}{"SKU", "Nama Produk"}
	colIdx := 3
	for _, loc := range locationCodes {
		headers = append(headers, loc)
		colName, _ := excelize.ColumnNumberToName(colIdx)
		f.SetColWidth(pivotSheet, colName, colName, 10)
		colIdx++
	}
	headers = append(headers, "Grand Total")
	colName, _ := excelize.ColumnNumberToName(colIdx)
	f.SetColWidth(pivotSheet, colName, colName, 15)
	
	f.SetSheetRow(pivotSheet, "A2", &headers)

	f.SetCellStyle(pivotSheet, "A2", fmt.Sprintf("%s2", colName), styles.Header)
	f.SetColWidth(pivotSheet, "A", "A", 20)
	f.SetColWidth(pivotSheet, "B", "B", 50)

	pRowIdx := 3
	for _, sku := range skus {
		pData := pivotData[sku]
		row := []interface{}{pData["Sku"], pData["NamaProduk"]}
		
		cIdx := 3
		for _, loc := range locationCodes {
			val, ok := pData[loc].(int)
			if ok && val != 0 {
				row = append(row, val)
				if val < 0 {
					cName, _ := excelize.ColumnNumberToName(cIdx)
					cellName := fmt.Sprintf("%s%d", cName, pRowIdx)
					f.SetCellStyle(pivotSheet, cellName, cellName, redStyle)
				}
			} else {
				row = append(row, "")
			}
			cIdx++
		}
		
		gt, _ := pData["GrandTotal"].(int)
		row = append(row, gt)
		f.SetSheetRow(pivotSheet, fmt.Sprintf("A%d", pRowIdx), &row)

		cName, _ := excelize.ColumnNumberToName(cIdx)
		cellName := fmt.Sprintf("%s%d", cName, pRowIdx)
		if gt < 0 {
			f.SetCellStyle(pivotSheet, cellName, cellName, boldRedStyle)
		} else {
			f.SetCellStyle(pivotSheet, cellName, cellName, boldStyle)
		}
		
		pRowIdx++
	}

	// Make Pivot Sheet active
	if idx, err := f.GetSheetIndex(pivotSheet); err == nil {
		f.SetActiveSheet(idx)
	}

	fileName := utils.GenerateExportFileName(filter.ExportName, "stock_report")
	return finalizeExportJob(ctx, f, jobID, fileName, "exports", s.jobRepo, s.storageService)
}

func (s *exportServiceImpl) ProcessExportLocationCapacity(ctx context.Context, jobID int, filtersJSON string) error {
	s.jobRepo.UpdateExportJobStatus(ctx, jobID, "PROCESSING", nil, nil)

	var req dto.ExportLocationCapacityRequest
	_ = json.Unmarshal([]byte(filtersJSON), &req)

	statFilters := dto.StatisticFilterRequest{
		SearchQuery: req.SearchQuery,
	}
	if req.CategoryId != nil {
		if str, ok := req.CategoryId.(string); ok {
			statFilters.CategoryId = str
		} else {
			b, _ := json.Marshal(req.CategoryId)
			statFilters.CategoryId = string(b)
		}
	}
	if req.Purpose != nil {
		if str, ok := req.Purpose.(string); ok {
			statFilters.Purpose = str
		} else {
			b, _ := json.Marshal(req.Purpose)
			statFilters.Purpose = string(b)
		}
	}
	if req.Building != nil {
		if str, ok := req.Building.(string); ok {
			statFilters.Building = str
		} else {
			b, _ := json.Marshal(req.Building)
			statFilters.Building = string(b)
		}
	}
	if req.Floor != nil {
		if str, ok := req.Floor.(string); ok {
			statFilters.Floor = str
		} else {
			b, _ := json.Marshal(req.Floor)
			statFilters.Floor = string(b)
		}
	}

	data, err := s.statisticService.GetLocationAnalysis(ctx, statFilters)
	if err != nil {
		return failExportJob(ctx, jobID, err, s.jobRepo)
	}

	f := excelize.NewFile()
	defer f.Close()
	styles := utils.InitExcelStyles(f)

	sheetName := "Location Capacity"
	f.SetSheetName("Sheet1", sheetName)

	isDetailed := req.ExportFormat == "detailed"

	if !isDetailed {
		headers := []string{"Kode Lokasi", "Gedung", "Lantai", "Purpose", "Jumlah SKU", "Kuantitas", "Berat (kg)", "Kubikasi (m3)"}
		utils.SetHeaders(f, sheetName, headers, styles.Header)

		var totalSKU, totalQty float64
		var totalWeight, totalCBM float64

		for r, row := range data.LocationLoads {
			building := ""
			if row.Building != nil {
				building = *row.Building
			}
			floor := ""
			if row.Floor != nil {
				floor = *row.Floor
			}
			purpose := ""
			if row.Purpose != nil {
				purpose = *row.Purpose
			}

			f.SetSheetRow(sheetName, fmt.Sprintf("A%d", r+2), &[]interface{}{
				row.Code, building, floor, purpose, row.TotalProducts, row.TotalQuantity, row.TotalWeight / 1000, row.TotalCBM,
			})

			totalSKU += row.TotalProducts
			totalQty += row.TotalQuantity
			totalWeight += row.TotalWeight / 1000
			totalCBM += row.TotalCBM
		}

		lastRow := len(data.LocationLoads) + 2
		f.SetSheetRow(sheetName, fmt.Sprintf("A%d", lastRow), &[]interface{}{"GRAND TOTAL", "", "", "", totalSKU, totalQty, totalWeight, totalCBM})
		f.MergeCell(sheetName, fmt.Sprintf("A%d", lastRow), fmt.Sprintf("D%d", lastRow))

		utils.SetColStyles(f, sheetName, map[string]int{
			"E": styles.NumInt, "F": styles.NumInt,
			"G": styles.NumDec, "H": styles.NumDec,
		})

		// Fix header style overridden by ColStyle
		f.SetCellStyle(sheetName, "A1", "H1", styles.Header)

		f.SetCellStyle(sheetName, fmt.Sprintf("A%d", lastRow), fmt.Sprintf("D%d", lastRow), styles.Total)
		f.SetCellStyle(sheetName, fmt.Sprintf("E%d", lastRow), fmt.Sprintf("F%d", lastRow), styles.TotalInt)
		f.SetCellStyle(sheetName, fmt.Sprintf("G%d", lastRow), fmt.Sprintf("H%d", lastRow), styles.TotalDec)

		f.SetColWidth(sheetName, "A", "A", 20)
		f.SetColWidth(sheetName, "B", "B", 20)
		f.SetColWidth(sheetName, "C", "C", 15)
		f.SetColWidth(sheetName, "D", "D", 20)
		f.SetColWidth(sheetName, "E", "E", 20)
		f.SetColWidth(sheetName, "F", "F", 20)
		f.SetColWidth(sheetName, "G", "G", 20)
		f.SetColWidth(sheetName, "H", "H", 20)
	} else {
		headers := []string{"Kode Lokasi", "Gedung", "Lantai", "SKU", "Nama Produk", "Kategori", "Kuantitas", "Berat (kg)", "Kubikasi (m3)"}
		utils.SetHeaders(f, sheetName, headers, styles.Header)

		currentRow := 2
		var totalQty int
		var totalWeight, totalCBM float64

		for _, loc := range data.LocationLoads {
			details, err := s.statisticService.GetLocationCapacityDetails(ctx, loc.LocationID, statFilters)
			if err != nil {
				continue
			}

			building := ""
			if loc.Building != nil {
				building = *loc.Building
			}
			floor := ""
			if loc.Floor != nil {
				floor = *loc.Floor
			}

			if len(details) == 0 {
				continue
			}

			for _, det := range details {
				f.SetSheetRow(sheetName, fmt.Sprintf("A%d", currentRow), &[]interface{}{
					loc.Code, building, floor, det.SKU, det.Name, det.CategoryName, det.Quantity, det.TotalWeight / 1000, det.TotalCBM,
				})

				totalQty += det.Quantity
				totalWeight += det.TotalWeight / 1000
				totalCBM += det.TotalCBM
				currentRow++
			}
		}

		f.SetSheetRow(sheetName, fmt.Sprintf("A%d", currentRow), &[]interface{}{"GRAND TOTAL", "", "", "", "", "", totalQty, totalWeight, totalCBM})
		f.MergeCell(sheetName, fmt.Sprintf("A%d", currentRow), fmt.Sprintf("F%d", currentRow))

		utils.SetColStyles(f, sheetName, map[string]int{
			"G": styles.NumInt, "H": styles.NumDec, "I": styles.NumDec,
		})

		// Fix header style overridden by ColStyle
		f.SetCellStyle(sheetName, "A1", "I1", styles.Header)

		f.SetCellStyle(sheetName, fmt.Sprintf("A%d", currentRow), fmt.Sprintf("F%d", currentRow), styles.Total)
		f.SetCellStyle(sheetName, fmt.Sprintf("G%d", currentRow), fmt.Sprintf("G%d", currentRow), styles.TotalInt)
		f.SetCellStyle(sheetName, fmt.Sprintf("H%d", currentRow), fmt.Sprintf("I%d", currentRow), styles.TotalDec)

		utils.SetColWidths(f, sheetName, map[string]float64{
			"A": 20, "B": 20, "C": 15, "D": 20,
			"E": 35, "F": 15, "G": 20, "H": 20, "I": 20,
		})
	}

	fileName := utils.GenerateExportFileName(req.ExportName, "location_capacity_export")
	return finalizeExportJob(ctx, f, jobID, fileName, "exports", s.jobRepo, s.storageService)
}
