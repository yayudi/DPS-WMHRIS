import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import CategoryManagement from '@/modules/master_data/presentation/views/CategoryManagement.vue'
import { categoryApi } from '@/modules/master_data/infrastructure/category.api'
import { swalConfirm } from '@/core/presentation/composables/useSweetAlert'

vi.mock('@/core/presentation/composables/useSweetAlert', () => ({
  swalConfirm: vi.fn().mockResolvedValue(true)
}))

vi.mock('@/core/presentation/composables/useFirebaseSync', () => ({
  useFirebaseSync: vi.fn()
}))

vi.mock('@/modules/master_data/infrastructure/category.api', () => ({
  categoryApi: {
    fetchCategories: vi.fn(),
    createCategory: vi.fn(),
    updateCategory: vi.fn(),
    deleteCategory: vi.fn(),
    restoreCategory: vi.fn()
  }
}))

describe('CategoryManagement.vue', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    localStorage.clear()
  })

  it('merender input pencarian dan memfilter kategori secara client-side serta mereset halaman ke 1', async () => {
    const sampleCategories = Array.from({ length: 25 }, (_, idx) => ({
      id: idx + 1,
      name: idx === 24 ? 'Pneumatic Valve' : `Kategori ${idx + 1}`
    }))
    vi.mocked(categoryApi.fetchCategories).mockResolvedValue(sampleCategories)

    const wrapper = mount(CategoryManagement, {
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
    expect(wrapper.find('button[aria-haspopup="listbox"]').exists()).toBe(false)

    // Pindah ke halaman 2 dulu (item ke-25 "Pneumatic Valve" ada di halaman 2 dengan limit 20)
    const nextBtn = wrapper.findAll('button').find(btn => btn.attributes('title') === 'Halaman Selanjutnya')
    expect(nextBtn).toBeDefined()
    await nextBtn!.trigger('click')
    expect(wrapper.text()).toContain('Pneumatic Valve')

    // Ketik query yang hanya cocok di item halaman 1 -> harus kembali ke halaman 1 dan menampilkan hasil
    await searchInput.setValue('kategori 1')
    await flushPromises()

    expect(wrapper.text()).toContain('Kategori 1')
    expect(wrapper.text()).not.toContain('Pneumatic Valve')

    // Ketik query yang tidak ada kecocokan -> tampilkan empty state pencarian
    await searchInput.setValue('tidak-ada-xyz')
    await flushPromises()

    expect(wrapper.text()).toContain('Tidak ada data ditemukan')
    expect(wrapper.text()).not.toContain('Belum ada kategori')
  })

  it('mendukung filter status Aktif/Arsip dan memulihkan kategori arsip', async () => {
    vi.mocked(categoryApi.fetchCategories).mockImplementation(async (_search?: string, status = 'active') => {
      if (status === 'archived') {
        return [{ id: 99, name: 'Kategori Arsip', is_active: false }]
      }
      return [{ id: 1, name: 'Kategori Aktif', is_active: true }]
    })
    vi.mocked(categoryApi.restoreCategory).mockResolvedValue({ success: true, message: 'Berhasil' })

    const wrapper = mount(CategoryManagement, {
      global: {
        stubs: {
          FontAwesomeIcon: true,
          BaseModal: true,
          BaseSkeleton: true,
          Teleport: true
        }
      }
    })

    await flushPromises()
    expect(categoryApi.fetchCategories).toHaveBeenCalledWith('', 'active')
    expect(wrapper.text()).toContain('Kategori Aktif')

    // Toggle switch ke mode Arsip
    const statusCheckbox = wrapper.find('input[type="checkbox"]')
    expect(statusCheckbox.exists()).toBe(true)
    await statusCheckbox.setValue(true)
    await flushPromises()

    expect(categoryApi.fetchCategories).toHaveBeenCalledWith('', 'archived')
    expect(wrapper.text()).toContain('Kategori Arsip')

    const archivedNameSpan = wrapper.find('span[contenteditable="false"]')
    expect(archivedNameSpan.exists()).toBe(true)

    // Buka context menu pada baris arsip dan pilih Pulihkan Kategori
    const row = wrapper.find('tr:has(span[contenteditable="false"])')
    expect(row.exists()).toBe(true)
    await row.trigger('contextmenu')
    await flushPromises()

    const contextMenu = wrapper.findComponent({ name: 'BaseContextMenu' })
    expect(contextMenu.props('options')).toEqual([
      expect.objectContaining({ action: 'restore' })
    ])

    await contextMenu.vm.$emit('action', 'restore')
    await flushPromises()

    expect(swalConfirm).toHaveBeenCalled()
    expect(categoryApi.restoreCategory).toHaveBeenCalledWith(99)
    expect(categoryApi.fetchCategories).toHaveBeenLastCalledWith('', 'archived')
  })

  it('memfilter kategori berdasarkan status pemakaian Terpakai vs Kosong', async () => {
    vi.mocked(categoryApi.fetchCategories).mockResolvedValue([
      { id: 1, name: 'Kategori Terpakai', is_active: true, product_count: 5 },
      { id: 2, name: 'Kategori Kosong', is_active: true, product_count: 0 }
    ])

    const wrapper = mount(CategoryManagement, {
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

    expect(wrapper.text()).toContain('Kategori Terpakai')
    expect(wrapper.text()).toContain('Kategori Kosong')

    const usageSelect = wrapper.findComponent({ name: 'BaseSelect' })
    expect(usageSelect.exists()).toBe(true)

    await usageSelect.vm.$emit('update:modelValue', 'used')
    await flushPromises()
    expect(wrapper.text()).toContain('Kategori Terpakai')
    expect(wrapper.text()).not.toContain('Kategori Kosong')

    await usageSelect.vm.$emit('update:modelValue', 'empty')
    await flushPromises()
    expect(wrapper.text()).not.toContain('Kategori Terpakai')
    expect(wrapper.text()).toContain('Kategori Kosong')
  })
})
