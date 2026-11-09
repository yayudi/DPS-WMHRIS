import { http } from '@/core/infrastructure/http.client'

export const analyticsApi = {
  // KPI & Dashboard Summaries
  async fetchKpiSummary(): Promise<any> {
    const response = await http.get('/stats/kpi-summary')
    return response.data
  },

  async fetchReportFilters(): Promise<any> {
    const response = await http.get('/reports/filters')
    return response.data
  },

  // Export / Jobs
  async getUserExportJobs(): Promise<any> {
    return http.get('/reports/my-jobs')
  },

  async requestExportStock(filters: any = {}): Promise<any> {
    return http.post('/reports/request-export-stock', filters)
  },
  
  async requestStatisticExport(filters: any): Promise<any> {
    return http.post('/statistics/stock-movements/export', {
      startDate: filters.startDate,
      endDate: filters.endDate,
      searchQuery: filters.searchQuery || null,
      status: filters.status || 'all',
      movement: filters.movement || 'all',
      building: filters.building || [],
      categoryId: filters.categoryId || 'all',
      exportName: filters.exportName || '',
    })
  },

  async requestStockTimelineExport(filters: any): Promise<any> {
    return http.post('/statistics/stock-timeline/export', {
      startDate: filters.startDate,
      endDate: filters.endDate,
      searchQuery: filters.searchQuery || null,
      status: filters.status || 'all',
      movement: filters.movement || 'all',
      building: filters.building || [],
      exportName: filters.exportName || '',
    })
  },

  // Analytics & Statistics
  async fetchShopPerformance(params: any): Promise<any[]> {
    const response = await http.get('/statistics/shop-performance', { params })
    return response.data
  },

  async fetchPackageAnalysis(params: any): Promise<any[]> {
    const response = await http.get('/statistics/package-analysis', { params })
    return response.data
  },

  async getStockMovementStatistics(filters: any): Promise<any> {
    return http.get('/statistics/stock-movements', { params: filters })
  },

  async getInventoryValueStatistics(filters: any): Promise<any> {
    return http.get('/statistics/inventory-value', { params: filters })
  },

  async getProductStockTimeline(productId: string | number, page: number, limit: number, buildings: string[] = []): Promise<any> {
    const params: any = { page, limit }
    if (buildings && buildings.length > 0) {
      params.building = buildings.join(',')
    }
    return http.get(`/products/${productId}/stock-timeline`, { params })
  },

  async fetchLocationAnalysis(filters: any): Promise<any> {
    return http.get('/statistics/location-analysis', { params: filters })
  },

  async getStockBuildingBreakdown(productId: string | number, startDate: string, endDate: string): Promise<any> {
    return http.get(`/statistics/stock-movements/${productId}/breakdown`, {
      params: { startDate, endDate }
    })
  },

  async fetchLocationAnalysisDetails(locId: string | number, params: any): Promise<any> {
    return http.get(`/statistics/location-analysis/${locId}/details`, { params })
  },

  async exportLocationAnalysis(payload: any): Promise<any> {
    return http.post('/statistics/location-analysis/export', payload)
  }
}
