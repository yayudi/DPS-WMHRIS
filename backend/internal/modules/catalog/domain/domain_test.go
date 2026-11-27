package domain

import (
	"errors"
	"math"
	"testing"
)

func TestNormalizeCategoryStatus(t *testing.T) {
	tests := []struct {
		in      string
		want    string
		wantErr error
	}{
		{"", CategoryStatusActive, nil},
		{"  active  ", CategoryStatusActive, nil},
		{"ARCHIVED", CategoryStatusArchived, nil},
		{"All", CategoryStatusAll, nil},
		{"deleted", "", ErrInvalidCategoryStatus},
	}

	for _, tc := range tests {
		got, err := NormalizeCategoryStatus(tc.in)
		if !errors.Is(err, tc.wantErr) {
			t.Fatalf("NormalizeCategoryStatus(%q) err=%v, want %v", tc.in, err, tc.wantErr)
		}
		if got != tc.want {
			t.Fatalf("NormalizeCategoryStatus(%q)=%q, want %q", tc.in, got, tc.want)
		}
	}
}

func TestValidateProductMetrics(t *testing.T) {
	if err := ValidateProductMetrics(15000, 250, 12.5, 8.2, 4.0); err != nil {
		t.Fatalf("expected valid metrics, got %v", err)
	}
	if err := ValidateProductMetrics(0, 0, 0, 0, 0); err != nil {
		t.Fatalf("expected zero metrics to be valid, got %v", err)
	}
	for name, err := range map[string]error{
		"negative price":  ValidateProductMetrics(-1, 0, 0, 0, 0),
		"negative weight": ValidateProductMetrics(0, -0.5, 0, 0, 0),
		"negative width":  ValidateProductMetrics(0, 0, 0, -2, 0),
		"NaN height":      ValidateProductMetrics(0, 0, 0, 0, math.NaN()),
		"Inf length":      ValidateProductMetrics(0, 0, math.Inf(1), 0, 0),
	} {
		if !errors.Is(err, ErrInvalidProductPayload) {
			t.Fatalf("%s: expected ErrInvalidProductPayload, got %v", name, err)
		}
	}
}
