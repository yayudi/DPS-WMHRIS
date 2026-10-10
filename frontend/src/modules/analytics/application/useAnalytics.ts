import { ref, shallowRef } from 'vue'
import { analyticsApi } from '../infrastructure/analytics.api'

export function useAnalytics() {
  const loading = ref(false)
  const error = ref<string | null>(null)
  const kpiData = shallowRef<any>(null)
  
  const fetchKpi = async () => {
    loading.value = true
    error.value = null
    try {
      kpiData.value = await analyticsApi.fetchKpiSummary()
    } catch (err: any) {
      error.value = err.message || 'Gagal memuat KPI'
    } finally {
      loading.value = false
    }
  }

  const exportStock = async (filters: any) => {
    loading.value = true
    error.value = null
    try {
      const response = await analyticsApi.requestExportStock(filters)
      return response
    } catch (err: any) {
      error.value = err.message || 'Gagal meminta laporan stok'
      throw err
    } finally {
      loading.value = false
    }
  }

  return {
    loading,
    error,
    kpiData,
    fetchKpi,
    exportStock,
    analyticsApi // Exposing api for direct calls if components need specific endpoints
  }
}
