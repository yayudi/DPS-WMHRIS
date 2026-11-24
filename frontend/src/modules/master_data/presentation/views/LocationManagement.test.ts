import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import LocationManagement from '@/modules/master_data/presentation/views/LocationManagement.vue'
import { locationApi } from '@/modules/master_data/infrastructure/location.api'

vi.mock('@/core/presentation/composables/useSweetAlert', () => ({
  swalConfirm: vi.fn().mockResolvedValue(true)
}))

vi.mock('@/core/presentation/composables/useFirebaseSync', () => ({
  useFirebaseSync: vi.fn()
}))

vi.mock('@/modules/master_data/infrastructure/location.api', () => ({
  locationApi: {
    fetchAllLocations: vi.fn(),
    createLocation: vi.fn(),
    updateLocation: vi.fn(),
    deleteLocation: vi.fn(),
    toggleFulfillmentSource: vi.fn()
  }
}))

describe('LocationManagement.vue', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    localStorage.clear()
  })

  it('menampilkan search dan filter langsung sejajar dengan tombol Tambah Lokasi tanpa FilterToggle', async () => {
    vi.mocked(locationApi.fetchAllLocations).mockResolvedValue([
      {
        id: 1,
        code: 'A1-1',
        building: 'Gedung A',
        floor: '1',
        name: 'Rak Utama',
        purpose: 'WAREHOUSE',
        is_fulfillment_source: true
      }
    ])

    const wrapper = mount(LocationManagement, {
      global: {
        stubs: {
          FontAwesomeIcon: true,
          BaseModal: true,
          BaseContextMenu: true,
          BaseSkeleton: true,
          Teleport: true
        }
      }
    })

    await flushPromises()

    const searchInput = wrapper.find('#global-search-input')
    expect(searchInput.exists()).toBe(true)
    expect(searchInput.isVisible()).toBe(true)

    expect(wrapper.findComponent({ name: 'FilterToggle' }).exists()).toBe(false)
    expect(wrapper.text()).toContain('Semua Gedung')
    expect(wrapper.text()).toContain('Semua Purpose')
    expect(wrapper.text()).toContain('Sumber Fulfillment')
    expect(wrapper.text()).toContain('Tambah Lokasi')

    const addBtn = wrapper.findAll('button').find(btn => btn.text().includes('Tambah Lokasi'))
    expect(addBtn).toBeDefined()
    expect(addBtn?.element.parentElement?.contains(searchInput.element)).toBe(true)
  })

  it('memfilter lokasi berdasarkan pencarian, gedung, purpose, dan mereset halaman ke 1', async () => {
    const sampleLocations = Array.from({ length: 15 }, (_, idx) => ({
      id: idx + 1,
      code: idx === 0 ? 'B99-1' : `A${idx + 1}-1`,
      building: idx === 0 ? 'Gedung Khusus' : 'Gedung Utama',
      floor: '1',
      name: idx === 0 ? 'Area Transit Khusus' : `Rak ${idx + 1}`,
      purpose: idx === 0 ? 'TRANSIT' : 'WAREHOUSE',
      is_fulfillment_source: false
    }))
    vi.mocked(locationApi.fetchAllLocations).mockResolvedValue(sampleLocations)

    const wrapper = mount(LocationManagement, {
      global: {
        stubs: {
          FontAwesomeIcon: true,
          BaseModal: true,
          BaseContextMenu: true,
          BaseSkeleton: true,
          Teleport: true
        }
      }
    })

    await flushPromises()

    // Lokasi id=1 ("B99-1") ada di halaman 2 karena sorting descending ID dengan limit default 10
    const nextBtn = wrapper.findAll('button').find(btn => btn.attributes('title') === 'Halaman Selanjutnya')
    expect(nextBtn).toBeDefined()
    await nextBtn!.trigger('click')
    expect(wrapper.text()).toContain('B99-1')

    // Cari item halaman 1 ("A15-1") -> harus reset ke halaman 1 dan tampil
    const searchInput = wrapper.find('#global-search-input')
    await searchInput.setValue('A15-1')
    await flushPromises()
    expect(wrapper.text()).toContain('A15-1')
    expect(wrapper.text()).not.toContain('B99-1')

    // Reset search lalu filter via TriStateSelect gedung & purpose
    await searchInput.setValue('')
    await flushPromises()
    const selects = wrapper.findAllComponents({ name: 'TriStateSelect' })
    expect(selects).toHaveLength(2)

    selects[0].vm.$emit('update:modelValue', { include: ['Gedung Khusus'], exclude: [] })
    selects[1].vm.$emit('update:modelValue', { include: ['TRANSIT'], exclude: [] })
    await flushPromises()

    expect(wrapper.text()).toContain('B99-1')
    expect(wrapper.text()).not.toContain('A15-1')
  })

  it('memfilter lokasi berdasarkan status Sumber Fulfillment (Aktif vs Tidak Aktif) dan mereset halaman ke 1', async () => {
    const sampleLocations = Array.from({ length: 15 }, (_, idx) => ({
      id: idx + 1,
      code: idx === 0 ? 'FS-OFF' : `FS-ON-${idx + 1}`,
      building: 'Gedung A',
      floor: '1',
      name: idx === 0 ? 'Lokasi Non-Fulfillment' : `Lokasi Fulfillment ${idx + 1}`,
      purpose: 'WAREHOUSE',
      is_fulfillment_source: idx !== 0
    }))
    vi.mocked(locationApi.fetchAllLocations).mockResolvedValue(sampleLocations)

    const wrapper = mount(LocationManagement, {
      global: {
        stubs: {
          FontAwesomeIcon: true,
          BaseModal: true,
          BaseContextMenu: true,
          BaseSkeleton: true,
          Teleport: true
        }
      }
    })

    await flushPromises()

    // Pindah ke halaman 2 di mana FS-OFF (id=1) berada
    const nextBtn = wrapper.findAll('button').find(btn => btn.attributes('title') === 'Halaman Selanjutnya')
    expect(nextBtn).toBeDefined()
    await nextBtn!.trigger('click')
    expect(wrapper.text()).toContain('FS-OFF')

    // Pilih filter Sumber Fulfillment = Aktif -> reset ke halaman 1, FS-OFF hilang
    const baseSelect = wrapper.findComponent({ name: 'BaseSelect' })
    expect(baseSelect.exists()).toBe(true)

    baseSelect.vm.$emit('update:modelValue', 'active')
    await flushPromises()
    expect(wrapper.text()).toContain('FS-ON-15')
    expect(wrapper.text()).not.toContain('FS-OFF')

    // Pilih filter Sumber Fulfillment = Tidak Aktif -> hanya FS-OFF tampil
    baseSelect.vm.$emit('update:modelValue', 'inactive')
    await flushPromises()
    expect(wrapper.text()).toContain('FS-OFF')
    expect(wrapper.text()).not.toContain('FS-ON-15')
  })
})
