package domain

import (
	"errors"
	"testing"

	"github.com/dps-wmhris/backend/internal/shared/apperror"
)

func TestValidateFulfillmentSourcePurpose(t *testing.T) {
	for _, allowed := range []string{"DISPLAY", "WAREHOUSE", "RECEIVING", ""} {
		if err := ValidateFulfillmentSourcePurpose(allowed, true); err != nil {
			t.Fatalf("expected purpose %q to be allowed as fulfillment source, got %v", allowed, err)
		}
	}
	for _, forbidden := range []string{"BAD_STOCK", "workshop", " BRANCH "} {
		err := ValidateFulfillmentSourcePurpose(forbidden, true)
		var appErr *apperror.AppError
		if !errors.As(err, &appErr) || appErr.Code != "VALIDATION_ERROR" {
			t.Fatalf("expected validation error for forbidden purpose %q, got %v", forbidden, err)
		}
		if err := ValidateFulfillmentSourcePurpose(forbidden, false); err != nil {
			t.Fatalf("expected disabling fulfillment source on %q to succeed, got %v", forbidden, err)
		}
	}
}

func TestValidateSalesChannelPlatform(t *testing.T) {
	for _, valid := range []string{"Shopee", "Tokopedia", "Offline", "Lainnya"} {
		if err := ValidateSalesChannelPlatform(valid); err != nil {
			t.Fatalf("expected platform %q valid, got %v", valid, err)
		}
	}
	if err := ValidateSalesChannelPlatform("TikTok"); !errors.Is(err, ErrInvalidSalesChannelPlatform) {
		t.Fatalf("expected ErrInvalidSalesChannelPlatform, got %v", err)
	}
}

func TestValidateStockRequestType(t *testing.T) {
	if err := ValidateStockRequestType("TRANSFER"); err != nil {
		t.Fatalf("expected TRANSFER valid, got %v", err)
	}
	if err := ValidateStockRequestType("STOCK_OPNAME"); err != nil {
		t.Fatalf("expected STOCK_OPNAME valid, got %v", err)
	}
	if err := ValidateStockRequestType("UNKNOWN"); !errors.Is(err, ErrInvalidStockRequestType) {
		t.Fatalf("expected ErrInvalidStockRequestType, got %v", err)
	}
}

func TestFormatCoordinate(t *testing.T) {
	tier := " T3 "
	if got := FormatCoordinate(" R.UTAMA ", " B-02 ", &tier); got != "R.UTAMA - B-02 - T3" {
		t.Fatalf("unexpected coordinate with tier: %q", got)
	}
	emptyTier := "   "
	if got := FormatCoordinate("R.UTAMA", "B-02", &emptyTier); got != "R.UTAMA - B-02" {
		t.Fatalf("unexpected coordinate with blank tier: %q", got)
	}
}
