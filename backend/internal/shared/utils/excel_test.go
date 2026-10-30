package utils_test

import (
	"strings"
	"testing"

	"github.com/dps-wmhris/backend/internal/shared/utils"
)

func TestGenerateTemplateWithDropdown(t *testing.T) {
	cfg := utils.TemplateConfig{
		SheetName:        "Input Stok",
		Headers:          []string{"SKU", "LT (Lokasi)", "ACTUAL", "NOTES"},
		ColWidths:        map[string]float64{"A": 25, "B": 20, "C": 10, "D": 35},
		ValidationSheet:  "DataValidasi",
		ValidationCol:    "B",
		ValidationList:   []string{"LOC-01", "LOC-02", "LOC-03"},
		ValidationTitle:  "Lokasi Tidak Valid",
		ValidationMsg:    "Silakan pilih lokasi yang valid dari daftar dropdown.",
		ValidationMaxRow: 500,
	}

	f := utils.GenerateTemplateWithDropdown(cfg)
	if f == nil {
		t.Fatal("expected non-nil excelize.File")
	}
	defer f.Close()

	// Verify main sheet
	sheetList := f.GetSheetList()
	hasMainSheet := false
	hasValidSheet := false
	for _, s := range sheetList {
		if s == "Input Stok" {
			hasMainSheet = true
		}
		if s == "DataValidasi" {
			hasValidSheet = true
		}
	}

	if !hasMainSheet {
		t.Errorf("expected sheet 'Input Stok' in %v", sheetList)
	}
	if !hasValidSheet {
		t.Errorf("expected validation sheet 'DataValidasi' in %v", sheetList)
	}

	// Verify headers
	cellA1, _ := f.GetCellValue("Input Stok", "A1")
	cellB1, _ := f.GetCellValue("Input Stok", "B1")
	cellC1, _ := f.GetCellValue("Input Stok", "C1")
	cellD1, _ := f.GetCellValue("Input Stok", "D1")

	if cellA1 != "SKU" || cellB1 != "LT (Lokasi)" || cellC1 != "ACTUAL" || cellD1 != "NOTES" {
		t.Errorf("unexpected headers: %s, %s, %s, %s", cellA1, cellB1, cellC1, cellD1)
	}

	// Verify validation values
	val1, _ := f.GetCellValue("DataValidasi", "A1")
	val2, _ := f.GetCellValue("DataValidasi", "A2")
	val3, _ := f.GetCellValue("DataValidasi", "A3")

	if val1 != "LOC-01" || val2 != "LOC-02" || val3 != "LOC-03" {
		t.Errorf("unexpected validation values: %s, %s, %s", val1, val2, val3)
	}
}

func TestGenerateExportFileName(t *testing.T) {
	tests := []struct {
		customName    string
		defaultPrefix string
		wantSuffix    string
	}{
		{"custom_export", "stock", "custom_export.xlsx"},
		{"custom_export.xlsx", "stock", "custom_export.xlsx"},
		{"", "stock_summary", "stock_summary.xlsx"},
	}

	for _, tt := range tests {
		got := utils.GenerateExportFileName(tt.customName, tt.defaultPrefix)
		if !strings.HasSuffix(got, tt.wantSuffix) {
			t.Errorf("GenerateExportFileName(%q, %q) = %q, want suffix %q", tt.customName, tt.defaultPrefix, got, tt.wantSuffix)
		}
	}
}
