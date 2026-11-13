package usecase

import (
	"testing"
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

