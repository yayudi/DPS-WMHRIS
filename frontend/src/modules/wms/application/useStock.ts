import { ref } from 'vue'
import { stockApi } from '../infrastructure/stock.api'
import type { StockFilter, ProductStock } from '../domain/stock.entity'
import { useToast } from '@/composables/useToast'

export function useStock() {
  const stocks = ref<ProductStock[]>([])
  const isLoading = ref(false)
  const error = ref<string | null>(null)
  const totalItems = ref(0)
  const { toast } = useToast()

  async function fetchStocks(filter: StockFilter) {
    isLoading.value = true
    error.value = null
    try {
      const response = await stockApi.fetchProductsStock(filter)
      stocks.value = response.data || []
      totalItems.value = response.meta?.total || 0
      return response
    } catch (err: any) {
      error.value = err?.message || 'Gagal mengambil data stok'
      toast(error.value || 'Error', 'error')
      throw err
    } finally {
      isLoading.value = false
    }
  }

  async function exportStock(filter: StockFilter) {
    isLoading.value = true
    try {
      const blob = await stockApi.exportStock(filter)
      // Create a URL for the blob and trigger download
      const url = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.setAttribute('download', `Stock_Export_${new Date().toISOString()}.xlsx`)
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
    } catch (err: any) {
      toast('Gagal mengekspor data stok', 'error')
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
