package usecase

import (
	"context"
	"encoding/json"
	"fmt"
	"log"

	analytics_dto "github.com/dps-wmhris/backend/internal/modules/analytics/application/dto"
	analytics_port "github.com/dps-wmhris/backend/internal/modules/analytics/port"
	catalog_port "github.com/dps-wmhris/backend/internal/modules/catalog/port"
	inventory_dto "github.com/dps-wmhris/backend/internal/modules/inventory/application/dto"
	inventory_port "github.com/dps-wmhris/backend/internal/modules/inventory/port"
	system_port "github.com/dps-wmhris/backend/internal/modules/system/port"
	"github.com/dps-wmhris/backend/internal/shared/i18n"
	"github.com/dps-wmhris/backend/internal/shared/utils"
	"github.com/xuri/excelize/v2"
)

func translateStockMovementStatus(ctx context.Context, status string) string {
	switch status {
	case "SAFE":
		return i18n.T(ctx, "analytics.movement.status_safe")
	case "NEGATIVE":
		return i18n.T(ctx, "analytics.movement.status_negative")
	case "EMPTY":
		return i18n.T(ctx, "analytics.movement.status_empty")
	case "CRITICAL":
		return i18n.T(ctx, "analytics.movement.status_critical")
	case "WARNING":
		return i18n.T(ctx, "analytics.movement.status_warning")
	case "OVERSTOCK":
		return i18n.T(ctx, "analytics.movement.status_overstock")
	default:
		return status
	}
}

// ExportService is a compatibility alias for analytics/port.ExportService.
type ExportService = analytics_port.ExportService

type exportServiceImpl struct {
	jobRepo          system_port.JobRepository
	statisticService analytics_port.StatisticService
	storageService   system_port.StorageService
	stockRepo        inventory_port.StockRepository
	reportRepo       analytics_port.ReportRepository
	productRepo      catalog_port.ProductRepository
	categoryRepo     catalog_port.CategoryRepository
}

// NewExportService creates an ExportService wired with ports for background worker Excel exports.
func NewExportService(
	jobRepo system_port.JobRepository,
	statisticService analytics_port.StatisticService,
	storageService system_port.StorageService,
	stockRepo inventory_port.StockRepository,
	reportRepo analytics_port.ReportRepository,
	productRepo catalog_port.ProductRepository,
	categoryRepo catalog_port.CategoryRepository,
) analytics_port.ExportService {
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

func closeWorkbook(f *excelize.File) {
	if err := f.Close(); err != nil {
		log.Printf("failed to close excel workbook: %v", err)
	}
}

func (s *exportServiceImpl) ProcessExportStockMovement(ctx context.Context, jobID int, filtersJSON string) error {
	var req analytics_dto.StatisticFilterRequest
	if filtersJSON != "" {
		if err := json.Unmarshal([]byte(filtersJSON), &req); err != nil {
			return fmt.Errorf("invalid stock movement export filters: %w", err)
		}
	}

	data, err := s.statisticService.GetStockMovementStatistics(ctx, req)
	if err != nil {
		return err
	}

	f := excelize.NewFile()
	defer closeWorkbook(f)
	styles := utils.InitExcelStyles(f)

	sheetName := sanitizeExcelSheetName(i18n.T(ctx, "analytics.export.sheet_stock_movements"), "Stock Movements")
	_ = f.SetSheetName("Sheet1", sheetName) // #nosec G104

	utils.SetLocalizedHeaders(ctx, f, sheetName, []string{
		"common.label.sku",
		"common.label.product_name",
		"common.label.current_stock",
		"analytics.export.col_total_sold",
		"analytics.export.col_total_inbound",
		"analytics.export.col_daily_avg_sold",
		"analytics.export.col_est_days_out",
		"common.label.status",
	}, styles.Header)

	for r, row := range data.Summary {
		var estimasi string
		if row.DaysOfInventory != nil {
			if *row.DaysOfInventory == -1 {
				estimasi = "N/A"
			} else {
				estimasi = fmt.Sprintf("%.1f", *row.DaysOfInventory)
			}
		}

		_ = f.SetSheetRow(sheetName, fmt.Sprintf("A%d", r+2), &[]any{ // #nosec G104
			row.SKU, row.Name, row.CurrentStock, row.TotalSold, row.TotalInbound, row.AvgDailySales, estimasi, translateStockMovementStatus(ctx, row.Status),
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
	var req analytics_dto.StatisticFilterRequest
	if filtersJSON != "" {
		if err := json.Unmarshal([]byte(filtersJSON), &req); err != nil {
			return fmt.Errorf("invalid stock timeline export filters: %w", err)
		}
	}

	if req.StartDate == "" {
		req.StartDate = "2020-01-01"
	}
	if req.EndDate == "" {
		req.EndDate = "2030-01-01"
	}

	data, err := s.statisticService.GetStockTimelineStatistics(ctx, req)
	if err != nil {
		return err
	}

	f := excelize.NewFile()
	defer closeWorkbook(f)
	styles := utils.InitExcelStyles(f)

	sheetName := sanitizeExcelSheetName(i18n.T(ctx, "analytics.timeline.title"), "Stock Timeline")
	_ = f.SetSheetName("Sheet1", sheetName) // #nosec G104

	utils.SetLocalizedHeaders(ctx, f, sheetName, []string{
		"common.label.date",
		"analytics.export.col_total_inbound",
		"analytics.export.col_total_outbound",
		"analytics.export.col_net_change",
	}, styles.Header)

	for r, row := range data {
		_ = f.SetSheetRow(sheetName, fmt.Sprintf("A%d", r+2), &[]any{row.Date, row.TotalIn, row.TotalOut, row.NetChange}) // #nosec G104
	}

	utils.SetColStyles(f, sheetName, map[string]int{"B": styles.NumInt, "C": styles.NumInt, "D": styles.NumInt})
	_ = f.SetCellStyle(sheetName, "A1", "D1", styles.Header) // #nosec G104

	utils.SetColWidths(f, sheetName, map[string]float64{"A": 20, "B": 20, "C": 20, "D": 20})

	fileName := utils.GenerateExportFileName(req.ExportName, "stock_timeline_export")
	return finalizeExportJob(ctx, f, jobID, fileName, "exports", s.jobRepo, s.storageService)
}

func (s *exportServiceImpl) ProcessExportBatchLog(ctx context.Context, jobID int, filtersJSON string) error {
	var filter inventory_dto.BatchLogFilter
	if filtersJSON != "" {
		if err := json.Unmarshal([]byte(filtersJSON), &filter); err != nil {
			return fmt.Errorf("invalid batch log export filters: %w", err)
		}
	}

	filter.Page = 1
	filter.Limit = 999999

	if filter.StartDate == "" {
		filter.StartDate = "2020-01-01"
	}
	if filter.EndDate == "" {
		filter.EndDate = "2030-01-01"
	}

	result, err := s.stockRepo.GetBatchLogs(ctx, filter)
	if err != nil {
		return err
	}
	logs := result.Data

	f := excelize.NewFile()
	defer closeWorkbook(f)
	styles := utils.InitExcelStyles(f)
	sheetName := sanitizeExcelSheetName(i18n.T(ctx, "analytics.export.sheet_batch_log"), "Batch Log")
	_ = f.SetSheetName("Sheet1", sheetName) // #nosec G104

	utils.SetLocalizedHeaders(ctx, f, sheetName, []string{
		"analytics.export.col_no",
		"common.label.date",
		"common.label.sku",
		"common.label.product_name",
		"analytics.export.col_mutation_type",
		"common.label.quantity",
		"common.label.from_location",
		"common.label.to_location",
		"analytics.export.col_notes",
		"common.label.user",
	}, styles.Header)

	for i, logItem := range logs {
		row := i + 2
		_ = f.SetSheetRow(sheetName, fmt.Sprintf("A%d", row), &[]any{ // #nosec G104
			i + 1, logItem.CreatedAt, logItem.SKU, logItem.ProductName, logItem.MovementType, logItem.Quantity, logItem.FromLocation, logItem.ToLocation, logItem.Notes, logItem.User,
		})
	}

	utils.SetColStyles(f, sheetName, map[string]int{"F": styles.NumInt})
	_ = f.SetCellStyle(sheetName, "A1", "J1", styles.Header) // #nosec G104

	utils.SetColWidths(f, sheetName, map[string]float64{
		"A": 5, "B": 20, "C": 15, "D": 35, "E": 30,
		"F": 15, "G": 15, "H": 15, "I": 35, "J": 25,
	})

	fileName := utils.GenerateExportFileName(filter.ExportName, "batch_log_export")
	return finalizeExportJob(ctx, f, jobID, fileName, "exports", s.jobRepo, s.storageService)
}

func (s *exportServiceImpl) ProcessExportStockReport(ctx context.Context, jobID int, filtersJSON string) error {
	var filter analytics_dto.StockReportFilter
	if filtersJSON != "" {
		if err := json.Unmarshal([]byte(filtersJSON), &filter); err != nil {
			return fmt.Errorf("failed to parse filters: %w", err)
		}
	}

	data, err := s.reportRepo.GetStockReportData(ctx, filter)
	if err != nil {
		return err
	}

	f := excelize.NewFile()
	defer closeWorkbook(f)
	styles := utils.InitExcelStyles(f)

	rawSheet := sanitizeExcelSheetName(i18n.T(ctx, "analytics.export.sheet_raw_data"), "Raw Data")
	_ = f.SetSheetName("Sheet1", rawSheet) // #nosec G104

	utils.SetLocalizedHeaders(ctx, f, rawSheet, []string{
		"common.label.sku",
		"common.label.product_name",
		"common.label.location",
		"common.label.quantity",
	}, styles.Header)
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

	pivotData := make(map[string]map[string]any)
	var skus []string
	var locationCodes []string
	locSet := make(map[string]bool)

	rowIdx := 2
	for _, row := range data {
		lokasi := "-"
		if row.Lokasi != nil && *row.Lokasi != "" {
			lokasi = *row.Lokasi
		}

		_ = f.SetSheetRow(rawSheet, fmt.Sprintf("A%d", rowIdx), &[]any{row.Sku, row.NamaProduk, lokasi, row.Kuantitas}) // #nosec G104

		if row.Kuantitas < 0 {
			_ = f.SetCellStyle(rawSheet, fmt.Sprintf("D%d", rowIdx), fmt.Sprintf("D%d", rowIdx), redStyle) // #nosec G104
		}

		if _, exists := pivotData[row.Sku]; !exists {
			pivotData[row.Sku] = map[string]any{
				"SKU":        row.Sku,
				"NamaProduk": row.NamaProduk,
				"GrandTotal": 0,
			}
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

	// Create Pivot Summary Sheet
	pivotSheet := sanitizeExcelSheetName(i18n.T(ctx, "analytics.export.sheet_stock_summary"), "Stock Summary")
	_, _ = f.NewSheet(pivotSheet) // #nosec G104

	_ = f.MergeCell(pivotSheet, "A1", "B1")                                                     // #nosec G104
	_ = f.SetCellValue(pivotSheet, "A1", i18n.T(ctx, "analytics.export.title_stock_summary")) // #nosec G104
	titleStyle, _ := f.NewStyle(&excelize.Style{
		Font:      &excelize.Font{Size: 14, Bold: true},
		Alignment: &excelize.Alignment{Horizontal: "center"},
	})
	_ = f.SetCellStyle(pivotSheet, "A1", "A1", titleStyle) // #nosec G104

	headers := []any{
		i18n.T(ctx, "common.label.sku"),
		i18n.T(ctx, "common.label.product_name"),
	}
	colIdx := 3
	for _, loc := range locationCodes {
		headers = append(headers, loc)
		colName, _ := excelize.ColumnNumberToName(colIdx)
		_ = f.SetColWidth(pivotSheet, colName, colName, 10) // #nosec G104
		colIdx++
	}
	headers = append(headers, i18n.T(ctx, "analytics.export.col_grand_total"))
	colName, _ := excelize.ColumnNumberToName(colIdx)
	_ = f.SetColWidth(pivotSheet, colName, colName, 15) // #nosec G104

	_ = f.SetSheetRow(pivotSheet, "A2", &headers)                                     // #nosec G104
	_ = f.SetCellStyle(pivotSheet, "A2", fmt.Sprintf("%s2", colName), styles.Header) // #nosec G104
	_ = f.SetColWidth(pivotSheet, "A", "A", 20)                                       // #nosec G104
	_ = f.SetColWidth(pivotSheet, "B", "B", 50)                                       // #nosec G104

	pRowIdx := 3
	for _, sku := range skus {
		pData := pivotData[sku]
		row := []any{pData["SKU"], pData["NamaProduk"]}

		cIdx := 3
		for _, loc := range locationCodes {
			val, ok := pData[loc].(int)
			if ok && val != 0 {
				row = append(row, val)
				if val < 0 {
					cName, _ := excelize.ColumnNumberToName(cIdx)
					cellName := fmt.Sprintf("%s%d", cName, pRowIdx)
					_ = f.SetCellStyle(pivotSheet, cellName, cellName, redStyle) // #nosec G104
				}
			} else {
				row = append(row, "")
			}
			cIdx++
		}

		gt, _ := pData["GrandTotal"].(int)
		row = append(row, gt)
		_ = f.SetSheetRow(pivotSheet, fmt.Sprintf("A%d", pRowIdx), &row) // #nosec G104

		cName, _ := excelize.ColumnNumberToName(cIdx)
		cellName := fmt.Sprintf("%s%d", cName, pRowIdx)
		if gt < 0 {
			_ = f.SetCellStyle(pivotSheet, cellName, cellName, boldRedStyle) // #nosec G104
		} else {
			_ = f.SetCellStyle(pivotSheet, cellName, cellName, boldStyle) // #nosec G104
		}

		pRowIdx++
	}

	if idx, err := f.GetSheetIndex(pivotSheet); err == nil {
		f.SetActiveSheet(idx)
	}

	fileName := utils.GenerateExportFileName(filter.ExportName, "stock_report")
	return finalizeExportJob(ctx, f, jobID, fileName, "exports", s.jobRepo, s.storageService)
}

func (s *exportServiceImpl) ProcessExportLocationCapacity(ctx context.Context, jobID int, filtersJSON string) error {
	var req analytics_dto.ExportLocationCapacityRequest
	if filtersJSON != "" {
		if err := json.Unmarshal([]byte(filtersJSON), &req); err != nil {
			return fmt.Errorf("invalid location capacity export filters: %w", err)
		}
	}

	stringifyFilter := func(val any) (string, error) {
		if val == nil {
			return "", nil
		}
		if str, ok := val.(string); ok {
			return str, nil
		}
		b, err := json.Marshal(val)
		if err != nil {
			return "", err
		}
		return string(b), nil
	}

	var err error
	statFilters := analytics_dto.StatisticFilterRequest{
		SearchQuery: req.SearchQuery,
	}
	if statFilters.CategoryId, err = stringifyFilter(req.CategoryId); err != nil {
		return err
	}
	if statFilters.Purpose, err = stringifyFilter(req.Purpose); err != nil {
		return err
	}
	if statFilters.Building, err = stringifyFilter(req.Building); err != nil {
		return err
	}
	if statFilters.Floor, err = stringifyFilter(req.Floor); err != nil {
		return err
	}

	data, err := s.statisticService.GetLocationAnalysis(ctx, statFilters)
	if err != nil {
		return err
	}

	f := excelize.NewFile()
	defer closeWorkbook(f)
	styles := utils.InitExcelStyles(f)

	sheetName := sanitizeExcelSheetName(i18n.T(ctx, "analytics.export.sheet_location_capacity"), "Location Capacity")
	_ = f.SetSheetName("Sheet1", sheetName) // #nosec G104

	isDetailed := req.ExportFormat == "detailed"

	if !isDetailed {
		headers := []string{
			"analytics.capacity.col_location_code",
			"common.label.building",
			"common.label.floor",
			"common.label.purpose",
			"analytics.capacity.col_sku_count",
			"common.label.quantity",
			"analytics.capacity.col_weight",
			"analytics.export.col_volume_cbm",
		}
		utils.SetLocalizedHeaders(ctx, f, sheetName, headers, styles.Header)

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

			_ = f.SetSheetRow(sheetName, fmt.Sprintf("A%d", r+2), &[]any{ // #nosec G104
				row.Code, building, floor, purpose, row.TotalProducts, row.TotalQuantity, row.TotalWeight / 1000, row.TotalCBM,
			})

			totalSKU += row.TotalProducts
			totalQty += row.TotalQuantity
			totalWeight += row.TotalWeight / 1000
			totalCBM += row.TotalCBM
		}

		lastRow := len(data.LocationLoads) + 2
		_ = f.SetSheetRow(sheetName, fmt.Sprintf("A%d", lastRow), &[]any{i18n.T(ctx, "analytics.export.col_grand_total"), "", "", "", totalSKU, totalQty, totalWeight, totalCBM}) // #nosec G104
		_ = f.MergeCell(sheetName, fmt.Sprintf("A%d", lastRow), fmt.Sprintf("D%d", lastRow))                                                                                    // #nosec G104

		utils.SetColStyles(f, sheetName, map[string]int{
			"E": styles.NumInt, "F": styles.NumInt,
			"G": styles.NumDec, "H": styles.NumDec,
		})

		_ = f.SetCellStyle(sheetName, "A1", "H1", styles.Header)                                                      // #nosec G104
		_ = f.SetCellStyle(sheetName, fmt.Sprintf("A%d", lastRow), fmt.Sprintf("D%d", lastRow), styles.Total)         // #nosec G104
		_ = f.SetCellStyle(sheetName, fmt.Sprintf("E%d", lastRow), fmt.Sprintf("F%d", lastRow), styles.TotalInt)      // #nosec G104
		_ = f.SetCellStyle(sheetName, fmt.Sprintf("G%d", lastRow), fmt.Sprintf("H%d", lastRow), styles.TotalDec)      // #nosec G104
		utils.SetColWidths(f, sheetName, map[string]float64{"A": 20, "B": 20, "C": 15, "D": 20, "E": 20, "F": 20, "G": 20, "H": 20})
	} else {
		headers := []string{
			"analytics.capacity.col_location_code",
			"common.label.building",
			"common.label.floor",
			"common.label.sku",
			"common.label.product_name",
			"common.label.category",
			"common.label.quantity",
			"analytics.capacity.col_weight",
			"analytics.export.col_volume_cbm",
		}
		utils.SetLocalizedHeaders(ctx, f, sheetName, headers, styles.Header)

		currentRow := 2
		var totalQty int
		var totalWeight, totalCBM float64

		for _, loc := range data.LocationLoads {
			details, err := s.statisticService.GetLocationCapacityDetails(ctx, loc.LocationID, statFilters)
			if err != nil {
				return fmt.Errorf("failed to fetch location capacity details for location %d: %w", loc.LocationID, err)
			}
			if len(details) == 0 {
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

			for _, det := range details {
				_ = f.SetSheetRow(sheetName, fmt.Sprintf("A%d", currentRow), &[]any{ // #nosec G104
					loc.Code, building, floor, det.SKU, det.Name, det.CategoryName, det.Quantity, det.TotalWeight / 1000, det.TotalCBM,
				})

				totalQty += det.Quantity
				totalWeight += det.TotalWeight / 1000
				totalCBM += det.TotalCBM
				currentRow++
			}
		}

		_ = f.SetSheetRow(sheetName, fmt.Sprintf("A%d", currentRow), &[]any{i18n.T(ctx, "analytics.export.col_grand_total"), "", "", "", "", "", totalQty, totalWeight, totalCBM}) // #nosec G104
		_ = f.MergeCell(sheetName, fmt.Sprintf("A%d", currentRow), fmt.Sprintf("F%d", currentRow))                                                                                // #nosec G104

		utils.SetColStyles(f, sheetName, map[string]int{
			"G": styles.NumInt, "H": styles.NumDec, "I": styles.NumDec,
		})

		_ = f.SetCellStyle(sheetName, "A1", "I1", styles.Header)                                                      // #nosec G104
		_ = f.SetCellStyle(sheetName, fmt.Sprintf("A%d", currentRow), fmt.Sprintf("F%d", currentRow), styles.Total)   // #nosec G104
		_ = f.SetCellStyle(sheetName, fmt.Sprintf("G%d", currentRow), fmt.Sprintf("G%d", currentRow), styles.TotalInt) // #nosec G104
		_ = f.SetCellStyle(sheetName, fmt.Sprintf("H%d", currentRow), fmt.Sprintf("I%d", currentRow), styles.TotalDec) // #nosec G104

		utils.SetColWidths(f, sheetName, map[string]float64{
			"A": 20, "B": 20, "C": 15, "D": 20,
			"E": 35, "F": 15, "G": 20, "H": 20, "I": 20,
		})
	}

	fileName := utils.GenerateExportFileName(req.ExportName, "location_capacity_export")
	return finalizeExportJob(ctx, f, jobID, fileName, "exports", s.jobRepo, s.storageService)
}
