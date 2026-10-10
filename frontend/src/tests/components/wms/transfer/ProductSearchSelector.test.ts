import { mount } from '@vue/test-utils'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ref } from 'vue'
import ProductSearchSelector from '@/modules/wms/presentation/components/transfer/ProductSearchSelector.vue'

// Mock useProductSearch
const mockPerformSearch = vi.fn()
const mockClearSearch = vi.fn()
const mockFetchNextPage = vi.fn()

const mockResults = ref([])
const mockIsSearching = ref(false)
const mockHasNextPage = ref(false)
const mockIsFetchingNextPage = ref(false)

vi.mock('@/modules/wms/application/useProductSearch', () => ({
  useProductSearch: () => ({
    results: mockResults,
    isSearching: mockIsSearching,
    performSearch: mockPerformSearch,
    clear: mockClearSearch,
    fetchNextPage: mockFetchNextPage,
    hasNextPage: mockHasNextPage,
    isFetchingNextPage: mockIsFetchingNextPage
  })
}))

// Mock useListNavigation
vi.mock('@/composables/useListNavigation.js', () => ({
  useListNavigation: () => ({
    selectedIndex: ref(0),
    handleNavigation: vi.fn()
  })
}))

// Mock floating-ui
vi.mock('@floating-ui/vue', () => ({
  useFloating: () => ({ floatingStyles: ref({}) }),
  autoUpdate: vi.fn(),
  offset: vi.fn(),
  flip: vi.fn(),
  shift: vi.fn(),
  size: vi.fn()
}))

// Mock vueuse/core
let intersectCallback = null
vi.mock('@vueuse/core', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    useIntersectionObserver: (target, callback) => {
      intersectCallback = callback
      return { stop: vi.fn() }
    }
  }
})

describe('ProductSearchSelector.vue', () => {
  let wrapper

  beforeEach(() => {
    vi.clearAllMocks()
    
    // Reset refs
    mockResults.value = []
    mockIsSearching.value = false
    mockHasNextPage.value = false
    mockIsFetchingNextPage.value = false

    wrapper = mount(ProductSearchSelector, {
      global: {
        stubs: {
          FontAwesomeIcon: true,
          Teleport: true
        }
      },
      props: {
        placeholder: 'Cari produk...'
      }
    })
  })

  it('merender input pencarian dengan placeholder', () => {
    const input = wrapper.find('input')
    expect(input.exists()).toBe(true)
    expect(input.attributes('placeholder')).toBe('Cari produk...')
  })

  it('menampilkan hasil pencarian di dropdown', async () => {
    mockResults.value = [{ id: 1, sku: 'TEST', name: 'Produk Test' }]
    
    // Trigger focus to show dropdown if results exist
    await wrapper.find('input').trigger('focus')
    
    const dropdownItems = wrapper.findAll('li')
    expect(dropdownItems.length).toBeGreaterThan(0)
    expect(wrapper.text()).toContain('Produk Test')
    expect(wrapper.text()).toContain('SKU: TEST')
  })

  it('memunculkan sentinel elemen ketika hasNextPage bernilai true', async () => {
    mockResults.value = [{ id: 1, sku: 'TEST', name: 'Produk Test' }]
    mockHasNextPage.value = true
    
    await wrapper.find('input').trigger('focus')

    // Find the sentinel by checking for a specific class or verifying it renders
    // Based on the code, sentinel has h-2 and w-full
    const sentinel = wrapper.find('li.h-2.w-full')
    expect(sentinel.exists()).toBe(true)
  })

  it('memanggil fetchNextPage ketika sentinel terlihat (Intersection Observer)', async () => {
    mockResults.value = [{ id: 1, sku: 'TEST', name: 'Produk Test' }]
    mockHasNextPage.value = true
    
    await wrapper.find('input').trigger('focus')

    // Panggil callback intersection observer seolah-olah elemen terlihat di layar
    expect(intersectCallback).not.toBeNull()
    intersectCallback([{ isIntersecting: true }])

    expect(mockFetchNextPage).toHaveBeenCalled()
  })

  it('menampilkan indikator loading saat memuat halaman berikutnya', async () => {
    mockResults.value = [{ id: 1, sku: 'TEST', name: 'Produk Test' }]
    mockIsFetchingNextPage.value = true
    
    await wrapper.find('input').trigger('focus')

    expect(wrapper.text()).toContain('Memuat...')
  })
})
