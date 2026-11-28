package usecase

import (
	"bytes"
	"context"
	"errors"
	"testing"
	"time"

	analytics_dto "github.com/dps-wmhris/backend/internal/modules/analytics/application/dto"
	analytics_port "github.com/dps-wmhris/backend/internal/modules/analytics/port"
	system_domain "github.com/dps-wmhris/backend/internal/modules/system/domain"
	system_port "github.com/dps-wmhris/backend/internal/modules/system/port"
	"github.com/dps-wmhris/backend/internal/shared/kernel"
	"github.com/xuri/excelize/v2"
)

type mockReportRepo7C struct {
	analytics_port.ReportRepository
	buildings  []string
	purposes   []string
	relations  []map[string]any
	exportJobs []system_domain.ExportJob
	reportRows []analytics_dto.StockReportRow
}

func (m *mockReportRepo7C) GetDistinctBuildings(_ context.Context) ([]string, error) {
	return m.buildings, nil
}

func (m *mockReportRepo7C) GetDistinctPurposes(_ context.Context) ([]string, error) {
	return m.purposes, nil
}

func (m *mockReportRepo7C) GetBuildingPurposeRelations(_ context.Context) ([]map[string]any, error) {
	return m.relations, nil
}

func (m *mockReportRepo7C) GetUserExportJobs(_ context.Context, _ int) ([]system_domain.ExportJob, error) {
	return m.exportJobs, nil
}

func (m *mockReportRepo7C) GetStockReportData(_ context.Context, _ analytics_dto.StockReportFilter) ([]analytics_dto.StockReportRow, error) {
	return m.reportRows, nil
}

type mockStatRepo7C struct {
	analytics_port.StatisticRepository
	invValues  []analytics_dto.InventoryValueResponse
	pkgRows    []analytics_dto.PackageComponentDBRow
	locLoads   []analytics_dto.LocationLoad
	locDetErr  error
}

func (m *mockStatRepo7C) GetInventoryValueStats(_ context.Context, _ analytics_dto.StatisticFilterRequest) ([]analytics_dto.InventoryValueResponse, error) {
	return m.invValues, nil
}

func (m *mockStatRepo7C) GetPackageComponentAnalysis(_ context.Context, _ analytics_dto.StatisticFilterRequest) ([]analytics_dto.PackageComponentDBRow, error) {
	return m.pkgRows, nil
}

func (m *mockStatRepo7C) GetLocationLoads(_ context.Context, _ analytics_dto.StatisticFilterRequest) ([]analytics_dto.LocationLoad, error) {
	return m.locLoads, nil
}

func (m *mockStatRepo7C) GetDuplicateLocations(_ context.Context, _ analytics_dto.StatisticFilterRequest) ([]analytics_dto.DuplicateProductLocation, error) {
	return []analytics_dto.DuplicateProductLocation{}, nil
}

func (m *mockStatRepo7C) GetLocationCapacityDetails(_ context.Context, _ int, _ analytics_dto.StatisticFilterRequest) ([]analytics_dto.LocationCapacityDetailResponse, error) {
	return nil, m.locDetErr
}

type mockJobRepo7C struct {
	system_port.JobRepository
	updateErr    error
	updatedState string
}

func (m *mockJobRepo7C) UpdateExportJobStatus(_ context.Context, _ int, status string, _ *string, _ *string) error {
	m.updatedState = status
	return m.updateErr
}

type mockStorageSvc7C struct {
	system_port.StorageService
	uploadedBytes []byte
	uploadedKey   string
}

func (m *mockStorageSvc7C) UploadFile(_ context.Context, data []byte, fileName string, _ string, _ string) (string, error) {
	m.uploadedBytes = append([]byte(nil), data...)
	m.uploadedKey = fileName
	return "exports/" + fileName, nil
}

func TestReportService_NilSafeRelationsAndExportJobs(t *testing.T) {
	fp := "exports/test.xlsx"
	filters := `{"exportType":"CUSTOM_REPORT"}`
	repo := &mockReportRepo7C{
		buildings: []string{"B1"},
		purposes:  []string{"DISPLAY"},
		relations: []map[string]any{
			{"purpose": nil, "building": "B1"},       // Must skip safely without panic
			{"purpose": "DISPLAY", "building": "B1"}, // Valid
		},
		exportJobs: []system_domain.ExportJob{
			{ImmutableEntity: kernel.ImmutableEntity{ID: 10, CreatedAt: time.Now()}, Status: "COMPLETED", FilePath: &fp, Filters: &filters},
		},
	}

	svc := NewReportService(repo)
	ctx := context.Background()

	fRes, err := svc.GetReportFilters(ctx)
	if err != nil {
		t.Fatalf("GetReportFilters failed: %v", err)
	}
	if len(fRes.BuildingsByPurpose["DISPLAY"]) != 1 || fRes.BuildingsByPurpose["DISPLAY"][0] != "B1" {
		t.Fatalf("unexpected BuildingsByPurpose: %+v", fRes.BuildingsByPurpose)
	}

	jobs, err := svc.GetUserExportJobs(ctx, 1)
	if err != nil || len(jobs) != 1 || jobs[0].JobType != "CUSTOM_REPORT" || jobs[0].DownloadURL == nil || *jobs[0].DownloadURL != "/api/exports/download/10" {
		t.Fatalf("unexpected export jobs: %+v err=%v", jobs, err)
	}
}

func TestStatisticService_InventoryBoundariesAndDeterministicPackageSort(t *testing.T) {
	statRepo := &mockStatRepo7C{
		invValues: []analytics_dto.InventoryValueResponse{
			{ProductID: 1, SKU: "NEG", TotalQuantity: -2, TotalValue: 0},
			{ProductID: 2, SKU: "EMP", TotalQuantity: 0, TotalValue: 0},
			{ProductID: 3, SKU: "CRT", TotalQuantity: 49, TotalValue: 490},
			{ProductID: 4, SKU: "WRN", TotalQuantity: 50, TotalValue: 500},
			{ProductID: 5, SKU: "OVR100", TotalQuantity: 100, TotalValue: 1000},
		},
		pkgRows: []analytics_dto.PackageComponentDBRow{
			{ComponentProductID: 1, ComponentSKU: "SKU-B", CurrentStock: 5, SubtotalNeeded: 20},
			{ComponentProductID: 2, ComponentSKU: "SKU-A", CurrentStock: 5, SubtotalNeeded: 20},
			{ComponentProductID: 3, ComponentSKU: "SKU-TOP", CurrentStock: 5, SubtotalNeeded: 50},
		},
	}

	svc := NewStatisticService(statRepo, nil)
	ctx := context.Background()

	vals, err := svc.GetInventoryValueStatistics(ctx, analytics_dto.StatisticFilterRequest{})
	if err != nil || len(vals) != 5 {
		t.Fatalf("GetInventoryValueStatistics failed: len=%d err=%v", len(vals), err)
	}
	wantStatuses := []string{"NEGATIVE", "EMPTY", "CRITICAL", "WARNING", "OVERSTOCK"}
	for i, want := range wantStatuses {
		if vals[i].Status != want {
			t.Errorf("item %s (qty=%.0f): got status %q, want %q", vals[i].SKU, vals[i].TotalQuantity, vals[i].Status, want)
		}
	}

	pkgs, err := svc.GetPackageComponentAnalysis(ctx, analytics_dto.StatisticFilterRequest{})
	if err != nil || len(pkgs) != 3 {
		t.Fatalf("GetPackageComponentAnalysis failed: len=%d err=%v", len(pkgs), err)
	}
	if pkgs[0].SKU != "SKU-TOP" || pkgs[1].SKU != "SKU-A" || pkgs[2].SKU != "SKU-B" {
		t.Fatalf("expected deterministic order [SKU-TOP, SKU-A, SKU-B], got [%s, %s, %s]", pkgs[0].SKU, pkgs[1].SKU, pkgs[2].SKU)
	}
}

func TestExportService_PivotSKUPopulatedAndErrorPropagation(t *testing.T) {
	ctx := context.Background()
	locCode := "A-01"

	reportRepo := &mockReportRepo7C{
		reportRows: []analytics_dto.StockReportRow{
			{Sku: "SKU-PIVOT-1", NamaProduk: "Widget", Lokasi: &locCode, Kuantitas: 5},
		},
	}
	statRepo := &mockStatRepo7C{
		locLoads:  []analytics_dto.LocationLoad{{LocationID: 9, Code: "A-01"}},
		locDetErr: errors.New("db capacity timeout"),
	}
	statSvc := NewStatisticService(statRepo, nil)
	jobRepo := &mockJobRepo7C{}
	storageSvc := &mockStorageSvc7C{}
	exportSvc := NewExportService(jobRepo, statSvc, storageSvc, nil, reportRepo, nil, nil)

	// 1. Stock report Pivot Summary sheet MUST populate SKU column (regression test for pData["Sku"] bug)
	if err := exportSvc.ProcessExportStockReport(ctx, 1, `{}`); err != nil {
		t.Fatalf("ProcessExportStockReport failed: %v", err)
	}
	if len(storageSvc.uploadedBytes) == 0 || jobRepo.updatedState != "COMPLETED" {
		t.Fatalf("expected uploaded workbook and COMPLETED status, bytes=%d status=%q", len(storageSvc.uploadedBytes), jobRepo.updatedState)
	}
	wb, err := excelize.OpenReader(bytes.NewReader(storageSvc.uploadedBytes))
	if err != nil {
		t.Fatalf("failed to open exported xlsx: %v", err)
	}
	defer wb.Close()

	pivotSheet := wb.GetSheetName(wb.GetActiveSheetIndex())
	skuCell, err := wb.GetCellValue(pivotSheet, "A3")
	if err != nil || skuCell != "SKU-PIVOT-1" {
		t.Fatalf("Pivot sheet A3 must contain SKU-PIVOT-1, got %q err=%v", skuCell, err)
	}

	// 2. finalizeExportJob propagates jobRepo.UpdateExportJobStatus error
	jobRepo.updateErr = errors.New("db status write failed")
	if err := exportSvc.ProcessExportStockReport(ctx, 1, `{}`); !errors.Is(err, jobRepo.updateErr) {
		t.Fatalf("expected UpdateExportJobStatus error propagation, got %v", err)
	}
	jobRepo.updateErr = nil

	// 3. Malformed filtersJSON returns error instead of silently ignoring
	if err := exportSvc.ProcessExportStockMovement(ctx, 2, `{bad-json`); err == nil {
		t.Fatal("expected error on invalid filtersJSON")
	}

	// 4. Detailed location capacity export propagates GetLocationCapacityDetails DB error
	if err := exportSvc.ProcessExportLocationCapacity(ctx, 3, `{"exportFormat":"detailed"}`); err == nil {
		t.Fatal("expected error propagation when GetLocationCapacityDetails fails")
	}
}
