// Package parser provides reusable CSV and Excel tabular file parsing utilities.
package parser

import (
	"encoding/csv"
	"fmt"
	"io"
	"strings"

	"github.com/xuri/excelize/v2"
)

// ParserError represents a row-level validation or parse error encountered during tabular import.
type ParserError struct {
	Row     int
	Message string
}

// ParseResult aggregates parsed tabular rows and any collected row-level errors.
type ParseResult struct {
	Success bool
	Errors  []ParserError
	Data    []map[string]string // Standard key-value format for parsed rows
}

func normalizeHeaderCell(index int, raw string) string {
	if index == 0 {
		raw = strings.TrimPrefix(raw, "\uFEFF")
	}
	return strings.TrimSpace(raw)
}

// ReadCSV reads a CSV stream and converts it into a slice of maps using the first row as headers.
// UTF-8 BOM on the first header is stripped, empty header columns are ignored, and ragged rows are tolerated.
func ReadCSV(r io.Reader, separator rune) ([]map[string]string, error) {
	reader := csv.NewReader(r)
	reader.Comma = separator
	reader.LazyQuotes = true
	reader.FieldsPerRecord = -1

	var headers []string
	results := make([]map[string]string, 0)

	for {
		record, err := reader.Read()
		if err == io.EOF {
			break
		}
		if err != nil {
			return nil, err
		}

		if headers == nil {
			headers = make([]string, len(record))
			for i, h := range record {
				headers[i] = normalizeHeaderCell(i, h)
			}
			continue
		}

		row := make(map[string]string, len(headers))
		for i, val := range record {
			if i < len(headers) && headers[i] != "" {
				row[headers[i]] = strings.TrimSpace(val)
			}
		}
		results = append(results, row)
	}

	return results, nil
}

// ReadExcel reads the first sheet of an Excel file and converts it into a slice of maps.
func ReadExcel(r io.Reader) ([]map[string]string, error) {
	f, err := excelize.OpenReader(r)
	if err != nil {
		return nil, err
	}
	defer f.Close()

	sheets := f.GetSheetList()
	if len(sheets) == 0 {
		return nil, fmt.Errorf("no sheets found in excel file")
	}

	rows, err := f.GetRows(sheets[0])
	if err != nil {
		return nil, err
	}

	return rowsToMaps(rows)
}

// ReadExcelFile opens an Excel file by path and parses the first sheet into a slice of maps.
func ReadExcelFile(filePath string) ([]map[string]string, error) {
	f, err := excelize.OpenFile(filePath)
	if err != nil {
		return nil, fmt.Errorf("gagal membuka file excel: %w", err)
	}
	defer f.Close()

	sheets := f.GetSheetList()
	if len(sheets) == 0 {
		return nil, fmt.Errorf("file excel tidak memiliki sheet atau tidak valid")
	}

	rows, err := f.GetRows(sheets[0])
	if err != nil {
		return nil, fmt.Errorf("gagal membaca baris excel: %w", err)
	}

	return rowsToMaps(rows)
}

func rowsToMaps(rows [][]string) ([]map[string]string, error) {
	if len(rows) <= 1 {
		return []map[string]string{}, nil
	}

	headers := make([]string, len(rows[0]))
	for j, h := range rows[0] {
		headers[j] = normalizeHeaderCell(j, h)
	}

	results := make([]map[string]string, 0, len(rows)-1)
	for i := 1; i < len(rows); i++ {
		row := rows[i]
		rowData := make(map[string]string, len(headers))
		for j, val := range row {
			if j < len(headers) && headers[j] != "" {
				rowData[headers[j]] = strings.TrimSpace(val)
			}
		}
		results = append(results, rowData)
	}

	return results, nil
}

// GetField returns the first non-empty trimmed value corresponding to any of the candidate keys (exact match first, then case-insensitive).
func GetField(record map[string]string, keys ...string) string {
	for _, k := range keys {
		if v, ok := record[k]; ok {
			trimmed := strings.TrimSpace(v)
			if trimmed != "" {
				return trimmed
			}
		}
	}
	for _, k := range keys {
		for rk, rv := range record {
			if strings.EqualFold(rk, k) {
				trimmed := strings.TrimSpace(rv)
				if trimmed != "" {
					return trimmed
				}
			}
		}
	}
	return ""
}
