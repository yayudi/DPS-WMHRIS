package usecase

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	catalog_dto "github.com/dps-wmhris/backend/internal/modules/catalog/application/dto"
	system_port "github.com/dps-wmhris/backend/internal/modules/system/port"
	"github.com/xuri/excelize/v2"
)

const (
	exportDateLayout                  = "2006-01-02"
	defaultTimelineExportLookbackDays = 365
	defaultBatchLogExportLookbackDays = 90
	excelMaxDataRows                  = 1048575 // Excel worksheet hard limit is 1,048,576 rows (1 header + 1,048,575 data rows)
)

var batchLogExportChunkSize = 5000

// resolveRollingDateRange fills missing startDate/endDate bounds using a dynamic rolling window
// anchored to now (or endDate when only endDate is supplied), avoiding hardcoded calendar sentinels.
func resolveRollingDateRange(startDate, endDate string, defaultLookbackDays int, now time.Time) (string, string) {
	start := strings.TrimSpace(startDate)
	end := strings.TrimSpace(endDate)

	if start != "" && end != "" {
		return start, end
	}
	if defaultLookbackDays <= 0 {
		defaultLookbackDays = defaultBatchLogExportLookbackDays
	}

	if end == "" {
		end = now.Format(exportDateLayout)
	}
	if start == "" {
		anchor := now
		if parsedEnd, err := time.Parse(exportDateLayout, end); err == nil {
			anchor = parsedEnd
		}
		start = anchor.AddDate(0, 0, -defaultLookbackDays).Format(exportDateLayout)
	}
	return start, end
}

var excelSheetReplacer = strings.NewReplacer(
	":", " ", "\\", " ", "/", " ", "?", " ", "*", " ", "[", " ", "]", " ",
)

// sanitizeExcelSheetName enforces Excel's 31-character and forbidden-character rules for worksheet names,
// falling back to a concise default when an i18n key is untranslated.
func sanitizeExcelSheetName(name, fallback string) string {
	trimmed := strings.TrimSpace(name)
	if trimmed == "" || strings.HasPrefix(trimmed, "analytics.") {
		trimmed = fallback
	}
	trimmed = strings.TrimSpace(excelSheetReplacer.Replace(trimmed))
	if trimmed == "" {
		trimmed = "Sheet1"
	}
	runes := []rune(trimmed)
	if len(runes) > 31 {
		trimmed = strings.TrimSpace(string(runes[:31]))
	}
	return trimmed
}

// CatalogExportFilterResult holds parsed product/package filter criteria and custom export naming.
type CatalogExportFilterResult struct {
	FilterReq  catalog_dto.ProductFilterRequest
	Status     string
	ExportName string
}

func parseCatalogExportFilter(filtersJSON string, forcePackageOnly bool) (CatalogExportFilterResult, error) {
	var filters map[string]any
	if filtersJSON != "" {
		if err := json.Unmarshal([]byte(filtersJSON), &filters); err != nil {
			return CatalogExportFilterResult{}, fmt.Errorf("invalid filters: %w", err)
		}
	}

	strOrDefault := func(key, def string) string {
		if v, ok := filters[key].(string); ok && v != "" {
			return v
		}
		return def
	}

	status := strOrDefault("status", "active")
	req := catalog_dto.ProductFilterRequest{
		Page:      1,
		Limit:     100000,
		Search:    strOrDefault("search", ""),
		SearchBy:  strOrDefault("searchBy", "name"),
		SortBy:    strOrDefault("sortBy", "sku"),
		SortOrder: strOrDefault("sortOrder", "ASC"),
		Status:    status,
	}

	if forcePackageOnly {
		pkgOnly := true
		req.PackageOnly = &pkgOnly
	} else if v, ok := filters["isPackage"].(bool); ok && v {
		pkgOnly := true
		req.PackageOnly = &pkgOnly
	}

	return CatalogExportFilterResult{
		FilterReq:  req,
		Status:     status,
		ExportName: strOrDefault("exportName", ""),
	}, nil
}

// finalizeExportJob writes the Excel workbook to memory, uploads it to object storage, and marks the export job COMPLETED.
func finalizeExportJob(
	ctx context.Context,
	f *excelize.File,
	jobID int,
	fileName string,
	folder string,
	jobRepo system_port.JobRepository,
	storageService system_port.StorageService,
) error {
	var b bytes.Buffer
	if err := f.Write(&b); err != nil {
		return err
	}

	url, err := storageService.UploadFile(ctx, b.Bytes(), fileName, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", folder)
	if err != nil {
		return err
	}

	return jobRepo.UpdateExportJobStatus(ctx, jobID, "COMPLETED", &url, nil)
}
