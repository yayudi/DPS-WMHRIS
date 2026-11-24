import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import ReplenishmentQueue from '@/modules/wms/presentation/views/ReplenishmentQueue.vue'
import { useReplenishment } from '@/modules/wms/application/useReplenishment'
import { wmsApi } from '@/modules/wms/infrastructure/wms.api'
import { stockApi } from '@/modules/wms/infrastructure/stock.api'
import type { OnHoldFulfillmentSummary } from '@/modules/wms/domain/replenishment.entity'

vi.mock('@/core/presentation/composables/useSweetAlert', () => ({
  swalConfirm: vi.fn().mockResolvedValue(true)
}))

vi.mock('@/modules/wms/infrastructure/wms.api', () => ({
  wmsApi: {
    fetchOnHoldFulfillments: vi.fn(),
    transferStock: vi.fn(),
    releaseHeldFulfillment: vi.fn()
  }
}))

vi.mock('@/modules/wms/infrastructure/stock.api', () => ({
  stockApi: {
    fetchAllLocations: vi.fn()
  }
}))

function buildSampleFulfillments(): OnHoldFulfillmentSummary[] {
  const now = Date.now()
  return [
    {
      transaction_id: 1,
      transaction_no: 'TRX-001',
      reference_type: 'SHOPEE',
      reference_id: 'ORD-ALPHA',
      assigned_building: 'A',
      status: 'HOLD_REPLENISHMENT',
      created_at: new Date(now - 23 * 60 * 60 * 1000).toISOString(), // Urgent (1h left)
      deficits: [
        {
          product_id: 10,
          sku: 'SKU-VALVE-01',
          product_name: 'Pneumatic Valve',
          target_quantity: 5,
          display_available_quantity: 1,
          deficit_quantity: 4,
          suggested_sources: [
            {
              location_id: 101,
              location_code: 'ST-A1',
              building: 'A',
              purpose: 'STORAGE',
              available_quantity: 20
            }
          ]
        }
      ]
    },
    {
      transaction_id: 2,
      transaction_no: 'TRX-002',
      reference_type: 'TOKOPEDIA',
      reference_id: 'ORD-BETA',
      assigned_building: '',
      status: 'HOLD_REPLENISHMENT',
      created_at: new Date(now - 2 * 60 * 60 * 1000).toISOString(), // Newest (22h left)
      deficits: [
        {
          product_id: 20,
          sku: 'SKU-HOSE-02',
          product_name: 'Air Hose',
          target_quantity: 3,
          display_available_quantity: 0,
          deficit_quantity: 3,
          suggested_sources: [
            {
              location_id: 202,
              location_code: 'ST-B9',
              building: 'B',
              purpose: 'STORAGE',
              available_quantity: 15
            }
          ]
        }
      ]
    }
  ]
}

function mountReplenishment() {
  return mount(ReplenishmentQueue, {
    global: {
      stubs: {
        FontAwesomeIcon: true,
        QuickTransferModal: true,
        Teleport: true
      }
    }
  })
}

describe('ReplenishmentQueue.vue', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    useReplenishment().resetFilters()
    vi.mocked(wmsApi.fetchOnHoldFulfillments).mockResolvedValue(buildSampleFulfillments())
    vi.mocked(stockApi.fetchAllLocations).mockResolvedValue([
      { id: 101, code: 'ST-A1', building: 'A' } as any,
      { id: 202, code: 'ST-B9', building: 'B' } as any
    ])
  })

  it('merender toolbar terpadu (SearchInput + searchBy, TriStateSelect Gedung, BaseSelect Urutan) tanpa select native', async () => {
    const wrapper = mountReplenishment()
    await flushPromises()

    expect(wrapper.find('#global-search-input').exists()).toBe(true)
    expect(wrapper.find('button[aria-haspopup="listbox"]').exists()).toBe(true)
    expect(wrapper.findComponent({ name: 'TriStateSelect' }).exists()).toBe(true)
    expect(wrapper.findComponent({ name: 'BaseSelect' }).exists()).toBe(true)
    expect(wrapper.find('select').exists()).toBe(false)

    expect(wrapper.text()).toContain('Semua Gedung')
    expect(wrapper.text()).toContain('2 / 2')
    expect(wmsApi.fetchOnHoldFulfillments).toHaveBeenCalledTimes(1)
    expect(wmsApi.fetchOnHoldFulfillments).toHaveBeenCalledWith()
  })

  it('memfilter secara client-side dengan searchBy, gedung TriState (termasuk fallback suggested_sources), sortBy, serta menjaga onHoldCount global', async () => {
    const wrapper = mountReplenishment()
    await flushPromises()

    const { onHoldCount } = useReplenishment()
    expect(onHoldCount.value).toBe(2)

    // 1. Search by 'order', 'product', 'location'
    const searchComp = wrapper.findComponent({ name: 'SearchInput' })
    const searchInput = wrapper.find('#global-search-input')

    searchComp.vm.$emit('update:searchBy', 'order')
    await searchInput.setValue('Pneumatic')
    await flushPromises()
    expect(wrapper.text()).toContain('Tidak ada data ditemukan')
    expect(wrapper.text()).not.toContain('Tidak Ada Pesanan Tertahan')

    searchComp.vm.$emit('update:searchBy', 'product')
    await flushPromises()
    expect(wrapper.text()).toContain('ORD-ALPHA')
    expect(wrapper.text()).not.toContain('ORD-BETA')

    searchComp.vm.$emit('update:searchBy', 'location')
    await searchInput.setValue('ST-B9')
    await flushPromises()
    expect(wrapper.text()).toContain('ORD-BETA')
    expect(wrapper.text()).not.toContain('ORD-ALPHA')

    await searchInput.setValue('')
    searchComp.vm.$emit('update:searchBy', 'all')
    await flushPromises()

    // 2. Filter Gedung TriState: include 'B' (dari fallback suggested_sources) -> onHoldCount global tetap 2
    const buildingSelect = wrapper.findComponent({ name: 'TriStateSelect' })
    buildingSelect.vm.$emit('update:modelValue', { include: ['B'], exclude: [] })
    await flushPromises()

    expect(wrapper.text()).toContain('ORD-BETA')
    expect(wrapper.text()).not.toContain('ORD-ALPHA')
    expect(wrapper.text()).toContain('1 / 2')
    expect(onHoldCount.value).toBe(2)

    // Exclude 'A' -> hanya ORD-BETA
    buildingSelect.vm.$emit('update:modelValue', { include: [], exclude: ['A'] })
    await flushPromises()
    expect(wrapper.text()).toContain('ORD-BETA')
    expect(wrapper.text()).not.toContain('ORD-ALPHA')

    // 3. Reset filter & cek sortBy NEWEST vs SLA_URGENT
    const resetBtn = wrapper.findAll('button').find(btn => btn.text().includes('Reset'))
    expect(resetBtn).toBeDefined()
    await resetBtn!.trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('2 / 2')
    expect(wrapper.text().indexOf('ORD-ALPHA')).toBeLessThan(wrapper.text().indexOf('ORD-BETA'))

    const sortSelect = wrapper.findComponent({ name: 'BaseSelect' })
    sortSelect.vm.$emit('update:modelValue', 'NEWEST')
    await flushPromises()
    expect(wrapper.text().indexOf('ORD-BETA')).toBeLessThan(wrapper.text().indexOf('ORD-ALPHA'))

    // Pastikan tidak pernah refetch saat ganti filter
    expect(wmsApi.fetchOnHoldFulfillments).toHaveBeenCalledTimes(1)
  })
})
