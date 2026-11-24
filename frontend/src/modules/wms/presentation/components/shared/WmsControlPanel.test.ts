import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import WmsControlPanel from '@/modules/wms/presentation/components/shared/WmsControlPanel.vue'

class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}

describe('WmsControlPanel.vue', () => {
  let wrapper: ReturnType<typeof mount> | null = null

  beforeEach(() => {
    setActivePinia(createPinia())
    vi.stubGlobal('ResizeObserver', ResizeObserverMock)
    document.body.innerHTML = ''
  })

  afterEach(() => {
    wrapper?.unmount()
    wrapper = null
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  function mountControlPanel(overrides: Record<string, unknown> = {}) {
    return mount(WmsControlPanel, {
      attachTo: document.body,
      global: {
        stubs: {
          FontAwesomeIcon: true,
          BaseSelect: true,
          TriStateSelect: true,
          SegmentedControl: true
        }
      },
      props: {
        searchBy: 'name',
        searchValue: '',
        searchPlaceholder: 'Cari berdasarkan Nama...',
        searchTabs: [
          { label: 'Nama', value: 'name' },
          { label: 'SKU', value: 'sku' }
        ],
        warehouseViews: [{ label: 'Semua', value: 'all' }],
        activeView: 'all',
        ...overrides
      }
    })
  }

  it('merender tombol dropdown searchBy di sebelah kiri input pencarian', () => {
    wrapper = mountControlPanel()
    const trigger = wrapper.find('button[aria-haspopup="listbox"]')

    expect(trigger.exists()).toBe(true)
    expect(trigger.text()).toContain('Nama')
    expect(trigger.attributes('aria-expanded')).toBe('false')
    expect(wrapper.find('#global-search-input').exists()).toBe(true)
    expect(wrapper.findAllComponents({ name: 'SegmentedControl' })).toHaveLength(1)
  })

  it('memposisikan dropdown tepat di bawah tombol trigger tanpa override transform', async () => {
    vi.spyOn(document.documentElement, 'clientWidth', 'get').mockReturnValue(1280)
    vi.spyOn(document.documentElement, 'clientHeight', 'get').mockReturnValue(800)

    wrapper = mountControlPanel()
    const trigger = wrapper.find('button[aria-haspopup="listbox"]')

    vi.spyOn(trigger.element, 'getBoundingClientRect').mockReturnValue({
      x: 120,
      y: 80,
      top: 80,
      left: 120,
      bottom: 122,
      right: 200,
      width: 80,
      height: 42,
      toJSON: () => ({})
    } as DOMRect)

    await trigger.trigger('click')
    await flushPromises()
    await new Promise(resolve => setTimeout(resolve, 0))
    await flushPromises()

    const listbox = document.body.querySelector('[role="listbox"]') as HTMLElement | null
    expect(listbox).not.toBeNull()

    const floatingContainer = listbox?.parentElement as HTMLElement | null
    expect(floatingContainer).not.toBeNull()
    expect(floatingContainer?.style.position).toBe('fixed')
    expect(floatingContainer?.style.transform).toBe('')
    expect(floatingContainer?.style.left).toBe('120px')
    expect(floatingContainer?.style.top).toBe('126px')
    expect(floatingContainer?.classList.contains('animate-fade-in-down')).toBe(false)
    expect(floatingContainer?.classList.contains('invisible')).toBe(false)
    expect(listbox?.classList.contains('animate-fade-in-down')).toBe(true)
  })

  it('meng-emit update:searchBy dan menutup dropdown saat opsi dipilih atau Escape ditekan', async () => {
    wrapper = mountControlPanel()
    const trigger = wrapper.find('button[aria-haspopup="listbox"]')

    await trigger.trigger('click')
    await flushPromises()

    const options = Array.from(document.body.querySelectorAll('[role="option"]')) as HTMLButtonElement[]
    expect(options).toHaveLength(2)

    options[1].click()
    await flushPromises()

    expect(wrapper.emitted('update:searchBy')?.[0]).toEqual(['sku'])
    expect(document.body.querySelector('[role="listbox"]')).toBeNull()

    await trigger.trigger('click')
    await flushPromises()
    expect(document.body.querySelector('[role="listbox"]')).not.toBeNull()

    await trigger.trigger('keydown', { key: 'Escape' })
    await flushPromises()
    expect(document.body.querySelector('[role="listbox"]')).toBeNull()
  })

  it('menghapus label di atas dropdown dan menampilkan prefix konteks di dalam BaseSelect dan TriStateSelect', () => {
    wrapper = mount(WmsControlPanel, {
      attachTo: document.body,
      global: {
        stubs: {
          FontAwesomeIcon: true,
          SegmentedControl: true
        }
      },
      props: {
        searchBy: 'name',
        searchValue: '',
        searchTabs: [
          { label: 'Nama', value: 'name' },
          { label: 'SKU', value: 'sku' }
        ],
        warehouseViews: [
          { label: 'Semua', value: 'all' },
          { label: 'Gudang', value: 'gudang' }
        ],
        activeView: 'gudang',
        buildingFilterOptions: [{ label: 'A', value: 'A' }],
        floorFilterOptions: [{ label: '2', value: '2' }],
        categoryFilterOptions: [{ id: 10, label: 'Aksesoris' }],
        selectedBuilding: { include: ['A'], exclude: [] },
        selectedFloor: { include: ['2'], exclude: [] },
        selectedCategory: { include: [10], exclude: [] },
        productTypeFilter: 'unit',
        stockStatusFilter: 'nonzero'
      }
    })

    expect(wrapper.findAll('label')).toHaveLength(0)

    const text = wrapper.text()
    expect(text).toContain('Gedung:')
    expect(text).toContain('A')
    expect(text).toContain('Lt:')
    expect(text).toContain('2')
    expect(text).toContain('Tipe:')
    expect(text).toContain('Tunggal')
    expect(text).toContain('Stok:')
    expect(text).toContain('Tidak Kosong')
    expect(text).toContain('Kategori:')
    expect(text).toContain('Aksesoris')
  })

  it('menampilkan placeholder nama filter secara seragam saat nilai masih default all/kosong', () => {
    wrapper = mount(WmsControlPanel, {
      attachTo: document.body,
      global: {
        stubs: {
          FontAwesomeIcon: true,
          SegmentedControl: true
        }
      },
      props: {
        searchBy: 'name',
        searchValue: '',
        searchTabs: [
          { label: 'Nama', value: 'name' },
          { label: 'SKU', value: 'sku' }
        ],
        warehouseViews: [
          { label: 'Semua', value: 'all' },
          { label: 'Gudang', value: 'gudang' }
        ],
        activeView: 'gudang',
        productTypeFilter: 'all',
        stockStatusFilter: 'all'
      }
    })

    const text = wrapper.text()
    expect(text).toContain('Gedung')
    expect(text).toContain('Lantai')
    expect(text).toContain('Tipe Produk')
    expect(text).toContain('Status Stok')
    expect(text).toContain('Kategori')
    expect(text).not.toContain('Semua Tipe')
  })

  it('memposisikan dropdown menu kolom tepat di bawah tombol sliders tanpa override transform', async () => {
    vi.spyOn(document.documentElement, 'clientWidth', 'get').mockReturnValue(1280)
    vi.spyOn(document.documentElement, 'clientHeight', 'get').mockReturnValue(800)

    wrapper = mountControlPanel({
      availableColumns: [{ id: 'sku', label: 'SKU' }],
      visibleColumns: new Set(['sku'])
    })

    const buttons = wrapper.findAll('button')
    const columnMenuButton = buttons[buttons.length - 1]
    expect(columnMenuButton.exists()).toBe(true)

    vi.spyOn(columnMenuButton.element, 'getBoundingClientRect').mockReturnValue({
      x: 1180,
      y: 80,
      top: 80,
      left: 1180,
      bottom: 122,
      right: 1222,
      width: 42,
      height: 42,
      toJSON: () => ({})
    } as DOMRect)

    await columnMenuButton.trigger('click')
    await flushPromises()
    await new Promise(resolve => setTimeout(resolve, 0))
    await flushPromises()

    const menuOuter = document.body.querySelector('.column-selector-group') as HTMLElement | null
    expect(menuOuter).not.toBeNull()
    expect(menuOuter?.style.position).toBe('fixed')
    expect(menuOuter?.style.transform).toBe('')
    expect(menuOuter?.style.top).toBe('130px')
    expect(menuOuter?.classList.contains('animate-fade-in-down')).toBe(false)
    expect(menuOuter?.classList.contains('invisible')).toBe(false)
    expect(menuOuter?.firstElementChild?.classList.contains('animate-fade-in-down')).toBe(true)
  })
})
