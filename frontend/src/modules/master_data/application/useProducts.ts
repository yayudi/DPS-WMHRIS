import { ref, computed } from 'vue'
import { productApi } from '../infrastructure/product.api'
import type { Product, ProductSearchFilter } from '../domain/product.entity'
import { useQuery, keepPreviousData } from '@tanstack/vue-query'

export function useProducts() {
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
    return productApi.deleteProduct(id)
  }

  const updateProduct = async (id: number | string, payload: any) => {
    return productApi.updateProduct(id, payload)
  }
  
  const bulkAction = async (actionType: 'archive' | 'restore', ids: (number | string)[]) => {
    return productApi.bulkAction(actionType, ids)
  }

  return {
    useProductSearchQuery,
    deleteProduct,
    updateProduct,
    bulkAction
  }
}
