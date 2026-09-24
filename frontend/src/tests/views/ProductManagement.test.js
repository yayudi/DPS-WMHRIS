import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { createTestingPinia } from '@pinia/testing'
import { VueQueryPlugin } from '@tanstack/vue-query'
import ProductManagement from '@/views/master-data/ProductManagement.vue'
import axios from '@/api/axios'

// --- Mocking ---
vi.mock('@/api/axios', () => {
  return {
    default: {
      get: vi.fn(),
      post: vi.fn(),
      put: vi.fn(),
      delete: vi.fn(),
      defaults: { baseURL: 'http://localhost:3000/api' }
    }
  }
})

vi.mock('@/composables/useToast', () => ({
  useToast: () => ({ toast: vi.fn() })
}))

vi.mock('@/components/utilities/StickerGeneratorModal.vue', () => ({
  default: { template: '<div></div>' }
}))

import { ref } from 'vue'

vi.mock('@vueuse/core', () => ({
  useMagicKeys: () => ({
    Alt_N: ref(false),
    Alt_A: ref(false),
    Alt_R: ref(false),
    Slash: ref(false),
  })
}))

// Mock ResizeObserver for some components (e.g., masonry or charts)
globalThis.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

describe('ProductManagement.vue', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders and fetches data correctly', async () => {
    // Mock the API response for products
    axios.get.mockImplementation(async (url) => {
      if (url === '/products') {
        return {
          data: {
            success: true,
            data: [
              { id: 1, name: 'Produk A', sku: 'SKU-001', price: 10000, is_active: true }
            ],
            meta: { total: 1, last_page: 1 }
          }
        }
      }
      return { data: {} }
    })

    const wrapper = mount(ProductManagement, {
      global: {
        plugins: [
          createTestingPinia({
            createSpy: vi.fn,
            initialState: {
              downloadStore: {},
              master: {
                categories: [{ id: 1, name: 'Kategori 1' }]
              }
            },
            stubActions: false
          }),
          VueQueryPlugin
        ],
        stubs: {
          'font-awesome-icon': true,
          'BaseFilterPanel': { template: '<div><slot name="filters" /></div>' },
          'BaseSelect': true,
          'TriStateSelect': true,
          'WmsActionHeader': { template: '<div><slot name="actions" /></div>' },
          'ProductTable': true,
          'BatchEditModal': true,
          'ProductFormModal': true,
          'ProductImageModal': true,
          'StickerGeneratorModal': true,
          'ConnectionStatus': true
        }
      }
    })

    // Tunggu sampai komponen mount dan vue-query mengeksekusi fetch
    await new Promise(r => setTimeout(r, 50)) // simple tick

    const masterStore = (await import('@/stores/masterData')).useMasterDataStore()
    masterStore.getCategories = vi.fn().mockResolvedValue([{ id: 1, name: 'Kategori 1' }])

    expect(axios.get).toHaveBeenCalledWith('/products', expect.any(Object))

    // Cek komponen child dipanggil dengan properti yang benar (karena di-stub, kita cek attr/props)
    const table = wrapper.findComponent({ name: 'ProductTable' })
    expect(table.exists()).toBe(true)
    
    // Test computed reactive products
    expect(wrapper.vm.products.length).toBe(1)
    expect(wrapper.vm.products[0].name).toBe('Produk A')
  })
})
