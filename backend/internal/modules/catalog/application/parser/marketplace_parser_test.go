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

	if rows[0].SKU != "PKG-001" {
		t.Errorf("expected SKU 'PKG-001', got '%s'", rows[0].SKU)
	}

	if rows[0].Name != "Paket Bundling Super" {
		t.Errorf("expected Name 'Paket Bundling Super', got '%s'", rows[0].Name)
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

	if len(rows) != 1 {
		t.Fatalf("expected 1 row, got %d", len(rows))
	}

	if rows[0].SKU != "PRD-001" {
		t.Errorf("expected SKU 'PRD-001', got '%s'", rows[0].SKU)
	}

	if rows[0].Name != "Produk Reguler" {
		t.Errorf("expected Name 'Produk Reguler', got '%s'", rows[0].Name)
	}
}

