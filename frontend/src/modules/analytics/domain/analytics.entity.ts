export interface KpiSummary {
  [key: string]: any
}

export interface ReportFilter {
  [key: string]: any
}

export interface ExportJob {
  id: number
  status: string
  file_url?: string
  created_at: string
}
