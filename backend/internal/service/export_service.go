package service

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"strings"

	"github.com/dps-wmhris/backend/internal/dto"
	"github.com/dps-wmhris/backend/internal/repository"
	"github.com/xuri/excelize/v2"
)

type ExportService interface {
	ProcessExportStockMovement(ctx context.Context, jobID int, filtersJSON string) error
	ProcessExportStockTimeline(ctx context.Context, jobID int, filtersJSON string) error
	ProcessExportBatchLog(ctx context.Context, jobID int, filtersJSON string) error
	ProcessExportStockReport(ctx context.Context, jobID int, filtersJSON string) error
}

type exportServiceImpl struct {
	jobRepo          repository.JobRepository
	statisticService StatisticService
	storageService   StorageService
	stockRepo        repository.StockRepository
	reportRepo       repository.ReportRepository
}

func NewExportService(jobRepo repository.JobRepository, statisticService StatisticService, storageService StorageService, stockRepo repository.StockRepository, reportRepo repository.ReportRepository) ExportService {
	return &exportServiceImpl{
		jobRepo:          jobRepo,
		statisticService: statisticService,
		storageService:   storageService,
		stockRepo:        stockRepo,
		reportRepo:       reportRepo,
	}
}

func (s *exportServiceImpl) ProcessExportStockMovement(ctx context.Context, jobID int, filtersJSON string) error {
	s.jobRepo.UpdateExportJobStatus(ctx, jobID, "PROCESSING", nil, nil)

	req := dto.StatisticFilterRequest{}
	_ = json.Unmarshal([]byte(filtersJSON), &req)

	data, err := s.statisticService.GetStockMovementStatistics(ctx, req)
	if err != nil {
		errMsg := err.Error()
		s.jobRepo.UpdateExportJobStatus(ctx, jobID, "FAILED", nil, &errMsg)
		return err
	}

	// Buat file Excel
	f := excelize.NewFile()
	defer func() {
		if err := f.Close(); err != nil {}
	}()

	sheetName := "Stock Movements"
	f.SetSheetName("Sheet1", sheetName)

	// Set Headers
	headers := []string{"SKU", "Nama Produk", "Stok Saat Ini", "Total Terjual", "Total Masuk", "Rata-rata Terjual Harian", "Estimasi Hari Habis", "Status"}
	for i, h := range headers {
		cell, _ := excelize.CoordinatesToCellName(i+1, 1)
		f.SetCellValue(sheetName, cell, h)
	}

	// Set Data
	for r, row := range data.Summary {
		f.SetCellValue(sheetName, fmt.Sprintf("A%d", r+2), row.SKU)
		f.SetCellValue(sheetName, fmt.Sprintf("B%d", r+2), row.Name)
		f.SetCellValue(sheetName, fmt.Sprintf("C%d", r+2), row.CurrentStock)
		f.SetCellValue(sheetName, fmt.Sprintf("D%d", r+2), row.TotalSold)
		f.SetCellValue(sheetName, fmt.Sprintf("E%d", r+2), row.TotalInbound)
		f.SetCellValue(sheetName, fmt.Sprintf("F%d", r+2), row.AvgDailySales)

		var estimasi string
		if row.DaysOfInventory != nil {
			if *row.DaysOfInventory == -1 {
				estimasi = "N/A"
			} else {
				estimasi = fmt.Sprintf("%.1f", *row.DaysOfInventory)
			}
		}
		f.SetCellValue(sheetName, fmt.Sprintf("G%d", r+2), estimasi)
		f.SetCellValue(sheetName, fmt.Sprintf("H%d", r+2), row.Status)
	}

	// Tulis ke buffer
	var b bytes.Buffer
	if err := f.Write(&b); err != nil {
		errMsg := err.Error()
		s.jobRepo.UpdateExportJobStatus(ctx, jobID, "FAILED", nil, &errMsg)
		return err
	}

	// Upload ke R2
	fileName := req.ExportName
	if fileName == "" {
		fileName = fmt.Sprintf("stock_movement_export_%s.xlsx", req.StartDate)
	} else if !strings.HasSuffix(fileName, ".xlsx") {
		fileName += ".xlsx"
	}
	url, err := s.storageService.UploadFile(ctx, b.Bytes(), fileName, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "exports")
	if err != nil {
		errMsg := err.Error()
		s.jobRepo.UpdateExportJobStatus(ctx, jobID, "FAILED", nil, &errMsg)
		return err
	}

	// Update DB
	s.jobRepo.UpdateExportJobStatus(ctx, jobID, "COMPLETED", &url, nil)
	return nil
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
		errMsg := err.Error()
		s.jobRepo.UpdateExportJobStatus(ctx, jobID, "FAILED", nil, &errMsg)
		return err
	}

	f := excelize.NewFile()
	defer f.Close()

	sheetName := "Stock Timeline"
	f.SetSheetName("Sheet1", sheetName)

	headers := []string{"Tanggal", "Total Masuk", "Total Keluar", "Net Perubahan"}
	for i, h := range headers {
		cell, _ := excelize.CoordinatesToCellName(i+1, 1)
		f.SetCellValue(sheetName, cell, h)
	}

	for r, row := range data {
		f.SetCellValue(sheetName, fmt.Sprintf("A%d", r+2), row.Date)
		f.SetCellValue(sheetName, fmt.Sprintf("B%d", r+2), row.TotalIn)
		f.SetCellValue(sheetName, fmt.Sprintf("C%d", r+2), row.TotalOut)
		f.SetCellValue(sheetName, fmt.Sprintf("D%d", r+2), row.NetChange)
	}

	var b bytes.Buffer
	if err := f.Write(&b); err != nil {
		errMsg := err.Error()
		s.jobRepo.UpdateExportJobStatus(ctx, jobID, "FAILED", nil, &errMsg)
		return err
	}

	fileName := req.ExportName
	if fileName == "" {
		fileName = "stock_timeline_export.xlsx"
	} else if !strings.HasSuffix(fileName, ".xlsx") {
		fileName += ".xlsx"
	}
	url, err := s.storageService.UploadFile(ctx, b.Bytes(), fileName, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "exports")
	if err != nil {
		errMsg := err.Error()
		s.jobRepo.UpdateExportJobStatus(ctx, jobID, "FAILED", nil, &errMsg)
		return err
	}

	s.jobRepo.UpdateExportJobStatus(ctx, jobID, "COMPLETED", &url, nil)
	return nil
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
		errMsg := err.Error()
		s.jobRepo.UpdateExportJobStatus(ctx, jobID, "FAILED", nil, &errMsg)
		return err
	}
	logs := result.Data

	f := excelize.NewFile()
	sheetName := "Batch Log"
	f.SetSheetName("Sheet1", sheetName)

	headers := []string{"No", "Tanggal", "SKU", "Nama Produk", "Tipe Mutasi", "Jumlah", "Dari Lokasi", "Ke Lokasi", "Keterangan", "User"}
	for i, h := range headers {
		cell, _ := excelize.CoordinatesToCellName(i+1, 1)
		f.SetCellValue(sheetName, cell, h)
	}

	for i, logItem := range logs {
		row := i + 2
		f.SetCellValue(sheetName, fmt.Sprintf("A%d", row), i+1)
		f.SetCellValue(sheetName, fmt.Sprintf("B%d", row), logItem.CreatedAt)
		f.SetCellValue(sheetName, fmt.Sprintf("C%d", row), logItem.SKU)
		f.SetCellValue(sheetName, fmt.Sprintf("D%d", row), logItem.ProductName)
		f.SetCellValue(sheetName, fmt.Sprintf("E%d", row), logItem.MovementType)
		f.SetCellValue(sheetName, fmt.Sprintf("F%d", row), logItem.Quantity)
		f.SetCellValue(sheetName, fmt.Sprintf("G%d", row), logItem.FromLocation)
		f.SetCellValue(sheetName, fmt.Sprintf("H%d", row), logItem.ToLocation)
		f.SetCellValue(sheetName, fmt.Sprintf("I%d", row), logItem.Notes)
		f.SetCellValue(sheetName, fmt.Sprintf("J%d", row), logItem.User)
	}

	// Auto fit columns roughly
	f.SetColWidth(sheetName, "A", "A", 5)
	f.SetColWidth(sheetName, "B", "B", 20)
	f.SetColWidth(sheetName, "C", "C", 15)
	f.SetColWidth(sheetName, "D", "D", 35)
	f.SetColWidth(sheetName, "E", "E", 15)
	f.SetColWidth(sheetName, "I", "I", 25)

	var b bytes.Buffer
	if err := f.Write(&b); err != nil {
		errMsg := err.Error()
		s.jobRepo.UpdateExportJobStatus(ctx, jobID, "FAILED", nil, &errMsg)
		return err
	}

	fileName := fmt.Sprintf("batch_log_export_%s.xlsx", filter.StartDate)
	if filter.ExportName != "" {
		fileName = filter.ExportName
		if !strings.HasSuffix(fileName, ".xlsx") {
			fileName += ".xlsx"
		}
	}
	url, err := s.storageService.UploadFile(ctx, b.Bytes(), fileName, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "exports")
	if err != nil {
		errMsg := err.Error()
		s.jobRepo.UpdateExportJobStatus(ctx, jobID, "FAILED", nil, &errMsg)
		return err
	}

	s.jobRepo.UpdateExportJobStatus(ctx, jobID, "COMPLETED", &url, nil)
	return nil
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
		errMsg := err.Error()
		s.jobRepo.UpdateExportJobStatus(ctx, jobID, "FAILED", nil, &errMsg)
		return err
	}

	f := excelize.NewFile()
	defer func() {
		if err := f.Close(); err != nil {
			fmt.Println(err)
		}
	}()

	rawSheet := "Data Mentah"
	f.SetSheetName("Sheet1", rawSheet)

	f.SetCellValue(rawSheet, "A1", "SKU")
	f.SetCellValue(rawSheet, "B1", "Nama Produk")
	f.SetCellValue(rawSheet, "C1", "Lokasi")
	f.SetCellValue(rawSheet, "D1", "Kuantitas")

	headerStyle, _ := f.NewStyle(&excelize.Style{
		Fill: excelize.Fill{Type: "pattern", Color: []string{"#D9E1F2"}, Pattern: 1},
		Font: &excelize.Font{Bold: true},
		Alignment: &excelize.Alignment{Horizontal: "center", Vertical: "center"},
		Border: []excelize.Border{
			{Type: "top", Color: "000000", Style: 1},
			{Type: "bottom", Color: "000000", Style: 1},
			{Type: "left", Color: "000000", Style: 1},
			{Type: "right", Color: "000000", Style: 1},
		},
	})

	f.SetCellStyle(rawSheet, "A1", "D1", headerStyle)
	f.SetColWidth(rawSheet, "A", "A", 20)
	f.SetColWidth(rawSheet, "B", "B", 50)
	f.SetColWidth(rawSheet, "C", "C", 15)
	f.SetColWidth(rawSheet, "D", "D", 12)

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

		f.SetCellValue(rawSheet, fmt.Sprintf("A%d", rowIdx), row.Sku)
		f.SetCellValue(rawSheet, fmt.Sprintf("B%d", rowIdx), row.NamaProduk)
		f.SetCellValue(rawSheet, fmt.Sprintf("C%d", rowIdx), lokasi)
		f.SetCellValue(rawSheet, fmt.Sprintf("D%d", rowIdx), row.Kuantitas)

		if row.Kuantitas < 0 {
			f.SetCellStyle(rawSheet, fmt.Sprintf("D%d", rowIdx), fmt.Sprintf("D%d", rowIdx), redStyle)
		}

		// Pivot processing
		if _, exists := pivotData[row.Sku]; !exists {
			pivotData[row.Sku] = make(map[string]interface{})
			pivotData[row.Sku]["Sku"] = row.Sku
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
	f.SetCellValue(pivotSheet, "A2", "SKU")
	f.SetCellValue(pivotSheet, "B2", "Nama Produk")
	colIdx := 3
	for _, loc := range locationCodes {
		colName, _ := excelize.ColumnNumberToName(colIdx)
		f.SetCellValue(pivotSheet, fmt.Sprintf("%s2", colName), loc)
		f.SetColWidth(pivotSheet, colName, colName, 10)
		colIdx++
	}
	colName, _ := excelize.ColumnNumberToName(colIdx)
	f.SetCellValue(pivotSheet, fmt.Sprintf("%s2", colName), "Grand Total")
	f.SetColWidth(pivotSheet, colName, colName, 15)

	pivotHeaderStyle, _ := f.NewStyle(&excelize.Style{
		Fill: excelize.Fill{Type: "pattern", Color: []string{"#4472C4"}, Pattern: 1},
		Font: &excelize.Font{Bold: true, Color: "#FFFFFF"},
		Alignment: &excelize.Alignment{Horizontal: "center", Vertical: "center"},
		Border: []excelize.Border{
			{Type: "top", Color: "000000", Style: 1},
			{Type: "bottom", Color: "000000", Style: 1},
			{Type: "left", Color: "000000", Style: 1},
			{Type: "right", Color: "000000", Style: 1},
		},
	})
	f.SetCellStyle(pivotSheet, "A2", fmt.Sprintf("%s2", colName), pivotHeaderStyle)
	f.SetColWidth(pivotSheet, "A", "A", 20)
	f.SetColWidth(pivotSheet, "B", "B", 50)

	pRowIdx := 3
	for _, sku := range skus {
		pData := pivotData[sku]
		f.SetCellValue(pivotSheet, fmt.Sprintf("A%d", pRowIdx), pData["Sku"])
		f.SetCellValue(pivotSheet, fmt.Sprintf("B%d", pRowIdx), pData["NamaProduk"])
		
		cIdx := 3
		for _, loc := range locationCodes {
			val, ok := pData[loc].(int)
			cName, _ := excelize.ColumnNumberToName(cIdx)
			cellName := fmt.Sprintf("%s%d", cName, pRowIdx)
			if ok && val != 0 {
				f.SetCellValue(pivotSheet, cellName, val)
				if val < 0 {
					f.SetCellStyle(pivotSheet, cellName, cellName, redStyle)
				}
			}
			cIdx++
		}
		
		gt, _ := pData["GrandTotal"].(int)
		cName, _ := excelize.ColumnNumberToName(cIdx)
		cellName := fmt.Sprintf("%s%d", cName, pRowIdx)
		f.SetCellValue(pivotSheet, cellName, gt)
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

	var b bytes.Buffer
	if err := f.Write(&b); err != nil {
		errMsg := err.Error()
		s.jobRepo.UpdateExportJobStatus(ctx, jobID, "FAILED", nil, &errMsg)
		return err
	}

	fileName := "stock_report.xlsx"
	if filter.ExportName != "" {
		fileName = filter.ExportName
		if !strings.HasSuffix(fileName, ".xlsx") {
			fileName += ".xlsx"
		}
	}

	url, err := s.storageService.UploadFile(ctx, b.Bytes(), fileName, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "exports")
	if err != nil {
		errMsg := err.Error()
		s.jobRepo.UpdateExportJobStatus(ctx, jobID, "FAILED", nil, &errMsg)
		return err
	}

	s.jobRepo.UpdateExportJobStatus(ctx, jobID, "COMPLETED", &url, nil)
	return nil
}
