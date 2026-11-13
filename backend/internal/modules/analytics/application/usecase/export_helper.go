package usecase

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"

	catalog_dto "github.com/dps-wmhris/backend/internal/modules/catalog/application/dto"
	system_mysql "github.com/dps-wmhris/backend/internal/modules/system/adapter/outbound/mysql"
	system_usecase "github.com/dps-wmhris/backend/internal/modules/system/application/usecase"
	"github.com/xuri/excelize/v2"
)

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

// finalizeExportJob menangani penulisan ke buffer, upload ke R2, dan update status job hingga selesai.
func finalizeExportJob(ctx context.Context, f *excelize.File, jobID int, fileName string, folder string, jobRepo system_mysql.JobRepository, storageService system_usecase.StorageService) error {
	var b bytes.Buffer
	if err := f.Write(&b); err != nil {
		return err
	}

	url, err := storageService.UploadFile(ctx, b.Bytes(), fileName, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", folder)
	if err != nil {
		return err
	}

	_ = jobRepo.UpdateExportJobStatus(ctx, jobID, "COMPLETED", &url, nil) // #nosec G104
	return nil
}
