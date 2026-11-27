package catalog_parser

import (
	"bytes"
	"testing"
)

func TestParseMassProductFile_NamaPaket(t *testing.T) {
	csvData := `SKU,Nama Paket,Kategori,Harga Jual
PKG-001,Paket Bundling Super,Elektronik,150000
`
	reader := bytes.NewReader([]byte(csvData))
	res, rows := ParseMassProductFile(reader, ".csv")

	if !res.Success {
		t.Fatalf("expected success, got errors: %v", res.Errors)
	}
	if len(rows) != 1 {
		t.Fatalf("expected 1 row, got %d", len(rows))
	}
	if rows[0].SKU != "PKG-001" || rows[0].Name != "Paket Bundling Super" {
		t.Errorf("unexpected row: %+v", rows[0])
	}
	if rows[0].Price == nil || *rows[0].Price != 150000 {
		t.Errorf("expected Price 150000, got %v", rows[0].Price)
	}
}

func TestParseMassProductFile_NamaProduk(t *testing.T) {
	csvData := `SKU,Nama Produk,Kategori,Harga
PRD-001,Produk Reguler,Pakaian,75000
`
	reader := bytes.NewReader([]byte(csvData))
	res, rows := ParseMassProductFile(reader, ".csv")

	if !res.Success {
		t.Fatalf("expected success, got errors: %v", res.Errors)
	}
	if len(rows) != 1 || rows[0].SKU != "PRD-001" || rows[0].Name != "Produk Reguler" {
		t.Fatalf("unexpected parsed rows: %+v", rows)
	}
}

func TestParseMassProductFile_NumberFormatsAndValidation(t *testing.T) {
	csvData := "SKU,Nama Produk,Harga,Berat,Panjang,Lebar,Tinggi\n" +
		"PRD-ID,Format Indonesia,\"Rp. 1.250.000,50\",500,\"12,5\",\"0,75\",1.5\n" +
		"PRD-US,Format US,\"1,250.50\",150.000,12.50,0.75,3.25\n"

	res, rows := ParseMassProductFile(bytes.NewReader([]byte(csvData)), ".csv")
	if !res.Success || len(rows) != 2 {
		t.Fatalf("expected 2 valid rows, got success=%v len=%d errors=%v", res.Success, len(rows), res.Errors)
	}

	// Row 1: Indonesian currency + comma decimals + dot decimal 1.5 preserved (NOT 15!)
	r0 := rows[0]
	if *r0.Price != 1250000.5 || *r0.Weight != 500 || *r0.Length != 12.5 || *r0.Width != 0.75 || *r0.Height != 1.5 {
		t.Fatalf("unexpected row 0 values: price=%v weight=%v L=%v W=%v H=%v", *r0.Price, *r0.Weight, *r0.Length, *r0.Width, *r0.Height)
	}

	// Row 2: US thousands + dot decimals + ID thousands 150.000 -> 150000
	r1 := rows[1]
	if *r1.Price != 1250.5 || *r1.Weight != 150000 || *r1.Length != 12.5 || *r1.Width != 0.75 || *r1.Height != 3.25 {
		t.Fatalf("unexpected row 1 values: price=%v weight=%v L=%v W=%v H=%v", *r1.Price, *r1.Weight, *r1.Length, *r1.Width, *r1.Height)
	}

	// Reject negative and non-numeric values with ParserError instead of silently dropping/flipping sign
	badCSV := "SKU,Nama Produk,Harga,Berat\n" +
		"PRD-NEG,Negatif,-5000,100\n" +
		"PRD-TXT,TextHarga,Rp abc,100\n"
	badRes, badRows := ParseMassProductFile(bytes.NewReader([]byte(badCSV)), ".csv")
	if badRes.Success || len(badRows) != 0 || len(badRes.Errors) != 2 {
		t.Fatalf("expected 2 errors and 0 valid rows for bad numbers, got success=%v rows=%d errors=%v", badRes.Success, len(badRows), badRes.Errors)
	}
}

func TestParseMarketplaceFile_ValidatesQtyAndDateOnly(t *testing.T) {
	offlineCSV := "*Nomor Tagihan,*Kode Produk (SKU),*Jumlah Produk,*Tanggal Transaksi (DD/MM/YYYY),Status\n" +
		"INV-001,SKU-A,2,31/01/2026,Selesai\n" +
		"INV-002,SKU-B,0,31/01/2026,Selesai\n" +
		"INV-003,SKU-C,abc,31/01/2026,Selesai\n"

	res, rows := ParseMarketplaceFile(bytes.NewReader([]byte(offlineCSV)), ".csv", "Offline")
	if res.Success {
		t.Fatalf("expected res.Success=false due to invalid Qty rows")
	}
	if len(rows) != 1 || rows[0].InvoiceID != "INV-001" || rows[0].Qty != 2 {
		t.Fatalf("expected 1 valid row INV-001 qty=2, got %+v", rows)
	}
	if rows[0].OrderDate == nil || rows[0].OrderDate.Format("2006-01-02") != "2026-01-31" {
		t.Fatalf("expected parsed date-only 2026-01-31, got %v", rows[0].OrderDate)
	}
	if len(res.Errors) != 2 {
		t.Fatalf("expected 2 errors for Qty=0 and Qty=abc, got %v", res.Errors)
	}
}
