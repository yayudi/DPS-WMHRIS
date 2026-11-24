import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import LogsView from '@/modules/settings/presentation/views/LogsView.vue'
import { logApi } from '@/modules/settings/infrastructure/log.api'

vi.mock('@/modules/settings/infrastructure/log.api', () => ({
  logApi: {
    fetchLogs: vi.fn()
  }
}))

describe('LogsView.vue', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    localStorage.clear()
    vi.mocked(logApi.fetchLogs).mockResolvedValue({
      data: [
        {
          id: 1,
          username: 'admin',
          nickname: 'Administrator',
          role: 'Admin',
          action: 'UPDATE',
          target_type: 'PRODUCT',
          target_id: 42,
          target_name: 'Valve',
          created_at: '2026-11-18T10:00:00Z'
        }
      ],
      total: 40
    })
  })

  it('menampilkan search dan semua filter langsung sejajar dengan tombol Segarkan tanpa FilterToggle', async () => {
    const wrapper = mount(LogsView, {
      global: {
        stubs: {
          FontAwesomeIcon: true,
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
    expect(wrapper.findComponent({ name: 'DateRangeFilter' }).exists()).toBe(true)
    expect(wrapper.text()).toContain('Semua Aksi')
    expect(wrapper.text()).toContain('Semua Tipe')

    const refreshBtn = wrapper.findAll('button').find(btn => btn.text().includes('Segarkan'))
    expect(refreshBtn).toBeDefined()
    expect(refreshBtn?.element.parentElement?.contains(searchInput.element)).toBe(true)
  })

  it('mengirim parameter filter yang diperbarui ke logApi.fetchLogs dan mereset halaman ke 1', async () => {
    const wrapper = mount(LogsView, {
      global: {
        stubs: {
          FontAwesomeIcon: true,
          BaseSkeleton: true,
          Teleport: true
        }
      }
    })

    await flushPromises()

    // Pindah ke halaman 2 dulu
    const nextBtn = wrapper.findAll('button').find(btn => btn.attributes('title') === 'Halaman Selanjutnya')
    expect(nextBtn).toBeDefined()
    await nextBtn!.trigger('click')
    await flushPromises()

    expect(logApi.fetchLogs).toHaveBeenLastCalledWith(
      expect.objectContaining({
        page: 2
      })
    )

    // Ubah filter Aksi -> harus reset page ke 1 dan mengirim payload action
    const selects = wrapper.findAllComponents({ name: 'TriStateSelect' })
    expect(selects).toHaveLength(2)

    selects[0].vm.$emit('update:modelValue', { include: ['CREATE'], exclude: ['LOGIN'] })
    selects[1].vm.$emit('update:modelValue', { include: ['PRODUCT'], exclude: ['USER'] })
    await flushPromises()

    expect(logApi.fetchLogs).toHaveBeenLastCalledWith(
      expect.objectContaining({
        page: 1,
        action: JSON.stringify({ include: ['CREATE'], exclude: ['LOGIN'] }),
        targetType: JSON.stringify({ include: ['PRODUCT'], exclude: ['USER'] })
      })
    )

    // Ubah search -> mengirim search query
    const searchInput = wrapper.find('#global-search-input')
    await searchInput.setValue('42')
    await flushPromises()

    expect(logApi.fetchLogs).toHaveBeenLastCalledWith(
      expect.objectContaining({
        page: 1,
        search: '42'
      })
    )
  })

  it('mengklik DateRangeFilter menutup dropdown TriStateSelect yang sedang terbuka', async () => {
    document.body.innerHTML = ''
    const wrapper = mount(LogsView, {
      attachTo: document.body,
      global: {
        stubs: {
          FontAwesomeIcon: true,
          BaseSkeleton: true
        }
      }
    })

    await flushPromises()

    // Buka dropdown TriStateSelect ("Semua Aksi")
    const allActionsBtn = wrapper.findAll('[tabindex="0"]').find(el => el.text().includes('Semua Aksi'))
    expect(allActionsBtn).toBeDefined()
    await allActionsBtn!.trigger('click')
    await flushPromises()
    expect(document.body.querySelector('input[placeholder="Cari opsi..."]')).not.toBeNull()

    // Klik trigger DateRangeFilter ("Filter Tanggal") -> harus menutup dropdown TriStateSelect & membuka DateRangeFilter
    const dateFilterBtn = wrapper.findAll('button').find(btn => btn.text().includes('Filter Tanggal'))
    expect(dateFilterBtn).toBeDefined()
    await dateFilterBtn!.trigger('click')
    await flushPromises()

    expect(document.body.querySelector('input[placeholder="Cari opsi..."]')).toBeNull()
    expect(document.body.querySelector('.date-range-popover')).not.toBeNull()

    wrapper.unmount()
  })
})
