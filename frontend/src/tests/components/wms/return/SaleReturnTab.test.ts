import { mount } from '@vue/test-utils'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ref } from 'vue'
import SaleReturnTab from '@/modules/wms/presentation/components/return/SaleReturnTab.vue'

// Mock useRouter
const mockPush = vi.fn()
vi.mock('vue-router', () => ({
  useRouter: () => ({
    push: mockPush
  })
}))

// Mock useReturnManager
const mockFetchData = vi.fn()
const mockHandleClearFilters = vi.fn()

vi.mock('@/composables/useReturnManager', () => ({
  useReturnManager: () => ({
    activeTab: ref('pending'),
    showProcessModal: ref(false),
    processForm: ref({ good: { locationId: '' }, bad: { locationId: '' } }),
    items: ref([
      { id: 1, reference: 'RET-001', status: 'PENDING' },
      { id: 2, reference: 'RET-002', status: 'APPROVED' }
    ]),
    pagination: ref({ total: 2, page: 1, limit: 10 }),
    searchQuery: ref(''),
    filterState: ref({
      source: { include: [], exclude: [] },
      status: ''
    }),
    returnFilters: [],
    locations: ref([{ id: 1, code: 'LOK-A' }]),
    isLoading: ref(false),
    error: ref(null),
    fetchData: mockFetchData,
    handleClearFilters: mockHandleClearFilters,
    changePage: vi.fn(),
    changeLimit: vi.fn(),
    openProcessModal: vi.fn(),
    submitProcess: vi.fn()
  })
}))

describe('SaleReturnTab.vue', () => {
  let wrapper

  beforeEach(() => {
    vi.clearAllMocks()
    
    wrapper = mount(SaleReturnTab, {
      global: {
        stubs: {
          FilterBar: {
            template: `
              <div class="mock-filter-bar">
                <div class="filter-actions"><slot name="actions" /></div>
                <div class="filter-tabs"><slot name="tabs" /></div>
              </div>
            `
          },
          BasePagination: true,
          FontAwesomeIcon: true,
          BaseModal: true,
          BaseSelect: true
        }
      }
    })
  })

  it('memanggil fetchData dari useReturnManager saat di-mount', () => {
    expect(mockFetchData).toHaveBeenCalled()
  })

  it('merender slot #actions dari FilterBar dengan tombol Retur Manual', () => {
    const actionsSlot = wrapper.find('.filter-actions')
    expect(actionsSlot.exists()).toBe(true)
    
    // Tombol Retur Manual harus ada
    expect(actionsSlot.text()).toContain('Retur Manual')
  })

  it('menavigasi ke halaman retur manual saat tombol diklik', async () => {
    const manualBtn = wrapper.find('.filter-actions button')
    expect(manualBtn.exists()).toBe(true)
    
    await manualBtn.trigger('click')
    
    expect(mockPush).toHaveBeenCalledWith({ name: 'ManualReturn' })
  })

  it('merender daftar item dari useReturnManager', () => {
    // Memeriksa apakah tabel merender item (berdasarkan reference)
    expect(wrapper.text()).toContain('RET-001')
    expect(wrapper.text()).toContain('RET-002')
  })
})
