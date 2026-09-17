package catalog_parser

import (
	"github.com/dps-wmhris/backend/internal/parser"

	"fmt"
	"io"
	"strconv"
	"strings"
	"time"
)

const (
	MPStatusNew       = "NEW"
	MPStatusShipped   = "SHIPPED"
	MPStatusCompleted = "COMPLETED"
	MPStatusVoid      = "VOID"
	MPStatusReturned  = "RETURNED"
	MPStatusIgnore    = "IGNORE"
)

type MarketplaceRow struct {
	InvoiceID   string
	SKU         string
	Qty         int
	ReturnedQty int
	Customer    string
	OrderDate   *time.Time
	Status      string
}

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

// ParseMarketplaceFile parses Tokopedia, Shopee or Offline files
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
			// check if it actually should be semicolon
			hasOrder := false
			for k := range rawRows[0] {
				if strings.Contains(strings.ToLower(k), "nomor invoice") || strings.Contains(strings.ToLower(k), "order id") {
					hasOrder = true
					break
				}
			}
			if !hasOrder {
				_, _ = r.Seek(0, io.SeekStart) // #nosec G104
				rawRows, _ = parser.ReadCSV(r, ';')
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
			parsed, isValid = parseOfflineRow(row) // fallback
		}

		if isValid && parsed.Status != MPStatusIgnore {
			parsedRows = append(parsedRows, parsed)
		} else if !isValid {
			res.Errors = append(res.Errors, parser.ParserError{
				Row:     i + 2,
				Message: "Baris tidak valid atau data wajib (Invoice/SKU/Qty) kosong",
			})
		}
	}

	if len(res.Errors) > 0 {
		res.Success = false
	}

	return res, parsedRows
}

func parseTokopediaRow(row map[string]string) (MarketplaceRow, bool) {
	var res MarketplaceRow
	res.InvoiceID = getVal(row, "order id", "nomor invoice", "no pesanan", "invoice no", "tokopedia invoice number")
	if strings.Contains(res.InvoiceID, "unique order ID") || strings.Contains(res.InvoiceID, "Platform unique") {
		return res, false
	}

	res.SKU = getVal(row, "seller sku", "nomor sku", "sku")
	qtyStr := getVal(row, "quantity", "jumlah produk", "jumlah")
	res.Qty, _ = strconv.Atoi(qtyStr)

	retQtyStr := getVal(row, "sku quantity of return", "jumlah pengembalian", "return quantity", "returned quantity")
	res.ReturnedQty, _ = strconv.Atoi(retQtyStr)

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

	// Get Status
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

	qtyStr := getVal(row, "jumlah", "quantity")
	res.Qty, _ = strconv.Atoi(qtyStr)

	retQtyStr := getVal(row, "returned quantity", "jumlah dikembalikan", "quantity returned")
	res.ReturnedQty, _ = strconv.Atoi(retQtyStr)

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

	qtyStr := getVal(row, "*jumlah produk", "jumlah produk", "jumlah")
	res.Qty, _ = strconv.Atoi(qtyStr)

	retQtyStr := getVal(row, "retur", "return", "returned quantity", "jumlah dikembalikan")
	res.ReturnedQty, _ = strconv.Atoi(retQtyStr)

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
				if strings.Contains(strings.ToLower(k), "sku") || strings.Contains(strings.ToLower(k), "kode") {
					hasSKU = true
					break
				}
			}
			if !hasSKU {
				_, _ = r.Seek(0, io.SeekStart) // #nosec G104
				rawRows, _ = parser.ReadCSV(r, ';')
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
		sku := getVal(row, "sku", "kode produk", "nomor sku")
		if sku == "" {
			res.Errors = append(res.Errors, parser.ParserError{
				Row:     i + 2,
				Message: "SKU kosong",
			})
			continue
		}

		var parsed MassProductRow
		parsed.SKU = sku
		parsed.Name = getVal(row, "name", "nama", "nama produk", "product name")
		parsed.Category = getVal(row, "kategori", "category")

		priceStr := cleanNumberString(getVal(row, "price", "harga", "harga jual"))
		if priceStr != "" {
			if val, err := strconv.ParseFloat(priceStr, 64); err == nil {
				parsed.Price = &val
			}
		}

		weightStr := cleanNumberString(getVal(row, "weight", "berat", "bobot"))
		if weightStr != "" {
			if val, err := strconv.ParseFloat(weightStr, 64); err == nil {
				parsed.Weight = &val
			}
		}

		lenStr := cleanNumberString(getVal(row, "length", "panjang"))
		if lenStr != "" {
			if val, err := strconv.ParseFloat(lenStr, 64); err == nil {
				parsed.Length = &val
			}
		}

		widStr := cleanNumberString(getVal(row, "width", "lebar"))
		if widStr != "" {
			if val, err := strconv.ParseFloat(widStr, 64); err == nil {
				parsed.Width = &val
			}
		}

		heiStr := cleanNumberString(getVal(row, "height", "tinggi"))
		if heiStr != "" {
			if val, err := strconv.ParseFloat(heiStr, 64); err == nil {
				parsed.Height = &val
			}
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

func cleanNumberString(s string) string {
	s = strings.TrimSpace(s)
	if s == "" {
		return ""
	}
	s = strings.ReplaceAll(strings.ToLower(s), "rp.", "")
	s = strings.ReplaceAll(s, "rp", "")
	s = strings.TrimSpace(s)

	if strings.Contains(s, ".") && !strings.Contains(s, ",") {
		s = strings.ReplaceAll(s, ".", "")
	} else if strings.Contains(s, ".") && strings.Contains(s, ",") {
		s = strings.ReplaceAll(s, ".", "")
		s = strings.ReplaceAll(s, ",", ".")
	}

	// strip non numeric/dot
	var sb strings.Builder
	for _, ch := range s {
		if (ch >= '0' && ch <= '9') || ch == '.' {
			sb.WriteRune(ch)
		}
	}
	return sb.String()
}

func parseMarketplaceDate(dateStr string) time.Time {
	// Attempt DD/MM/YYYY HH:mm:ss or similar first
	dateStr = strings.TrimSpace(dateStr)

	formats := []string{
		"02/01/2006 15:04:05",
		"02-01-2006 15:04:05",
		"02/01/2006 15:04",
		"02-01-2006 15:04",
		"2006-01-02 15:04:05",
		"2006-01-02 15:04",
		"2006/01/02 15:04:05",
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
