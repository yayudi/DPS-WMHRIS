package utils

import (
	"fmt"
	"strings"

	"github.com/xuri/excelize/v2"
)

type ExcelStyles struct {
	Header   int
	Total    int
	TotalInt int
	TotalDec int
	NumInt   int
	NumDec   int
}

func InitExcelStyles(f *excelize.File) ExcelStyles {
	header, _ := f.NewStyle(&excelize.Style{
		Font:   &excelize.Font{Bold: true, Color: "#FFFFFF"},
		Fill:   excelize.Fill{Type: "pattern", Color: []string{"#003399"}, Pattern: 1},
		Border: []excelize.Border{{Type: "right", Color: "#ffffff", Style: 1}},
	})
	total, _ := f.NewStyle(&excelize.Style{
		Font: &excelize.Font{Bold: true},
		Fill: excelize.Fill{Type: "pattern", Color: []string{"#FFF2CC"}, Pattern: 1},
	})
	totalInt, _ := f.NewStyle(&excelize.Style{
		Font:         &excelize.Font{Bold: true},
		Fill:         excelize.Fill{Type: "pattern", Color: []string{"#FFF2CC"}, Pattern: 1},
		CustomNumFmt: &[]string{"#,##0"}[0],
	})
	totalDec, _ := f.NewStyle(&excelize.Style{
		Font:         &excelize.Font{Bold: true},
		Fill:         excelize.Fill{Type: "pattern", Color: []string{"#FFF2CC"}, Pattern: 1},
		CustomNumFmt: &[]string{"#,##0.00"}[0],
	})
	numInt, _ := f.NewStyle(&excelize.Style{CustomNumFmt: &[]string{"#,##0"}[0]})
	numDec, _ := f.NewStyle(&excelize.Style{CustomNumFmt: &[]string{"#,##0.00"}[0]})

	return ExcelStyles{
		Header:   header,
		Total:    total,
		TotalInt: totalInt,
		TotalDec: totalDec,
		NumInt:   numInt,
		NumDec:   numDec,
	}
}

// SetHeaders writes a list of strings to the first row and applies the given styleID.
func SetHeaders(f *excelize.File, sheetName string, headers []string, styleID int) {
	for i, h := range headers {
		cell, _ := excelize.CoordinatesToCellName(i+1, 1)
		_ = f.SetCellValue(sheetName, cell, h) // #nosec G104
	}
	if len(headers) > 0 {
		lastCol, _ := excelize.CoordinatesToCellName(len(headers), 1)
		_ = f.SetCellStyle(sheetName, "A1", lastCol, styleID) // #nosec G104
	}
}

// SetColWidths sets the width of multiple columns at once using a map (e.g., map[string]float64{"A": 20, "B": 50}).
func SetColWidths(f *excelize.File, sheetName string, widths map[string]float64) {
	for col, width := range widths {
		_ = f.SetColWidth(sheetName, col, col, width) // #nosec G104
	}
}

// SetColStyles sets the style of multiple columns at once using a map (e.g., map[string]int{"A": styleID, "B": styleID}).
func SetColStyles(f *excelize.File, sheetName string, styles map[string]int) {
	for col, styleID := range styles {
		_ = f.SetColStyle(sheetName, col, styleID) // #nosec G104
	}
}

// TemplateConfig defines configuration options for generating dropdown-validated Excel templates.
type TemplateConfig struct {
	SheetName        string
	Headers          []string
	ColWidths        map[string]float64
	ValidationSheet  string
	ValidationCol    string // e.g., "B"
	ValidationList   []string
	ValidationTitle  string
	ValidationMsg    string
	ValidationMaxRow int // default 1002
}

// GenerateTemplateWithDropdown generates an Excel file containing a main sheet with styling and headers,
// plus a hidden validation sheet with dropdown data validation applied to the target column.
func GenerateTemplateWithDropdown(cfg TemplateConfig) *excelize.File {
	f := excelize.NewFile()
	mainSheet := cfg.SheetName
	if mainSheet == "" {
		mainSheet = "Sheet1"
	}
	_ = f.SetSheetName("Sheet1", mainSheet) // #nosec G104

	validSheet := cfg.ValidationSheet
	if validSheet == "" {
		validSheet = "DataValidasi"
	}

	if len(cfg.ValidationList) > 0 {
		_, _ = f.NewSheet(validSheet)            // #nosec G104
		_ = f.SetSheetVisible(validSheet, false) // #nosec G104

		for i, val := range cfg.ValidationList {
			cell, _ := excelize.CoordinatesToCellName(1, i+1)
			_ = f.SetCellValue(validSheet, cell, val) // #nosec G104
		}

		col := cfg.ValidationCol
		if col == "" {
			col = "B"
		}
		maxRow := cfg.ValidationMaxRow
		if maxRow <= 0 {
			maxRow = 1002
		}

		dv := excelize.NewDataValidation(true)
		dv.Sqref = fmt.Sprintf("%s2:%s%d", col, col, maxRow)

		title := cfg.ValidationTitle
		if title == "" {
			title = "Pilihan Tidak Valid"
		}
		msg := cfg.ValidationMsg
		if msg == "" {
			msg = "Silakan pilih nilai yang valid dari daftar dropdown."
		}
		dv.SetError(excelize.DataValidationErrorStyleWarning, title, msg)

		formula := fmt.Sprintf("%s!$A$1:$A$%d", validSheet, len(cfg.ValidationList))
		dv.SetSqrefDropList(formula)
		_ = f.AddDataValidation(mainSheet, dv) // #nosec G104
	}

	styles := InitExcelStyles(f)
	SetHeaders(f, mainSheet, cfg.Headers, styles.Header)
	if len(cfg.ColWidths) > 0 {
		SetColWidths(f, mainSheet, cfg.ColWidths)
	}

	return f
}

// GenerateExportFileName returns the customName with .xlsx extension if provided,
// otherwise it generates a filename using defaultPrefix and the current timestamp.
func GenerateExportFileName(customName, defaultPrefix string) string {
	fileName := customName
	if fileName == "" {
		fileName = fmt.Sprintf("%s.xlsx", defaultPrefix)
	} else if !strings.HasSuffix(fileName, ".xlsx") {
		fileName += ".xlsx"
	}
	return fileName
}
