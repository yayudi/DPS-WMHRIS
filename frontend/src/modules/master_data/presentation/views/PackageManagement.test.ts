import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { createTestingPinia } from '@pinia/testing'
import { VueQueryPlugin } from '@tanstack/vue-query'
import PackageManagement from '@/modules/master_data/presentation/views/PackageManagement.vue'
import { http } from '@/core/infrastructure/http.client'

vi.mock('@/core/infrastructure/http.client', () => {
  const instance = {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
    blob: vi.fn(),
    upload: vi.fn(),
    defaults: { baseURL: 'http://localhost:3000/api' }
  }
  return {
    http: instance
  }
})

vi.mock('@/core/presentation/composables/useToast', () => ({
  useToast: () => ({ toast: vi.fn() })
}))

import { ref } from 'vue'

vi.mock('@vueuse/core', () => ({
  useMagicKeys: () => ({
    Alt_N: ref(false),
    Alt_A: ref(false),
    Alt_R: ref(false),
    Slash: ref(false)
  }),
  useMediaQuery: () => ref(false),
  refDebounced: (val: any) => val
}))

globalThis.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

describe('PackageManagement.vue', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders and fetches packages correctly', async () => {
    ;(http.get as any).mockImplementation(async (url: string) => {
      if (url === '/products' || url === '/packages') {
        return {
          success: true,
          message: 'Berhasil mengambil data paket',
          data: [
            {
              id: 101,
              name: 'Paket Bundling A',
              sku: 'PKG-001',
              price: 75000,
              is_package: true,
              is_active: true,
              components: [
                { component_product_id: 1, name: 'Produk A', sku: 'SKU-001', quantity: 2, stock_available: 20 }
              ]
            }
          ],
          total: 1,
          meta: { page: 1, limit: 50, total: 1 }
        }
      }
      return {}
    })

    const wrapper = mount(PackageManagement, {
      global: {
        plugins: [
          createTestingPinia({
            createSpy: vi.fn,
            initialState: {
              downloadStore: {},
              uploadStore: {}
            },
            stubActions: false
          }),
          VueQueryPlugin
        ],
        stubs: {
          'font-awesome-icon': true,
          BaseFilterPanel: { template: '<div><slot name="filters" /></div>' },
          BaseSelect: true,
          BaseSwitch: true,
          BasePagination: true,
          WmsActionHeader: { template: '<div><slot name="actions" /></div>' },
          PackageTable: true,
          PackageBatchEditModal: true,
          ProductFormModal: true,
          ConnectionStatus: true
        }
      }
    })

    await new Promise(r => setTimeout(r, 50))

    expect(axios.get).toHaveBeenCalledWith(
      '/products',
      expect.objectContaining({
        params: expect.objectContaining({
          is_package: 1
        })
      })
    )

    const table = wrapper.findComponent({ name: 'PackageTable' })
    expect(table.exists()).toBe(true)

    expect(wrapper.vm.products.length).toBe(1)
    expect(wrapper.vm.products[0].name).toBe('Paket Bundling A')
    expect(wrapper.vm.products[0].is_package).toBe(true)
  })
})
