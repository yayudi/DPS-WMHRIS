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
		Font: &excelize.Font{Bold: true},
		Fill: excelize.Fill{Type: "pattern", Color: []string{"#FFF2CC"}, Pattern: 1},
		CustomNumFmt: &[]string{"#,##0"}[0],
	})
	totalDec, _ := f.NewStyle(&excelize.Style{
		Font: &excelize.Font{Bold: true},
		Fill: excelize.Fill{Type: "pattern", Color: []string{"#FFF2CC"}, Pattern: 1},
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
		f.SetCellValue(sheetName, cell, h)
	}
	if len(headers) > 0 {
		lastCol, _ := excelize.CoordinatesToCellName(len(headers), 1)
		f.SetCellStyle(sheetName, "A1", lastCol, styleID)
	}
}

// SetColWidths sets the width of multiple columns at once using a map (e.g., map[string]float64{"A": 20, "B": 50}).
func SetColWidths(f *excelize.File, sheetName string, widths map[string]float64) {
	for col, width := range widths {
		f.SetColWidth(sheetName, col, col, width)
	}
}

// SetColStyles sets the style of multiple columns at once using a map (e.g., map[string]int{"A": styleID, "B": styleID}).
func SetColStyles(f *excelize.File, sheetName string, styles map[string]int) {
	for col, styleID := range styles {
		f.SetColStyle(sheetName, col, styleID)
	}
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
