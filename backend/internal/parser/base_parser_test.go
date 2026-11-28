package parser_test

import (
	"bytes"
	"path/filepath"
	"strings"
	"testing"

	"github.com/dps-wmhris/backend/internal/parser"
	"github.com/xuri/excelize/v2"
)

func TestReadExcel_And_ReadExcelFile(t *testing.T) {
	tempDir := t.TempDir()
	excelPath := filepath.Join(tempDir, "test_data.xlsx")

	f := excelize.NewFile()
	sheet := "DataSheet"
	_ = f.SetSheetName("Sheet1", sheet)

	// Headers
	_ = f.SetCellValue(sheet, "A1", "SKU")
	_ = f.SetCellValue(sheet, "B1", " Lokasi ")
	_ = f.SetCellValue(sheet, "C1", "QTY")

	// Row 1
	_ = f.SetCellValue(sheet, "A2", "SKU-001")
	_ = f.SetCellValue(sheet, "B2", " LOC-A ")
	_ = f.SetCellValue(sheet, "C2", " 15 ")

	// Row 2
	_ = f.SetCellValue(sheet, "A3", "SKU-002")
	_ = f.SetCellValue(sheet, "B3", "LOC-B")
	_ = f.SetCellValue(sheet, "C3", "30")

	if err := f.SaveAs(excelPath); err != nil {
		t.Fatalf("failed to save test excel file: %v", err)
	}
	defer f.Close()

	t.Run("ReadExcelFile_Success", func(t *testing.T) {
		records, err := parser.ReadExcelFile(excelPath)
		if err != nil {
			t.Fatalf("expected no error, got: %v", err)
		}
		if len(records) != 2 {
			t.Fatalf("expected 2 records, got: %d", len(records))
		}

		if records[0]["SKU"] != "SKU-001" || records[0]["Lokasi"] != "LOC-A" || records[0]["QTY"] != "15" {
			t.Errorf("unexpected record 0: %+v", records[0])
		}
		if records[1]["SKU"] != "SKU-002" || records[1]["Lokasi"] != "LOC-B" || records[1]["QTY"] != "30" {
			t.Errorf("unexpected record 1: %+v", records[1])
		}
	})

	t.Run("ReadExcel_Reader_Success", func(t *testing.T) {
		buf, err := f.WriteToBuffer()
		if err != nil {
			t.Fatalf("failed to buffer excel: %v", err)
		}

		records, err := parser.ReadExcel(buf)
		if err != nil {
			t.Fatalf("expected no error, got: %v", err)
		}
		if len(records) != 2 {
			t.Fatalf("expected 2 records, got: %d", len(records))
		}
	})

	t.Run("ReadExcelFile_NotFound", func(t *testing.T) {
		_, err := parser.ReadExcelFile(filepath.Join(tempDir, "not_found.xlsx"))
		if err == nil {
			t.Fatal("expected error for non-existent file, got nil")
		}
	})

	t.Run("ReadExcel_InvalidReader", func(t *testing.T) {
		r := strings.NewReader("not an excel file")
		_, err := parser.ReadExcel(r)
		if err == nil {
			t.Fatal("expected error for corrupted excel reader, got nil")
		}
	})

	t.Run("ReadExcelFile_EmptyDataRows", func(t *testing.T) {
		emptyExcelPath := filepath.Join(tempDir, "header_only.xlsx")
		ef := excelize.NewFile()
		_ = ef.SetCellValue("Sheet1", "A1", "Col1")
		_ = ef.SetCellValue("Sheet1", "B1", "Col2")
		_ = ef.SaveAs(emptyExcelPath)
		defer ef.Close()

		records, err := parser.ReadExcelFile(emptyExcelPath)
		if err != nil {
			t.Fatalf("expected no error, got: %v", err)
		}
		if len(records) != 0 {
			t.Fatalf("expected 0 data records, got: %d", len(records))
		}
	})
}

func TestGetField(t *testing.T) {
	record := map[string]string{
		"SKU":         "  PROD-123  ",
		"LT (Lokasi)": "A-01-01",
		"QTY":         "50",
		"empty_key":   "   ",
	}

	tests := []struct {
		name     string
		keys     []string
		expected string
	}{
		{
			name:     "exact match",
			keys:     []string{"SKU"},
			expected: "PROD-123",
		},
		{
			name:     "case-insensitive match",
			keys:     []string{"sku"},
			expected: "PROD-123",
		},
		{
			name:     "candidate fallback",
			keys:     []string{"non_existent", "lt (lokasi)"},
			expected: "A-01-01",
		},
		{
			name:     "key not present",
			keys:     []string{"missing_1", "missing_2"},
			expected: "",
		},
		{
			name:     "whitespace only value treated as empty",
			keys:     []string{"empty_key"},
			expected: "",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := parser.GetField(record, tt.keys...)
			if got != tt.expected {
				t.Errorf("GetField() = %q, want %q", got, tt.expected)
			}
		})
	}
}

func TestReadCSV(t *testing.T) {
	csvData := "SKU,Lokasi,QTY\nPROD-A,LOC-1,10\nPROD-B,LOC-2,20\n"
	r := bytes.NewReader([]byte(csvData))

	records, err := parser.ReadCSV(r, ',')
	if err != nil {
		t.Fatalf("unexpected error reading CSV: %v", err)
	}

	if len(records) != 2 {
		t.Fatalf("expected 2 records, got: %d", len(records))
	}
	if records[0]["SKU"] != "PROD-A" || records[1]["QTY"] != "20" {
		t.Errorf("unexpected CSV parsed data: %+v", records)
	}

	t.Run("StripsUTF8BOM_SkipsEmptyHeaders_HandlesRaggedRows", func(t *testing.T) {
		bomCSV := "\uFEFFSKU, ,QTY\nSKU-BOM,ignored,7\nSKU-SHORT,ignored\n"
		rows, err := parser.ReadCSV(strings.NewReader(bomCSV), ',')
		if err != nil {
			t.Fatalf("unexpected error on BOM/ragged CSV: %v", err)
		}
		if len(rows) != 2 {
			t.Fatalf("expected 2 rows, got %d", len(rows))
		}
		if rows[0]["SKU"] != "SKU-BOM" || rows[0]["QTY"] != "7" {
			t.Errorf("unexpected BOM row: %+v", rows[0])
		}
		if _, hasEmpty := rows[0][""]; hasEmpty {
			t.Errorf("empty header column must be skipped, got %+v", rows[0])
		}
		if rows[1]["SKU"] != "SKU-SHORT" {
			t.Errorf("unexpected ragged row: %+v", rows[1])
		}
	})

	t.Run("HeaderOnlyReturnsNonNilEmptySlice", func(t *testing.T) {
		rows, err := parser.ReadCSV(strings.NewReader("SKU,QTY\n"), ',')
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if rows == nil || len(rows) != 0 {
			t.Fatalf("expected non-nil empty slice, got %#v", rows)
		}
	})
}

