package analytics_dto

import "time"

// ReportFilterResponse provides distinct buildings, purposes, and purpose-to-building groupings for report filters.
type ReportFilterResponse struct {
	AllBuildings       []string            `json:"allBuildings"`
	Purposes           []string            `json:"purposes"`
	BuildingsByPurpose map[string][]string `json:"buildingsByPurpose"`
}

// UserExportJobResponse represents a single export job entry returned for a user's export job history.
type UserExportJobResponse struct {
	ID           int        `json:"id"`
	Status       string     `json:"status"`
	FilePath     *string    `json:"file_path"`
	ErrorMessage *string    `json:"error_message"`
	CreatedAt    *time.Time `json:"created_at"`
	Filters      *string    `json:"filters"`
	JobType      string     `json:"job_type"`
	Type         string     `json:"type"`
	DownloadURL  *string    `json:"download_url"`
}

// FilterObj represents an include/exclude list filter payload.
type FilterObj struct {
	Include []string `json:"include"`
	Exclude []string `json:"exclude"`
}

// StockReportFilter defines filter options for querying and exporting stock valuation reports.
type StockReportFilter struct {
	StockStatus string `json:"stockStatus"`
	Building    any    `json:"building"`
	Purpose     any    `json:"purpose"`
	SearchQuery string `json:"searchQuery"`
	IsPackage   any    `json:"isPackage"`
	Format      string `json:"format"`
	ExportType  string `json:"exportType"`
	ExportName  string `json:"exportName"`
}

// StockReportRow represents one joined product-location row in a stock valuation report.
type StockReportRow struct {
	Sku         string  `db:"Sku"`
	NamaProduk  string  `db:"NamaProduk"`
	Lokasi      *string `db:"Lokasi"` // Nullable in LEFT JOIN
	Kuantitas   int     `db:"Kuantitas"`
	HargaSatuan float64 `db:"HargaSatuan"`
	TotalNilai  float64 `db:"TotalNilai"`
}
