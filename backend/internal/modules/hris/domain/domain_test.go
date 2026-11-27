package domain_test

import (
	"errors"
	"testing"

	"github.com/dps-wmhris/backend/internal/modules/hris/domain"
)

func TestValidateWorkDays(t *testing.T) {
	valid := []string{"1", "1,2,3,4,5", "1,2,3,4,5,6,7", " 6,7 "}
	for _, wd := range valid {
		if err := domain.ValidateWorkDays(wd); err != nil {
			t.Errorf("expected work_days %q to be valid, got %v", wd, err)
		}
	}

	invalid := []string{"", "0,1", "1,8", "1,1,2", "mon,tue", "1, 2"}
	for _, wd := range invalid {
		if err := domain.ValidateWorkDays(wd); !errors.Is(err, domain.ErrInvalidWorkDays) {
			t.Errorf("expected ErrInvalidWorkDays for %q, got %v", wd, err)
		}
	}
}

func TestNormalizeShiftTime(t *testing.T) {
	got, err := domain.NormalizeShiftTime("08:00")
	if err != nil || got != "08:00:00" {
		t.Fatalf("expected 08:00:00, got (%q, %v)", got, err)
	}

	got, err = domain.NormalizeShiftTime("16:30:15")
	if err != nil || got != "16:30:15" {
		t.Fatalf("expected 16:30:15, got (%q, %v)", got, err)
	}

	if _, err := domain.NormalizeShiftTime("25:99"); !errors.Is(err, domain.ErrInvalidTimeFormat) {
		t.Fatalf("expected ErrInvalidTimeFormat, got %v", err)
	}
}
