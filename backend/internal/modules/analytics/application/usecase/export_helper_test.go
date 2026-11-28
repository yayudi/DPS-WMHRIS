package usecase

import (
	"testing"
	"time"
)

func TestParseCatalogExportFilter(t *testing.T) {
	tests := []struct {
		name             string
		filtersJSON      string
		forcePackageOnly bool
		wantSearch       string
		wantStatus       string
		wantPkgOnly      bool
		wantErr          bool
	}{
		{
			name:             "Empty JSON fallback defaults",
			filtersJSON:      "",
			forcePackageOnly: false,
			wantSearch:       "",
			wantStatus:       "active",
			wantPkgOnly:      false,
			wantErr:          false,
		},
		{
			name:             "Custom filters parsed successfully",
			filtersJSON:      `{"search":"ABC","status":"inactive","isPackage":true}`,
			forcePackageOnly: false,
			wantSearch:       "ABC",
			wantStatus:       "inactive",
			wantPkgOnly:      true,
			wantErr:          false,
		},
		{
			name:             "Force package only flag overrides false isPackage",
			filtersJSON:      `{"search":"XYZ","status":"all","isPackage":false}`,
			forcePackageOnly: true,
			wantSearch:       "XYZ",
			wantStatus:       "all",
			wantPkgOnly:      true,
			wantErr:          false,
		},
		{
			name:             "Invalid JSON returns error",
			filtersJSON:      `{invalid-json}`,
			forcePackageOnly: false,
			wantErr:          true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			res, err := parseCatalogExportFilter(tt.filtersJSON, tt.forcePackageOnly)
			if (err != nil) != tt.wantErr {
				t.Fatalf("parseCatalogExportFilter() error = %v, wantErr %v", err, tt.wantErr)
			}
			if tt.wantErr {
				return
			}
			if res.FilterReq.Search != tt.wantSearch {
				t.Errorf("Search = %v, want %v", res.FilterReq.Search, tt.wantSearch)
			}
			if res.Status != tt.wantStatus {
				t.Errorf("Status = %v, want %v", res.Status, tt.wantStatus)
			}
			isPkg := res.FilterReq.PackageOnly != nil && *res.FilterReq.PackageOnly
			if isPkg != tt.wantPkgOnly {
				t.Errorf("PackageOnly = %v, want %v", isPkg, tt.wantPkgOnly)
			}
		})
	}
}

func TestResolveRollingDateRange(t *testing.T) {
	now := time.Date(2026, 11, 28, 10, 0, 0, 0, time.UTC)

	tests := []struct {
		name      string
		start     string
		end       string
		lookback  int
		wantStart string
		wantEnd   string
	}{
		{
			name:      "both omitted uses rolling window ending today",
			lookback:  90,
			wantStart: "2026-08-30",
			wantEnd:   "2026-11-28",
		},
		{
			name:      "only startDate provided defaults endDate to today",
			start:     "2026-10-01",
			lookback:  90,
			wantStart: "2026-10-01",
			wantEnd:   "2026-11-28",
		},
		{
			name:      "only endDate provided anchors lookback to endDate",
			end:       "2025-12-31",
			lookback:  365,
			wantStart: "2024-12-31",
			wantEnd:   "2025-12-31",
		},
		{
			name:      "both provided preserved verbatim",
			start:     "2026-01-01",
			end:       "2026-06-30",
			lookback:  90,
			wantStart: "2026-01-01",
			wantEnd:   "2026-06-30",
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			gotStart, gotEnd := resolveRollingDateRange(tc.start, tc.end, tc.lookback, now)
			if gotStart != tc.wantStart || gotEnd != tc.wantEnd {
				t.Fatalf("resolveRollingDateRange(%q, %q, %d) = (%q, %q), want (%q, %q)",
					tc.start, tc.end, tc.lookback, gotStart, gotEnd, tc.wantStart, tc.wantEnd)
			}
		})
	}
}

