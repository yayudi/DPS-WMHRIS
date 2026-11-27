// Package catalog_parser parses marketplace order exports and bulk product/package update spreadsheets.
package catalog_parser

import (
	"errors"
	"fmt"
	"io"
	"math"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/dps-wmhris/backend/internal/parser"
)

// Normalized marketplace order statuses produced by ParseMarketplaceFile.
const (
	MPStatusNew       = "NEW"
	MPStatusShipped   = "SHIPPED"
	MPStatusCompleted = "COMPLETED"
	MPStatusVoid      = "VOID"
	MPStatusReturned  = "RETURNED"
	MPStatusIgnore    = "IGNORE"
)

var (
	idThousandsDotPattern   = regexp.MustCompile(`^\d{1,3}(\.\d{3})+$`)
	usThousandsCommaPattern = regexp.MustCompile(`^\d{1,3}(,\d{3})+$`)
	errInvalidNumber        = errors.New("format angka tidak valid")
	errNegativeNumber       = errors.New("nilai angka tidak boleh negatif")
)

// MarketplaceRow represents a single normalized order line parsed from Tokopedia, Shopee, or Offline files.
type MarketplaceRow struct {
	InvoiceID   string
	SKU         string
	Qty         int
	ReturnedQty int
	Customer    string
	OrderDate   *time.Time
	Status      string
}

// MassProductRow represents a single row parsed from a bulk product or package update CSV/Excel file.
type MassProductRow struct {
	SKU       string
	Name      string
	Category  string
	Price     *float64
	Weight    *float64
	Length    *float64
	Width     *float64
	Height    *float64
	IsPackage *bool
	IsActive  *bool
}

// ParseMarketplaceFile parses Tokopedia, Shopee, or Offline order exports into normalized MarketplaceRow entries.
func ParseMarketplaceFile(r io.ReadSeeker, ext string, source string) (parser.ParseResult, []MarketplaceRow) {
	var res parser.ParseResult
	var parsedRows []MarketplaceRow

	delimiter := ','
	if source == "Shopee" {
		delimiter = ';'
	}

	var rawRows []map[string]string
	var err error

	ext = strings.ToLower(ext)
	if strings.HasSuffix(ext, ".xlsx") || strings.HasSuffix(ext, ".xls") {
		rawRows, err = parser.ReadExcel(r)
	} else {
		rawRows, err = parser.ReadCSV(r, rune(delimiter))
		if err == nil && len(rawRows) > 0 && source == "Tokopedia" {
			hasOrder := false
			for k := range rawRows[0] {
				kLower := strings.ToLower(k)
				if strings.Contains(kLower, "nomor invoice") || strings.Contains(kLower, "order id") {
					hasOrder = true
					break
				}
			}
			if !hasOrder {
				if _, seekErr := r.Seek(0, io.SeekStart); seekErr != nil {
					err = seekErr
				} else {
					rawRows, err = parser.ReadCSV(r, ';')
				}
			}
		}
	}

	if err != nil {
		res.Success = false
		res.Errors = append(res.Errors, parser.ParserError{Row: 0, Message: fmt.Sprintf("Gagal membaca file: %v", err)})
		return res, nil
	}

	res.Success = true
	res.Data = rawRows

	for i, row := range rawRows {
		var parsed MarketplaceRow
		var isValid bool

		switch source {
		case "Tokopedia":
			parsed, isValid = parseTokopediaRow(row)
		case "Shopee":
			parsed, isValid = parseShopeeRow(row)
		case "Offline":
			parsed, isValid = parseOfflineRow(row)
		default:
			parsed, isValid = parseOfflineRow(row)
		}

		if isValid && parsed.Status != MPStatusIgnore {
			parsedRows = append(parsedRows, parsed)
		} else if !isValid {
			res.Errors = append(res.Errors, parser.ParserError{
				Row:     i + 2,
				Message: "Baris tidak valid atau data wajib (Invoice/SKU/Qty) kosong.",
			})
		}
	}

	if len(res.Errors) > 0 {
		res.Success = false
	}

	return res, parsedRows
}

func parsePositiveQty(raw string) (int, bool) {
	qty, err := strconv.Atoi(strings.TrimSpace(raw))
	if err != nil || qty <= 0 {
		return 0, false
	}
	return qty, true
}

func parseNonNegativeQty(raw string) (int, bool) {
	trimmed := strings.TrimSpace(raw)
	if trimmed == "" {
		return 0, true
	}
	qty, err := strconv.Atoi(trimmed)
	if err != nil || qty < 0 {
		return 0, false
	}
	return qty, true
}

func parseTokopediaRow(row map[string]string) (MarketplaceRow, bool) {
	var res MarketplaceRow
	res.InvoiceID = getVal(row, "order id", "nomor invoice", "no pesanan", "invoice no", "tokopedia invoice number")
	if strings.Contains(res.InvoiceID, "unique order ID") || strings.Contains(res.InvoiceID, "Platform unique") {
		return res, false
	}

	res.SKU = getVal(row, "seller sku", "nomor sku", "sku")
	qty, ok := parsePositiveQty(getVal(row, "quantity", "jumlah produk", "jumlah"))
	if !ok {
		return res, false
	}
	res.Qty = qty

	retQty, ok := parseNonNegativeQty(getVal(row, "sku quantity of return", "jumlah pengembalian", "return quantity", "returned quantity"))
	if !ok {
		return res, false
	}
	res.ReturnedQty = retQty

	res.Customer = getVal(row, "recipient", "nama penerima", "penerima")
	dateStr := getVal(row, "created time", "waktu pesanan", "tanggal pemesanan", "order time")
	if dateStr != "" {
		t := parseMarketplaceDate(dateStr)
		if !t.IsZero() {
			res.OrderDate = &t
		}
	}

	if res.InvoiceID == "" || res.SKU == "" {
		return res, false
	}

	statusStr := strings.ToLower(getVal(row, "order status", "status pesanan", "status"))
	retTypeStr := strings.ToLower(getVal(row, "cancelation/return type", "jenis pembatalan/pengembalian"))

	if strings.Contains(retTypeStr, "return") || strings.Contains(retTypeStr, "pengembalian") || strings.Contains(retTypeStr, "refund") {
		res.Status = MPStatusReturned
	} else if strings.Contains(retTypeStr, "cancel") || strings.Contains(retTypeStr, "batal") {
		res.Status = MPStatusVoid
	} else if strings.Contains(statusStr, "batal") || strings.Contains(statusStr, "dibatalkan") || strings.Contains(statusStr, "cancelled") || strings.Contains(statusStr, "void") {
		res.Status = MPStatusVoid
	} else if strings.Contains(statusStr, "selesai") || strings.Contains(statusStr, "delivered") || strings.Contains(statusStr, "completed") {
		res.Status = MPStatusCompleted
	} else if strings.Contains(statusStr, "dikirim") || strings.Contains(statusStr, "dalam pengiriman") || strings.Contains(statusStr, "shipped") || strings.Contains(statusStr, "shipping") || strings.Contains(statusStr, "sedang transit") {
		res.Status = MPStatusShipped
	} else if strings.Contains(statusStr, "siap dikirim") || strings.Contains(statusStr, "sedang diproses") || strings.Contains(statusStr, "pesanan baru") || strings.Contains(statusStr, "perlu dikirim") || strings.Contains(statusStr, "new") {
		res.Status = MPStatusNew
	} else {
		res.Status = MPStatusIgnore
	}

	return res, true
}

func parseShopeeRow(row map[string]string) (MarketplaceRow, bool) {
	var res MarketplaceRow
	res.InvoiceID = getVal(row, "no. pesanan", "no pesanan", "order id")
	res.SKU = getVal(row, "nomor referensi sku", "sku reference no")
	if res.SKU == "" {
		res.SKU = getVal(row, "sku induk", "parent sku")
	}

	qty, ok := parsePositiveQty(getVal(row, "jumlah", "quantity"))
	if !ok {
		return res, false
	}
	res.Qty = qty

	retQty, ok := parseNonNegativeQty(getVal(row, "returned quantity", "jumlah dikembalikan", "quantity returned"))
	if !ok {
		return res, false
	}
	res.ReturnedQty = retQty

	res.Customer = getVal(row, "username (pembeli)", "username pembeli", "nama penerima")
	dateStr := getVal(row, "waktu pesanan dibuat", "order creation time")
	if dateStr != "" {
		t := parseMarketplaceDate(dateStr)
		if !t.IsZero() {
			res.OrderDate = &t
		}
	}

	if res.InvoiceID == "" || res.SKU == "" {
		return res, false
	}

	statusStr := strings.ToLower(getVal(row, "status pesanan", "order status", "status"))
	retStatusStr := strings.ToLower(getVal(row, "status pembatalan/ pengembalian"))

	if strings.Contains(retStatusStr, "pengembalian") || strings.Contains(retStatusStr, "return") || strings.Contains(retStatusStr, "disetujui") {
		res.Status = MPStatusReturned
	} else if strings.Contains(statusStr, "batal") || strings.Contains(statusStr, "cancelled") || strings.Contains(statusStr, "void") {
		res.Status = MPStatusVoid
	} else if strings.Contains(statusStr, "selesai") || strings.Contains(statusStr, "completed") || strings.Contains(statusStr, "pesanan diterima") {
		res.Status = MPStatusCompleted
	} else if strings.Contains(statusStr, "dikirim") || strings.Contains(statusStr, "shipped") {
		res.Status = MPStatusShipped
	} else if strings.Contains(statusStr, "perlu dikirim") || strings.Contains(statusStr, "sedang diproses") || strings.Contains(statusStr, "new") {
		res.Status = MPStatusNew
	} else {
		res.Status = MPStatusIgnore
	}

	return res, true
}

func parseOfflineRow(row map[string]string) (MarketplaceRow, bool) {
	var res MarketplaceRow
	res.InvoiceID = getVal(row, "*nomor tagihan", "nomor tagihan", "no tagihan")
	res.SKU = getVal(row, "*kode produk (sku)", "kode produk (sku)", "kode produk", "sku")

	qty, ok := parsePositiveQty(getVal(row, "*jumlah produk", "jumlah produk", "jumlah"))
	if !ok {
		return res, false
	}
	res.Qty = qty

	retQty, ok := parseNonNegativeQty(getVal(row, "retur", "return", "returned quantity", "jumlah dikembalikan"))
	if !ok {
		return res, false
	}
	res.ReturnedQty = retQty

	res.Customer = getVal(row, "*nama kontak", "nama kontak", "perusahaan")
	if res.Customer == "" {
		res.Customer = "Offline Customer"
	}

	dateStr := getVal(row, "*tanggal transaksi (dd/mm/yyyy)", "tanggal", "date")
	if dateStr != "" {
		t := parseMarketplaceDate(dateStr)
		if !t.IsZero() {
			res.OrderDate = &t
		}
	}

	if res.InvoiceID == "" || res.SKU == "" {
		return res, false
	}

	statusStr := strings.ToLower(getVal(row, "status"))
	if res.ReturnedQty > 0 || strings.Contains(statusStr, "retur") || strings.Contains(statusStr, "return") {
		res.Status = MPStatusReturned
	} else if strings.Contains(statusStr, "void") || strings.Contains(statusStr, "batal") || strings.Contains(statusStr, "cancel") {
		res.Status = MPStatusVoid
	} else {
		res.Status = MPStatusNew
	}

	return res, true
}

// ParseMassProductFile reads a CSV or Excel file for bulk product/package updates and validates each row's numeric fields.
func ParseMassProductFile(r io.ReadSeeker, ext string) (parser.ParseResult, []MassProductRow) {
	var res parser.ParseResult
	var parsedRows []MassProductRow

	var rawRows []map[string]string
	var err error

	ext = strings.ToLower(ext)
	if strings.HasSuffix(ext, ".xlsx") || strings.HasSuffix(ext, ".xls") {
		rawRows, err = parser.ReadExcel(r)
	} else {
		rawRows, err = parser.ReadCSV(r, ',')
		if err == nil && len(rawRows) > 0 {
			hasSKU := false
			for k := range rawRows[0] {
				kLower := strings.ToLower(k)
				if strings.Contains(kLower, "sku") || strings.Contains(kLower, "kode") {
					hasSKU = true
					break
				}
			}
			if !hasSKU {
				if _, seekErr := r.Seek(0, io.SeekStart); seekErr != nil {
					err = seekErr
				} else {
					rawRows, err = parser.ReadCSV(r, ';')
				}
			}
		}
	}

	if err != nil {
		res.Success = false
		res.Errors = append(res.Errors, parser.ParserError{Row: 0, Message: fmt.Sprintf("Gagal membaca file: %v", err)})
		return res, nil
	}

	res.Success = true
	res.Data = rawRows

	for i, row := range rawRows {
		rowNum := i + 2
		sku := getVal(row, "sku", "kode produk", "nomor sku")
		if sku == "" {
			res.Errors = append(res.Errors, parser.ParserError{
				Row:     rowNum,
				Message: "SKU kosong",
			})
			continue
		}

		var parsed MassProductRow
		parsed.SKU = sku
		parsed.Name = getVal(row, "name", "nama", "nama produk", "nama paket", "product name", "package name")
		parsed.Category = getVal(row, "kategori", "category")

		rowHasErr := false
		parseField := func(label string, target **float64, keys ...string) {
			raw := getVal(row, keys...)
			val, parseErr := parseMassFloat(raw)
			if parseErr != nil {
				rowHasErr = true
				res.Errors = append(res.Errors, parser.ParserError{
					Row:     rowNum,
					Message: fmt.Sprintf("%s tidak valid (%q): %v", label, raw, parseErr),
				})
				return
			}
			*target = val
		}

		parseField("Harga", &parsed.Price, "price", "harga", "harga jual")
		parseField("Berat", &parsed.Weight, "weight", "berat", "bobot")
		parseField("Panjang", &parsed.Length, "length", "panjang")
		parseField("Lebar", &parsed.Width, "width", "lebar")
		parseField("Tinggi", &parsed.Height, "height", "tinggi")

		if rowHasErr {
			continue
		}

		typeStr := strings.ToLower(getVal(row, "type", "tipe", "is_package", "paket"))
		if typeStr != "" {
			isPkg := typeStr == "1" || typeStr == "true" || typeStr == "yes" || typeStr == "ya" || typeStr == "paket"
			parsed.IsPackage = &isPkg
		}

		statusStr := strings.ToLower(getVal(row, "status", "is_active", "aktif"))
		if statusStr != "" {
			isAct := statusStr == "1" || statusStr == "true" || statusStr == "active" || statusStr == "aktif"
			parsed.IsActive = &isAct
		}

		parsedRows = append(parsedRows, parsed)
	}

	if len(res.Errors) > 0 {
		res.Success = false
	}

	return res, parsedRows
}

func parseMassFloat(raw string) (*float64, error) {
	cleaned, err := cleanNumberString(raw)
	if err != nil {
		return nil, err
	}
	if cleaned == "" {
		return nil, nil
	}
	val, err := strconv.ParseFloat(cleaned, 64)
	if err != nil || math.IsNaN(val) || math.IsInf(val, 0) {
		return nil, errInvalidNumber
	}
	if val < 0 {
		return nil, errNegativeNumber
	}
	return &val, nil
}

// cleanNumberString normalizes Indonesian ("Rp 1.250.000,50", "150.000", "12,5") and US/Excel ("1,250.50", "1.5")
// numeric strings into standard dot-decimal notation while rejecting negative or non-numeric garbage.
func cleanNumberString(raw string) (string, error) {
	s := strings.TrimSpace(raw)
	if s == "" {
		return "", nil
	}

	lower := strings.ToLower(s)
	for _, prefix := range []string{"rp.", "rp", "idr"} {
		if strings.HasPrefix(lower, prefix) {
			s = strings.TrimSpace(s[len(prefix):])
			lower = strings.ToLower(s)
			break
		}
	}

	if s == "" {
		return "", errInvalidNumber
	}
	if strings.HasPrefix(s, "-") {
		return "", errNegativeNumber
	}
	s = strings.TrimPrefix(s, "+")

	for _, ch := range s {
		if (ch < '0' || ch > '9') && ch != '.' && ch != ',' {
			return "", errInvalidNumber
		}
	}

	hasDot := strings.Contains(s, ".")
	hasComma := strings.Contains(s, ",")

	switch {
	case hasDot && hasComma:
		lastDot := strings.LastIndex(s, ".")
		lastComma := strings.LastIndex(s, ",")
		if lastComma > lastDot {
			// Indonesian format: 1.250.000,50 -> 1250000.50
			s = strings.ReplaceAll(s, ".", "")
			s = strings.ReplaceAll(s, ",", ".")
		} else {
			// US/Excel format: 1,250,000.50 -> 1250000.50
			s = strings.ReplaceAll(s, ",", "")
		}
	case hasDot:
		if idThousandsDotPattern.MatchString(s) {
			// Indonesian thousands: 150.000 -> 150000
			s = strings.ReplaceAll(s, ".", "")
		}
		// Otherwise preserve dot as decimal (e.g., 1.5, 0.75, 12.50)
	case hasComma:
		if usThousandsCommaPattern.MatchString(s) {
			// US thousands: 150,000 -> 150000
			s = strings.ReplaceAll(s, ",", "")
		} else {
			// Indonesian decimal: 12,5 -> 12.5
			s = strings.ReplaceAll(s, ",", ".")
		}
	}

	return s, nil
}

func parseMarketplaceDate(dateStr string) time.Time {
	dateStr = strings.TrimSpace(dateStr)

	formats := []string{
		"02/01/2006 15:04:05",
		"02-01-2006 15:04:05",
		"02/01/2006 15:04",
		"02-01-2006 15:04",
		"02/01/2006",
		"02-01-2006",
		"2006-01-02 15:04:05",
		"2006-01-02 15:04",
		"2006/01/02 15:04:05",
		"2006/01/02 15:04",
		"2006-01-02",
		"2006/01/02",
		time.RFC3339,
	}

	for _, f := range formats {
		if t, err := time.Parse(f, dateStr); err == nil {
			return t
		}
	}

	return time.Time{}
}

func getVal(row map[string]string, possibleKeys ...string) string {
	for k, v := range row {
		kLower := strings.ToLower(strings.TrimSpace(k))
		for _, pk := range possibleKeys {
			if kLower == pk {
				return strings.TrimSpace(v)
			}
		}
	}
	return ""
}
