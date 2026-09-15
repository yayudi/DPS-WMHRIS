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

	var headers []string
	var results []map[string]string

	for i, row := range rows {
		if i == 0 {
			headers = row
			for j, h := range headers {
				headers[j] = strings.TrimSpace(h)
			}
			continue
		}

		rowData := make(map[string]string)
		for j, val := range row {
			if j < len(headers) {
				rowData[headers[j]] = strings.TrimSpace(val)
			}
		}
		results = append(results, rowData)
	}

	return results, nil
}
