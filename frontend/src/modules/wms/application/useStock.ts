import { ref } from 'vue'
import { stockApi } from '../infrastructure/stock.api'
import type { StockFilter, ProductStock } from '../domain/stock.entity'
import { useToast } from '@/core/presentation/composables/useToast'
import { useI18n } from '@/core/presentation/composables/useI18n'
import { useDownload } from '@/core/presentation/composables/useDownload'

export function useStock() {
  const stocks = ref<ProductStock[]>([])
  const isLoading = ref(false)
  const error = ref<string | null>(null)
  const totalItems = ref(0)
  const { toast } = useToast()
  const { t } = useI18n()
  const { downloadBlob } = useDownload()

  async function fetchStocks(filter: StockFilter) {
    isLoading.value = true
    error.value = null
    try {
      const response = await stockApi.fetchProductsStock(filter)
      stocks.value = response.data || []
      totalItems.value = response.meta?.total || 0
      return response
    } catch (err: any) {
      error.value = err?.message || t('wms.stock.fetch_error')
      throw err
    } finally {
      isLoading.value = false
    }
  }

  async function exportStock(filter: StockFilter) {
    isLoading.value = true
    try {
      const blob = await stockApi.exportStock(filter)
      downloadBlob(blob, `Stock_Export_${new Date().toISOString()}.xlsx`)
    } catch (err: any) {
      toast(t('wms.stock.export_error'), 'error')
      throw err
    } finally {
      isLoading.value = false
    }
  }

  return {
    stocks,
    totalItems,
    isLoading,
    error,
    fetchStocks,
    exportStock
  }
}
