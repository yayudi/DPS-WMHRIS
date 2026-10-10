import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createTestingPinia } from '@pinia/testing'
import PackageAnalysisTable from '@/components/stats/PackageAnalysisTable.vue'

// --- Mocking ---
vi.mock('@/api/helpers/stats.js', () => ({
  fetchPackageAnalysis: vi.fn().mockResolvedValue({
    data: [
      {
        id: 1,
        packageSku: 'PKG-001',
        packageName: 'Paket Spesial A',
        packageCategoryName: 'Kategori Paket',
        componentSku: 'CMP-001',
        componentName: 'Komponen 1',
        componentCategoryName: 'Kategori Komp',
        quantityPerPackage: 2,
        costPerComponent: 10000,
        subTotalCost: 20000,
        stockStatus: 'SAFE'
      }
    ],
    meta: {
      totalItems: 1
    }
  })
}))

vi.mock('@/composables/useToast', () => ({
  useToast: () => ({ toast: vi.fn() })
}))

// Mock ResizeObserver for charts/tables that might need it
globalThis.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

describe('PackageAnalysisTable.vue', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  const mountComponent = () => {
    return mount(PackageAnalysisTable, {
      global: {
        plugins: [
          createTestingPinia({
            createSpy: vi.fn,
            initialState: {
              masterData: {
                categories: [
                  { id: 1, name: 'Kategori Komp' }
                ]
              }
            }
          })
        ],
        stubs: {
          'font-awesome-icon': true,
          FilterBar: true,
          BasePagination: true,
          RouterLink: true
        }
      }
    })
  }

  it('renders table headers correctly', async () => {
    const wrapper = mountComponent()
    await flushPromises()
    const headers = wrapper.findAll('th')
    const headerTexts = headers.map(h => h.text())
    
    expect(headerTexts).toContain('SKU Komponen')
    expect(headerTexts).toContain('Nama Komponen')
    expect(headerTexts).toContain('Stok Saat Ini')
    expect(headerTexts).toContain('Total Kebutuhan')
    expect(headerTexts).toContain('Defisit')
    expect(headerTexts).toContain('Status')
  })

  it('calls fetchPackageAnalysis API on mount', async () => {
    const { fetchPackageAnalysis } = await import('@/api/helpers/stats')
    mountComponent() // mount the component
    
    // API is called inside usePagination's fetchPaginatedData, which is triggered after setup
    // wait for next tick or promises
    await new Promise(resolve => setTimeout(resolve, 0))
    
    expect(fetchPackageAnalysis).toHaveBeenCalled()
  })
})
