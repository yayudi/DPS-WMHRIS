import { ref, computed } from 'vue'
import { productApi } from '../infrastructure/product.api'
import type { Product, ProductSearchFilter } from '../domain/product.entity'
import { useToast } from '@/composables/useToast'
import { useQuery, keepPreviousData } from '@tanstack/vue-query'

export function useProducts() {
  const { toast } = useToast()

  const useProductSearchQuery = (searchParams: any) => {
    return useQuery({
      queryKey: ['products', searchParams],
      queryFn: async () => {
        const response = await productApi.getProducts(searchParams.value)
        return response
      },
      placeholderData: keepPreviousData,
      staleTime: 60 * 1000 // 1 minute
    })
  }

  const deleteProduct = async (id: number | string) => {
    try {
      return await productApi.deleteProduct(id)
    } catch (err: any) {
      toast(err.message || 'Gagal menghapus produk', 'error')
      throw err
    }
  }

  const updateProduct = async (id: number | string, payload: any) => {
    try {
      return await productApi.updateProduct(id, payload)
    } catch (err: any) {
      toast(err.message || 'Gagal mengupdate produk', 'error')
      throw err
    }
  }
  
  const bulkAction = async (actionType: 'archive' | 'restore', ids: (number | string)[]) => {
    try {
      return await productApi.bulkAction(actionType, ids)
    } catch (err: any) {
      toast(err.message || 'Gagal melakukan aksi massal', 'error')
      throw err
    }
  }

  return {
    useProductSearchQuery,
    deleteProduct,
    updateProduct,
    bulkAction
  }
}
