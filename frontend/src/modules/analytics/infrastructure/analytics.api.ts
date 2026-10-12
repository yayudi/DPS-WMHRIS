import axios from '@/core/infrastructure/http.client'

export const analyticsApi = {
  // KPI & Dashboard Summaries
  async fetchKpiSummary(): Promise<any> {
    const { data } = await axios.get('/stats/kpi-summary')
    return data.data
  },

  async fetchReportFilters(): Promise<any> {
    const { data } = await axios.get('/reports/filters')
    return data.data
  },

  // Export / Jobs
  async getUserExportJobs(): Promise<any> {
    const { data } = await axios.get('/reports/my-jobs')
    return data
  },

  async requestExportStock(filters: any = {}): Promise<any> {
    const { data } = await axios.post('/reports/request-export-stock', filters)
    return data
  },
  
  async requestStatisticExport(filters: any): Promise<any> {
    const { data } = await axios.post('/statistics/stock-movements/export', {
      startDate: filters.startDate,
      endDate: filters.endDate,
      searchQuery: filters.searchQuery || null,
      status: filters.status || 'all',
      movement: filters.movement || 'all',
      building: filters.building || [],
      categoryId: filters.categoryId || 'all',
      exportName: filters.exportName || '',
    })
    return data
  },

  async requestStockTimelineExport(filters: any): Promise<any> {
    const { data } = await axios.post('/statistics/stock-timeline/export', {
      startDate: filters.startDate,
      endDate: filters.endDate,
      searchQuery: filters.searchQuery || null,
      status: filters.status || 'all',
      movement: filters.movement || 'all',
      building: filters.building || [],
      exportName: filters.exportName || '',
    })
    return data
  },

  // Analytics & Statistics
  async fetchShopPerformance(params: any): Promise<any[]> {
    const { data } = await axios.get('/statistics/shop-performance', { params })
    return data.data
  },

  async fetchPackageAnalysis(params: any): Promise<any[]> {
    const { data } = await axios.get('/statistics/package-analysis', { params })
    return data.data
  },

  async getStockMovementStatistics(filters: any): Promise<any> {
    const { data } = await axios.get('/statistics/stock-movements', { params: filters })
    return data
  },

  async getInventoryValueStatistics(filters: any): Promise<any> {
    const { data } = await axios.get('/statistics/inventory-value', { params: filters })
    return data
  },

  async getProductStockTimeline(productId: string | number, page: number, limit: number, buildings: string[] = []): Promise<any> {
    const params: any = { page, limit }
    if (buildings && buildings.length > 0) {
      params.building = buildings.join(',')
    }
    const { data } = await axios.get(`/products/${productId}/stock-timeline`, { params })
    return data
  },

  async fetchLocationAnalysis(filters: any): Promise<any> {
    const { data } = await axios.get('/statistics/location-analysis', { params: filters })
    return data
  },

  async getStockBuildingBreakdown(productId: string | number, startDate: string, endDate: string): Promise<any> {
    const { data } = await axios.get(`/statistics/stock-movements/${productId}/breakdown`, {
      params: { startDate, endDate }
    })
    return data
  },

  async fetchLocationAnalysisDetails(locId: string | number, params: any): Promise<any> {
    const { data } = await axios.get(`/statistics/location-analysis/${locId}/details`, { params })
    return data
  },

  async exportLocationAnalysis(payload: any): Promise<any> {
    const { data } = await axios.post('/statistics/location-analysis/export', payload)
    return data
  }
}
