package mysql

import (
	"strings"
	"testing"

	sq "github.com/Masterminds/squirrel"
	catalog_dto "github.com/dps-wmhris/backend/internal/modules/catalog/application/dto"
)

func TestStockStatusOperator(t *testing.T) {
	tests := []struct {
		input       string
		expectedOp  string
		expectedOk  bool
		description string
	}{
		{input: "nonzero", expectedOp: "<>", expectedOk: true, description: "nonzero maps to <>"},
		{input: "positive", expectedOp: ">", expectedOk: true, description: "positive maps to >"},
		{input: "zero", expectedOp: "=", expectedOk: true, description: "zero maps to ="},
		{input: "negative", expectedOp: "<", expectedOk: true, description: "negative maps to <"},
		{input: "minus", expectedOp: "<", expectedOk: true, description: "minus alias maps to <"},
		{input: "all", expectedOp: "", expectedOk: false, description: "all applies no condition"},
		{input: "", expectedOp: "", expectedOk: false, description: "empty applies no condition"},
		{input: "invalid", expectedOp: "", expectedOk: false, description: "invalid applies no condition"},
	}

	for _, tc := range tests {
		t.Run(tc.description, func(t *testing.T) {
			op, ok := stockStatusOperator(tc.input)
			if ok != tc.expectedOk {
				t.Fatalf("expected ok=%v, got %v for input %q", tc.expectedOk, ok, tc.input)
			}
			if op != tc.expectedOp {
				t.Fatalf("expected op=%q, got %q for input %q", tc.expectedOp, op, tc.input)
			}
		})
	}
}

func TestApplyLocationScope(t *testing.T) {
	baseSubq := sq.Select("COALESCE(SUM(sl.quantity), 0)").
		From("stock_locations sl").
		Join("locations l ON sl.location_id = l.id").
		Where("sl.product_id = p.id")

	t.Run("empty scope adds no extra conditions", func(t *testing.T) {
		subq := applyLocationScope(baseSubq, "", catalog_dto.ProductFilterRequest{})
		sql, args, err := subq.ToSql()
		if err != nil {
			t.Fatalf("ToSql error: %v", err)
		}
		if strings.Contains(sql, "l.purpose") || strings.Contains(sql, "l.building") || strings.Contains(sql, "l.floor") {
			t.Fatalf("unexpected conditions in sql: %s", sql)
		}
		if len(args) != 0 {
			t.Fatalf("expected 0 args, got %d", len(args))
		}
	})

	t.Run("applies purpose and building/floor include/exclude", func(t *testing.T) {
		f := catalog_dto.ProductFilterRequest{
			BuildingInclude: []string{"Gedung A", "Gedung B"},
			FloorExclude:    []string{"1", "2"},
		}
		subq := applyLocationScope(baseSubq, "WAREHOUSE", f)
		sql, args, err := subq.ToSql()
		if err != nil {
			t.Fatalf("ToSql error: %v", err)
		}
		if !strings.Contains(sql, "l.purpose = ?") {
			t.Fatalf("missing purpose condition: %s", sql)
		}
		if !strings.Contains(sql, "l.building IN (?,?)") {
			t.Fatalf("missing building include condition: %s", sql)
		}
		if !strings.Contains(sql, "l.floor NOT IN (?,?)") {
			t.Fatalf("missing floor exclude condition: %s", sql)
		}
		if len(args) != 5 { // 1 for purpose + 2 building + 2 floor
			t.Fatalf("expected 5 args, got %d (%v)", len(args), args)
		}
	})

	t.Run("applies single building and floor when include is empty", func(t *testing.T) {
		f := catalog_dto.ProductFilterRequest{
			Building: "Gedung C",
			Floor:    "3",
		}
		subq := applyLocationScope(baseSubq, "DISPLAY", f)
		sql, args, err := subq.ToSql()
		if err != nil {
			t.Fatalf("ToSql error: %v", err)
		}
		if !strings.Contains(sql, "l.purpose = ?") {
			t.Fatalf("missing purpose condition: %s", sql)
		}
		if !strings.Contains(sql, "l.building = ?") {
			t.Fatalf("missing building condition: %s", sql)
		}
		if !strings.Contains(sql, "l.floor = ?") {
			t.Fatalf("missing floor condition: %s", sql)
		}
		if len(args) != 3 {
			t.Fatalf("expected 3 args, got %d (%v)", len(args), args)
		}
	})
}

func TestApplySlottingStatusFilter(t *testing.T) {
	baseBuilder := sq.Select("p.id").From("products p")

	t.Run("all applies no extra conditions", func(t *testing.T) {
		f := catalog_dto.ProductFilterRequest{SlottingStatus: "all"}
		builder := applySlottingStatusFilter(baseBuilder, "WAREHOUSE", f)
		sql, args, err := builder.ToSql()
		if err != nil {
			t.Fatalf("ToSql error: %v", err)
		}
		if strings.Contains(sql, "WHERE") {
			t.Fatalf("expected no WHERE clause, got: %s", sql)
		}
		if len(args) != 0 {
			t.Fatalf("expected 0 args, got %d", len(args))
		}
	})

	t.Run("unslotted builds EXISTS with missing slot subquery and scope", func(t *testing.T) {
		f := catalog_dto.ProductFilterRequest{
			SlottingStatus: "unslotted",
			Building:       "B16",
		}
		builder := applySlottingStatusFilter(baseBuilder, "WAREHOUSE", f)
		sql, args, err := builder.ToSql()
		if err != nil {
			t.Fatalf("ToSql error: %v", err)
		}
		if !strings.Contains(sql, "EXISTS (SELECT 1 FROM stock_locations sl") {
			t.Fatalf("expected EXISTS subquery, got: %s", sql)
		}
		if !strings.Contains(sql, "sl.quantity > 0") {
			t.Fatalf("expected sl.quantity > 0 condition, got: %s", sql)
		}
		if !strings.Contains(sql, "NOT EXISTS (SELECT 1 FROM product_location_slots pls") {
			t.Fatalf("expected NOT EXISTS product_location_slots condition, got: %s", sql)
		}
		if !strings.Contains(sql, "l.purpose = ?") || !strings.Contains(sql, "l.building = ?") {
			t.Fatalf("expected scope conditions in subquery, got: %s", sql)
		}
		if len(args) != 2 { // purpose + building
			t.Fatalf("expected 2 args, got %d (%v)", len(args), args)
		}
	})

	t.Run("slotted builds EXISTS stock and NOT EXISTS missing slot", func(t *testing.T) {
		f := catalog_dto.ProductFilterRequest{
			SlottingStatus: "slotted",
		}
		builder := applySlottingStatusFilter(baseBuilder, "DISPLAY", f)
		sql, args, err := builder.ToSql()
		if err != nil {
			t.Fatalf("ToSql error: %v", err)
		}
		if !strings.Contains(sql, "EXISTS") || !strings.Contains(sql, "NOT EXISTS") {
			t.Fatalf("expected both EXISTS and NOT EXISTS, got: %s", sql)
		}
		if len(args) != 2 { // purpose in hasStock + purpose in missingSlot
			t.Fatalf("expected 2 args, got %d (%v)", len(args), args)
		}
	})
}

