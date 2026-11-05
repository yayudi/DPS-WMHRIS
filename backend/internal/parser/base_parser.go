package parser

import (
	"encoding/csv"
	"fmt"
	"io"
	"strings"

	"github.com/xuri/excelize/v2"
)

type ParserError struct {
	Row     int
	Message string
}

type ParseResult struct {
	Success bool
	Errors  []ParserError
	Data    []map[string]string // Standard key-value format for parsed rows
}

// ReadCSV reads a CSV file and converts it into a slice of maps using the first row as headers.
func ReadCSV(r io.Reader, separator rune) ([]map[string]string, error) {
	reader := csv.NewReader(r)
	reader.Comma = separator
	reader.LazyQuotes = true

	var headers []string
	var results []map[string]string

	for {
		record, err := reader.Read()
		if err == io.EOF {
			break
		}
		if err != nil {
			return nil, err
		}

		if headers == nil {
			headers = record
			for i, h := range headers {
				headers[i] = strings.TrimSpace(h) // Sanitize header
			}
			continue
		}

		row := make(map[string]string)
		for i, val := range record {
			if i < len(headers) {
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
	if len(rows) == 0 {
		return []map[string]string{}, nil
	}

	headers := make([]string, len(rows[0]))
	for j, h := range rows[0] {
		headers[j] = strings.TrimSpace(h)
	}

	var results []map[string]string
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
