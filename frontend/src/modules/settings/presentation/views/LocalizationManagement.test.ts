import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import LocalizationManagement from '@/modules/settings/presentation/views/LocalizationManagement.vue'
import { localizationApi } from '@/core/infrastructure/localization.api'
import type { TranslationMatrixResponse } from '@/core/domain/localization.types'

vi.mock('@/core/infrastructure/localization.api', () => ({
  localizationApi: {
    getTranslationMatrix: vi.fn(),
    saveTranslations: vi.fn(),
    getActiveLocales: vi.fn(),
    getDictionary: vi.fn()
  }
}))

function buildSampleMatrix(): TranslationMatrixResponse {
  return {
    locales: [
      { code: 'id-ID', name: 'Bahasa Indonesia', is_default: true, version: 1 },
      { code: 'en-US', name: 'English', is_default: false, version: 1 }
    ],
    modules: ['common', 'hris', 'wms'],
    total_keys: 4,
    stats: [
      { locale_code: 'id-ID', translated_count: 4, missing_count: 0, percentage: 100 },
      { locale_code: 'en-US', translated_count: 3, missing_count: 1, percentage: 75 }
    ],
    rows: [
      {
        module: 'common',
        translation_key: 'save_btn',
        values: { 'id-ID': 'Simpan', 'en-US': 'Save' },
        is_complete: true
      },
      {
        module: 'wms',
        translation_key: 'stock_in',
        values: { 'id-ID': 'Stok Masuk', 'en-US': 'Inbound Stock' },
        is_complete: true
      },
      {
        module: 'wms',
        translation_key: 'stock_out',
        values: { 'id-ID': 'Stok Keluar', 'en-US': '' },
        is_complete: false
      },
      {
        module: 'hris',
        translation_key: 'shift_name',
        values: { 'id-ID': 'Nama Shift', 'en-US': 'Shift Name' },
        is_complete: true
      }
    ]
  }
}

function mountLocalization() {
  return mount(LocalizationManagement, {
    global: {
      stubs: {
        FontAwesomeIcon: true,
        Teleport: true
      }
    }
  })
}

describe('LocalizationManagement.vue', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    localStorage.clear()
    vi.mocked(localizationApi.getTranslationMatrix).mockResolvedValue({
      success: true,
      data: buildSampleMatrix()
    } as any)
    vi.mocked(localizationApi.getActiveLocales).mockResolvedValue({ success: true, data: [] } as any)
    vi.mocked(localizationApi.getDictionary).mockResolvedValue({ notModified: true })
  })

  it('merender toolbar filter terpadu serta menampilkan total_keys dan status is_complete dengan benar', async () => {
    const wrapper = mountLocalization()
    await flushPromises()

    expect(wrapper.find('#global-search-input').exists()).toBe(true)
    expect(wrapper.find('button[aria-haspopup="listbox"]').exists()).toBe(true)
    expect(wrapper.findComponent({ name: 'TriStateSelect' }).exists()).toBe(true)
    expect(wrapper.findComponent({ name: 'BaseSelect' }).exists()).toBe(true)

    expect(wrapper.find('select').exists()).toBe(false)
    expect(wrapper.find('input[type="checkbox"]').exists()).toBe(false)

    expect(wrapper.text()).toContain('Semua Modul')
    expect(wrapper.text()).toContain('Status')
    expect(wrapper.text()).toContain('4 / 4')
    expect(wrapper.text()).toContain('Lengkap')
    expect(wrapper.text()).toContain('Belum Lengkap')
  })

  it('menyaring baris secara client-side dengan searchBy, modul TriState, status (termasuk dirty), dan resetFilters tanpa fetch ulang', async () => {
    const wrapper = mountLocalization()
    await flushPromises()

    expect(localizationApi.getTranslationMatrix).toHaveBeenCalledTimes(1)

    // 1. Search by 'key' vs 'text'
    const searchComponent = wrapper.findComponent({ name: 'SearchInput' })
    const searchInput = wrapper.find('#global-search-input')

    searchComponent.vm.$emit('update:searchBy', 'key')
    await searchInput.setValue('Simpan')
    await flushPromises()
    expect(wrapper.text()).toContain('Tidak ada entri terjemahan yang cocok dengan filter.')

    await searchInput.setValue('save_btn')
    await flushPromises()
    expect(wrapper.text()).toContain('save_btn')
    expect(wrapper.text()).not.toContain('stock_in')

    searchComponent.vm.$emit('update:searchBy', 'text')
    await searchInput.setValue('wms.stock_in')
    await flushPromises()
    expect(wrapper.text()).toContain('Tidak ada entri terjemahan yang cocok dengan filter.')

    await searchInput.setValue('Inbound')
    await flushPromises()
    expect(wrapper.text()).toContain('stock_in')
    expect(wrapper.text()).not.toContain('save_btn')

    // Clear search
    await searchInput.setValue('')
    searchComponent.vm.$emit('update:searchBy', 'all')
    await flushPromises()

    // 2. Filter Modul TriState (include & exclude)
    const moduleSelect = wrapper.findComponent({ name: 'TriStateSelect' })
    moduleSelect.vm.$emit('update:modelValue', { include: ['wms'], exclude: [] })
    await flushPromises()
    expect(wrapper.text()).toContain('stock_in')
    expect(wrapper.text()).toContain('stock_out')
    expect(wrapper.text()).not.toContain('save_btn')
    expect(wrapper.text()).not.toContain('shift_name')

    moduleSelect.vm.$emit('update:modelValue', { include: [], exclude: ['hris'] })
    await flushPromises()
    expect(wrapper.text()).toContain('save_btn')
    expect(wrapper.text()).not.toContain('shift_name')

    moduleSelect.vm.$emit('update:modelValue', { include: [], exclude: [] })
    await flushPromises()

    // 3. Filter Status (incomplete, complete, dirty)
    const statusSelect = wrapper.findComponent({ name: 'BaseSelect' })
    statusSelect.vm.$emit('update:modelValue', 'incomplete')
    await flushPromises()
    expect(wrapper.text()).toContain('stock_out')
    expect(wrapper.text()).not.toContain('save_btn')

    statusSelect.vm.$emit('update:modelValue', 'complete')
    await flushPromises()
    expect(wrapper.text()).toContain('save_btn')
    expect(wrapper.text()).not.toContain('stock_out')

    // Edit baris common.save_btn untuk menandai sebagai dirty
    const idInput = wrapper.find('input[value="Simpan"]')
    expect(idInput.exists()).toBe(true)
    await idInput.setValue('Simpan Baru')
    await flushPromises()

    statusSelect.vm.$emit('update:modelValue', 'dirty')
    await flushPromises()
    expect(wrapper.text()).toContain('save_btn')
    expect(wrapper.text()).not.toContain('stock_in')
    expect(wrapper.text()).toContain('1 / 4')

    // Reset filter mengembalikan seluruh 4 baris tanpa fetch ulang
    const resetBtn = wrapper.findAll('button').find(btn => btn.text().includes('Reset'))
    expect(resetBtn).toBeDefined()
    await resetBtn!.trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('4 / 4')
    expect(wrapper.text()).toContain('shift_name')
    expect(localizationApi.getTranslationMatrix).toHaveBeenCalledTimes(1)
  })

  it('melakukan paginasi untuk > 50 baris dan mereset halaman ke 1 saat filter berubah', async () => {
    const manyRows = Array.from({ length: 55 }, (_, idx) => {
      const num = String(idx + 1).padStart(2, '0')
      return {
        module: 'common',
        translation_key: `item_${num}`,
        values: { 'id-ID': `Teks ${num}`, 'en-US': `Text ${num}` },
        is_complete: true
      }
    })
    vi.mocked(localizationApi.getTranslationMatrix).mockResolvedValue({
      success: true,
      data: {
        locales: [
          { code: 'id-ID', name: 'Bahasa Indonesia', is_default: true, version: 1 },
          { code: 'en-US', name: 'English', is_default: false, version: 1 }
        ],
        modules: ['common'],
        total_keys: 55,
        stats: [
          { locale_code: 'id-ID', translated_count: 55, missing_count: 0, percentage: 100 },
          { locale_code: 'en-US', translated_count: 55, missing_count: 0, percentage: 100 }
        ],
        rows: manyRows
      }
    } as any)

    const wrapper = mountLocalization()
    await flushPromises()

    expect(wrapper.text()).toContain('item_01')
    expect(wrapper.text()).not.toContain('item_55')

    const nextBtn = wrapper.findAll('button').find(btn => btn.attributes('title') === 'Halaman Selanjutnya')
    expect(nextBtn).toBeDefined()
    await nextBtn!.trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('item_55')
    expect(wrapper.text()).not.toContain('item_01')

    const searchInput = wrapper.find('#global-search-input')
    await searchInput.setValue('item_01')
    await flushPromises()

    expect(wrapper.text()).toContain('item_01')
    expect(wrapper.text()).not.toContain('item_55')
  })
})
