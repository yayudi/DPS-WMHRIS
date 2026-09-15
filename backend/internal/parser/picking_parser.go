package parser

import (
	"fmt"
	"io"
	"log"
	"regexp"
	"strconv"
	"strings"
	"time"
)

type ParsedOrder struct {
	InvoiceID   string
	Customer    string
	OrderDate   *time.Time
	Status      string
	Source      string
	Items       []ParsedOrderItem
}

type ParsedOrderItem struct {
	SKU         string
	Quantity    int
	ReturnedQty int
}

func getValue(row map[string]string, keys []string) string {
	for k, v := range row {
		lowerK := strings.ToLower(strings.TrimSpace(k))
		for _, key := range keys {
			if lowerK == strings.ToLower(key) {
				return strings.TrimSpace(v)
			}
		}
	}
	return ""
}

func parseDate(val string) *time.Time {
	if val == "" {
		return nil
	}
	
	// DD/MM/YYYY HH:MM:SS or DD-MM-YYYY HH:MM:SS
	re := regexp.MustCompile(`^(\d{1,2})[-/](\d{1,2})[-/](\d{4})(?:\s(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?`)
	matches := re.FindStringSubmatch(val)
	if len(matches) > 0 {
		day := fmt.Sprintf("%02s", matches[1])
		month := fmt.Sprintf("%02s", matches[2])
		year := matches[3]
		hour := "00"
		if matches[4] != "" {
			hour = fmt.Sprintf("%02s", matches[4])
		}
		minute := "00"
		if matches[5] != "" {
			minute = fmt.Sprintf("%02s", matches[5])
		}
		second := "00"
		if matches[6] != "" {
			second = fmt.Sprintf("%02s", matches[6])
		}
		isoStr := fmt.Sprintf("%s-%s-%sT%s:%s:%sZ", year, month, day, hour, minute, second)
		t, err := time.Parse(time.RFC3339, isoStr)
		if err == nil {
			return &t
		}
	}

	// Fallback standard formats
	formats := []string{
		"2006-01-02",
		"2006-01-02 15:04:05",
		time.RFC3339,
	}
	for _, f := range formats {
		t, err := time.Parse(f, val)
		if err == nil {
			return &t
		}
	}
	
	return nil
}

func ParseSalesFile(r io.Reader, ext string, source string) ([]ParsedOrder, error) {
	ext = strings.ToLower(ext)
	var rows []map[string]string
	var err error

	log.Printf("[ParseSalesFile] Starting to parse file from stream (Source: %s, Ext: %s)", source, ext)

	if ext == ".xlsx" || ext == ".xls" {
		log.Printf("[ParseSalesFile] Using Excel parser")
		rows, err = ReadExcel(r)
		if err != nil {
			return nil, fmt.Errorf("failed to read Excel: %w", err)
		}
	} else {
		delimiter := ','
		if strings.EqualFold(source, "Shopee") {
			delimiter = ';'
		}
		log.Printf("[ParseSalesFile] Using CSV parser with delimiter: '%c'", delimiter)
		rows, err = ReadCSV(r, rune(delimiter))
		if err != nil {
			return nil, fmt.Errorf("failed to read CSV: %w", err)
		}
	}

	log.Printf("[ParseSalesFile] Successfully read %d rows from file. Starting mapping...", len(rows))
	orderMap := make(map[string]*ParsedOrder)

	for _, row := range rows {
		var invoiceID, sku, customer, status string
		var qty, returnedQty int
		var orderDate *time.Time

		if strings.EqualFold(source, "Tokopedia") {
			invoiceID = getValue(row, []string{"order id", "nomor invoice", "no pesanan", "invoice no", "tokopedia invoice number"})
			if strings.Contains(strings.ToLower(invoiceID), "unique order id") || strings.Contains(strings.ToLower(invoiceID), "platform unique") {
				continue
			}
			sku = getValue(row, []string{"seller sku", "nomor sku", "sku"})
			qtyStr := getValue(row, []string{"quantity", "jumlah produk", "jumlah"})
			qty, _ = strconv.Atoi(qtyStr)
			retQtyStr := getValue(row, []string{"sku quantity of return", "jumlah pengembalian", "return quantity", "returned quantity"})
			returnedQty, _ = strconv.Atoi(retQtyStr)
			customer = getValue(row, []string{"recipient", "nama penerima", "penerima"})
			orderDate = parseDate(getValue(row, []string{"created time", "waktu pesanan", "tanggal pemesanan", "order time"}))

			statusStr := strings.ToLower(getValue(row, []string{"order status", "status pesanan", "status"}))
			retTypeStr := strings.ToLower(getValue(row, []string{"cancelation/return type", "jenis pembatalan/pengembalian"}))

			if strings.Contains(retTypeStr, "return") || strings.Contains(retTypeStr, "pengembalian") || strings.Contains(retTypeStr, "refund") {
				status = "RETURNED"
			} else if strings.Contains(retTypeStr, "cancel") || strings.Contains(retTypeStr, "batal") {
				status = "VOID"
			} else if strings.Contains(statusStr, "batal") || strings.Contains(statusStr, "dibatalkan") || strings.Contains(statusStr, "cancelled") || strings.Contains(statusStr, "void") {
				status = "VOID"
			} else if strings.Contains(statusStr, "selesai") || strings.Contains(statusStr, "delivered") || strings.Contains(statusStr, "completed") {
				status = "COMPLETED"
			} else if strings.Contains(statusStr, "dikirim") || strings.Contains(statusStr, "dalam pengiriman") || strings.Contains(statusStr, "shipped") || strings.Contains(statusStr, "shipping") || strings.Contains(statusStr, "sedang transit") {
				status = "SHIPPED"
			} else if strings.Contains(statusStr, "siap dikirim") || strings.Contains(statusStr, "sedang diproses") || strings.Contains(statusStr, "pesanan baru") || strings.Contains(statusStr, "perlu dikirim") || strings.Contains(statusStr, "new") {
				status = "NEW"
			} else {
				continue // IGNORE
			}

		} else if strings.EqualFold(source, "Shopee") {
			invoiceID = getValue(row, []string{"no. pesanan", "no pesanan", "order id"})
			sku = getValue(row, []string{"nomor referensi sku", "sku reference no", "sku induk", "parent sku"})
			qtyStr := getValue(row, []string{"jumlah", "quantity"})
			qty, _ = strconv.Atoi(qtyStr)
			retQtyStr := getValue(row, []string{"returned quantity", "jumlah dikembalikan", "quantity returned"})
			returnedQty, _ = strconv.Atoi(retQtyStr)
			customer = getValue(row, []string{"username (pembeli)", "username pembeli", "nama penerima"})
			orderDate = parseDate(getValue(row, []string{"waktu pesanan dibuat", "order creation time"}))
			statusStr := strings.ToLower(getValue(row, []string{"status pesanan", "order status", "status"}))
			retStatusStr := strings.ToLower(getValue(row, []string{"status pembatalan/ pengembalian"}))

			if strings.Contains(retStatusStr, "pengembalian") || strings.Contains(retStatusStr, "return") || strings.Contains(retStatusStr, "disetujui") {
				status = "RETURNED"
			} else if strings.Contains(statusStr, "batal") || strings.Contains(statusStr, "cancelled") || strings.Contains(statusStr, "void") {
				status = "VOID"
			} else if strings.Contains(statusStr, "selesai") || strings.Contains(statusStr, "completed") || strings.Contains(statusStr, "pesanan diterima") {
				status = "COMPLETED"
			} else if strings.Contains(statusStr, "dikirim") || strings.Contains(statusStr, "shipped") {
				status = "SHIPPED"
			} else if strings.Contains(statusStr, "perlu dikirim") || strings.Contains(statusStr, "sedang diproses") || strings.Contains(statusStr, "new") {
				status = "NEW"
			} else {
				continue
			}

		} else { // OFFLINE
			invoiceID = getValue(row, []string{"*nomor tagihan", "nomor tagihan", "no tagihan"})
			sku = getValue(row, []string{"*kode produk (sku)", "kode produk (sku)", "kode produk", "sku"})
			qtyStr := getValue(row, []string{"*jumlah produk", "jumlah produk", "jumlah"})
			qty, _ = strconv.Atoi(qtyStr)
			retQtyStr := getValue(row, []string{"retur", "return", "returned quantity", "jumlah dikembalikan"})
			returnedQty, _ = strconv.Atoi(retQtyStr)
			customer = getValue(row, []string{"*nama kontak", "nama kontak", "perusahaan"})
			if customer == "" {
				customer = "Offline Customer"
			}
			orderDate = parseDate(getValue(row, []string{"*tanggal transaksi (dd/mm/yyyy)", "tanggal", "date"}))
			
			statusStr := strings.ToLower(getValue(row, []string{"status"}))
			if returnedQty > 0 || strings.Contains(statusStr, "retur") || strings.Contains(statusStr, "return") {
				status = "RETURNED"
			} else if strings.Contains(statusStr, "void") || strings.Contains(statusStr, "batal") || strings.Contains(statusStr, "cancel") {
				status = "VOID"
			} else {
				status = "NEW"
			}
		}

		if invoiceID == "" || sku == "" || qty == 0 {
			continue
		}

		if existing, ok := orderMap[invoiceID]; ok {
			existing.Items = append(existing.Items, ParsedOrderItem{
				SKU:         sku,
				Quantity:    qty,
				ReturnedQty: returnedQty,
			})
		} else {
			orderMap[invoiceID] = &ParsedOrder{
				InvoiceID: invoiceID,
				Customer:  customer,
				OrderDate: orderDate,
				Status:    status,
				Source:    source,
				Items: []ParsedOrderItem{
					{
						SKU:         sku,
						Quantity:    qty,
						ReturnedQty: returnedQty,
					},
				},
			}
		}
	}

	var parsedOrders []ParsedOrder
	for _, o := range orderMap {
		parsedOrders = append(parsedOrders, *o)
	}

	log.Printf("[ParseSalesFile] Finished parsing. Extracted %d unique orders.", len(parsedOrders))
	return parsedOrders, nil
}
