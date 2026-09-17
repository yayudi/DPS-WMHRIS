package analytics_dto

import "time"

type ReportFilterResponse struct {
	AllBuildings       []string            `json:"allBuildings"`
	Purposes           []string            `json:"purposes"`
	BuildingsByPurpose map[string][]string `json:"buildingsByPurpose"`
}

type UserExportJobResponse struct {
	ID           int        `json:"id"`
	Status       string     `json:"status"`
	FilePath     *string    `json:"file_path"`
	ErrorMessage *string    `json:"error_message"`
	CreatedAt    *time.Time `json:"created_at"`
	Filters      *string    `json:"filters"`
	Type         string     `json:"type"`
	DownloadURL  *string    `json:"download_url"`
}

type FilterObj struct {
	Include []string `json:"include"`
	Exclude []string `json:"exclude"`
}

type StockReportFilter struct {
	StockStatus string      `json:"stockStatus"`
	Building    interface{} `json:"building"`
	Purpose     interface{} `json:"purpose"`
	SearchQuery string      `json:"searchQuery"`
	IsPackage   interface{} `json:"isPackage"`
	Format      string      `json:"format"`
	ExportType  string      `json:"exportType"`
	ExportName  string      `json:"exportName"`
}

type StockReportRow struct {
	Sku         string  `db:"Sku"`
	NamaProduk  string  `db:"NamaProduk"`
	Lokasi      *string `db:"Lokasi"` // Can be null in LEFT JOIN
	Kuantitas   int     `db:"Kuantitas"`
	HargaSatuan float64 `db:"HargaSatuan"`
	TotalNilai  float64 `db:"TotalNilai"`
}
