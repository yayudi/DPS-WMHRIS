import { ref, watch, computed, type Ref } from 'vue'
import debounce from 'lodash/debounce'
import { useInfiniteQuery } from '@tanstack/vue-query'
import { productApi } from '@/modules/master_data/infrastructure/product.api'
import type { Product } from '../domain/product.entity'

export interface ProductSearchOptions {
  debounceMs?: number;
  minChars?: number;
  maxResults?: number;
  locationId?: Ref<string | number | null> | string | number | null;
  inStockOnly?: Ref<boolean> | boolean;
}

/**
 * Composable for debounced product search.
 * Reusable across any component that needs SKU/product name autocomplete.
 */
export const useProductSearch = (options: ProductSearchOptions = {}) => {
  const { 
    debounceMs = 300, 
    minChars = 2, 
    maxResults = 20, 
    locationId = ref<string | number | null>(null), 
    inStockOnly = ref<boolean>(false) 
  } = options

  const query = ref('')
  const debouncedQuery = ref('')
  const selectedProduct = ref<Product | any>(null)

  // Location id helper
  const resolvedLocationId = computed(() => {
    return typeof locationId === 'object' && locationId !== null && 'value' in locationId
      ? locationId.value
      : locationId
  })
  
  const resolvedInStockOnly = computed(() => {
    return typeof inStockOnly === 'object' && inStockOnly !== null && 'value' in inStockOnly
      ? inStockOnly.value
      : inStockOnly
  })

  // Setup Infinite Query
  const { data, fetchNextPage, hasNextPage, isFetching, isFetchingNextPage } = useInfiniteQuery({
    queryKey: computed(() => ['productSearch', debouncedQuery.value, resolvedLocationId.value, resolvedInStockOnly.value]),
    queryFn: async ({ pageParam = 1 }: { pageParam?: number }) => {
      if (!debouncedQuery.value || debouncedQuery.value.trim().length < minChars) {
        return { data: [], nextCursor: null }
      }
      const res = await productApi.searchProducts({ 
        q: debouncedQuery.value.trim(), 
        location_id: resolvedLocationId.value, 
        page: pageParam, 
        limit: maxResults, 
        in_stock_only: resolvedInStockOnly.value 
      })
      // If res is array (backward compat), wrap it. Else it is { data, nextCursor }
      return Array.isArray(res) ? { data: res, nextCursor: null } : res
    },
    getNextPageParam: (lastPage: any) => lastPage.nextCursor || undefined,
    enabled: computed(() => !!debouncedQuery.value && debouncedQuery.value.trim().length >= minChars),
    staleTime: 60 * 1000 // Cache for 1 minute
  })

  // Flatten pages into a single array
  const results = computed(() => {
    if (!data.value) return []
    return data.value.pages.flatMap((page: any) => page.data || [])
  })

  // isSearching flag backward compatibility
  const isSearching = computed(() => isFetching.value && !isFetchingNextPage.value)

  const debouncedUpdate = debounce((term: string) => {
    debouncedQuery.value = term
  }, debounceMs)

  watch(query, (newVal) => {
    // When selectedProduct is set and query matches the display text, skip search entirely
    if (selectedProduct.value) {
      const displayText = `${selectedProduct.value.sku} - ${selectedProduct.value.name}`
      if (newVal === displayText) {
        debouncedUpdate.cancel()
        debouncedQuery.value = '' // Clear query so it doesn't fetch
        return
      }
      selectedProduct.value = null
    }

    if (!newVal || newVal.trim().length < minChars) {
      debouncedUpdate.cancel()
      debouncedQuery.value = ''
      return
    }

    debouncedUpdate(newVal)
  })

  /**
   * Select a product from results and populate query field.
   */
  const selectProduct = (product: Product | any) => {
    selectedProduct.value = product
    query.value = `${product.sku} - ${product.name}`
    debouncedQuery.value = '' // Clear query to stop fetching
    return product
  }

  const clear = () => {
    query.value = ''
    debouncedQuery.value = ''
    selectedProduct.value = null
    debouncedUpdate.cancel()
  }

  const performSearch = async (searchTerm: string) => {
    query.value = searchTerm
  }

  return {
    query,
    results,
    isSearching,
    selectedProduct,
    selectProduct,
    clear,
    performSearch,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage
  }
}
