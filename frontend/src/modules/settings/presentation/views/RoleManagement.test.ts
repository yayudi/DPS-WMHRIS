import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import RoleManagement from '@/modules/settings/presentation/views/RoleManagement.vue'
import { roleApi } from '@/modules/settings/infrastructure/role.api'

vi.mock('@/core/presentation/composables/useSweetAlert', () => ({
  swalConfirm: vi.fn().mockResolvedValue(true)
}))

vi.mock('@/modules/settings/infrastructure/role.api', () => ({
  roleApi: {
    fetchAllRoles: vi.fn(),
    fetchAllPermissions: vi.fn(),
    fetchRolePermissions: vi.fn(),
    createRole: vi.fn(),
    updateRole: vi.fn(),
    deleteRole: vi.fn(),
    updateRolePermissions: vi.fn()
  }
}))

const sampleRoles = [
  { id: 1, name: 'admin_gudang', description: 'Admin Gudang Utama' },
  { id: 2, name: 'picker', description: 'Operator Ambil Barang' },
  { id: 3, name: 'hr_staff', description: 'Staf Sumber Daya Manusia' }
]

const samplePermissions = [
  { id: 101, name: 'wms.stock.read', description: 'Lihat stok gudang', group: 'WMS' },
  { id: 102, name: 'wms.stock.adjust', description: 'Penyesuaian stok gudang', group: 'WMS' },
  { id: 201, name: 'catalog.product.read', description: 'Lihat katalog produk', group: 'Catalog' },
  { id: 301, name: 'hris.attendance.read', description: 'Lihat absensi karyawan', group: 'HRIS' }
]

function mountRoleManagement() {
  return mount(RoleManagement, {
    global: {
      stubs: {
        FontAwesomeIcon: true,
        BaseModal: true,
        Teleport: true
      }
    }
  })
}

describe('RoleManagement.vue', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    vi.mocked(roleApi.fetchAllRoles).mockResolvedValue({ data: sampleRoles })
    vi.mocked(roleApi.fetchAllPermissions).mockResolvedValue({ data: samplePermissions })
    vi.mocked(roleApi.fetchRolePermissions).mockResolvedValue({ data: [101, 201] })
    vi.mocked(roleApi.updateRolePermissions).mockResolvedValue({ message: 'Berhasil' })
  })

  it('menyaring daftar peran pada panel kiri berdasarkan nama dan deskripsi serta menampilkan empty state', async () => {
    const wrapper = mountRoleManagement()
    await flushPromises()

    const searchInputs = wrapper.findAllComponents({ name: 'SearchInput' })
    expect(searchInputs.length).toBe(2)

    const roleSearchInput = searchInputs[0].find('input')
    await roleSearchInput.setValue('Operator')
    await flushPromises()

    const roleList = wrapper.find('ul')
    expect(roleList.exists()).toBe(true)
    expect(roleList.text()).toContain('picker')
    expect(roleList.text()).not.toContain('admin_gudang')
    expect(roleList.text()).not.toContain('hr_staff')

    await roleSearchInput.setValue('tidak-ditemukan-xyz')
    await flushPromises()
    expect(wrapper.find('ul').exists()).toBe(false)
    expect(wrapper.text()).toContain('Tidak ada peran yang cocok.')
  })

  it('menyaring permission di panel kanan berdasarkan pencarian, grup, dan status centang', async () => {
    const wrapper = mountRoleManagement()
    await flushPromises()

    // 1. Pencarian permission by name/description
    const permSearchInput = wrapper.find('#global-search-input')
    expect(permSearchInput.exists()).toBe(true)
    await permSearchInput.setValue('absensi')
    await flushPromises()

    expect(wrapper.text()).toContain('hris.attendance.read')
    expect(wrapper.text()).not.toContain('wms.stock.read')

    await permSearchInput.setValue('')
    await flushPromises()

    // 2. Filter Grup (TriStateSelect include 'WMS')
    const groupSelect = wrapper.findComponent({ name: 'TriStateSelect' })
    expect(groupSelect.exists()).toBe(true)
    groupSelect.vm.$emit('update:modelValue', { include: ['WMS'], exclude: [] })
    await flushPromises()

    expect(wrapper.text()).toContain('wms.stock.read')
    expect(wrapper.text()).toContain('wms.stock.adjust')
    expect(wrapper.text()).not.toContain('catalog.product.read')

    // Reset grup -> filter status centang: checked vs unchecked
    groupSelect.vm.$emit('update:modelValue', { include: [], exclude: [] })
    const statusSelect = wrapper.findComponent({ name: 'BaseSelect' })
    expect(statusSelect.exists()).toBe(true)

    statusSelect.vm.$emit('update:modelValue', 'checked')
    await flushPromises()
    expect(wrapper.text()).toContain('wms.stock.read')
    expect(wrapper.text()).toContain('catalog.product.read')
    expect(wrapper.text()).not.toContain('wms.stock.adjust')

    statusSelect.vm.$emit('update:modelValue', 'unchecked')
    await flushPromises()
    expect(wrapper.text()).toContain('wms.stock.adjust')
    expect(wrapper.text()).toContain('hris.attendance.read')
    expect(wrapper.text()).not.toContain('wms.stock.read')

    // Kombinasi yang tidak cocok -> empty state permission
    await permSearchInput.setValue('non-existent-permission')
    await flushPromises()
    expect(wrapper.text()).toContain('Tidak ada izin yang cocok dengan filter.')
  })

  it('toggleGroup hanya mengubah izin yang sedang tampil terfilter di grup tersebut', async () => {
    // Role awal hanya memiliki wms.stock.read (101) tercentang
    vi.mocked(roleApi.fetchRolePermissions).mockResolvedValue({ data: [101] })

    const wrapper = mountRoleManagement()
    await flushPromises()

    // Filter status = unchecked sehingga di grup WMS hanya tampil wms.stock.adjust (102)
    // Lalu cari 'adjust' dan centang via "Pilih Semua", setelah itu reset filter
    const permSearchInput = wrapper.find('#global-search-input')
    await permSearchInput.setValue('adjust')
    await flushPromises()

    expect(wrapper.text()).toContain('wms.stock.adjust')
    expect(wrapper.text()).not.toContain('wms.stock.read')

    // Klik "Batal Semua" pada grup WMS saat hanya 'adjust' yang tampil -> 'read' (101) harus tetap tercentang jika 101 hidden,
    // lalu klik "Pilih Semua" hanya memilih 102
    const selectAllBtn = wrapper.findAll('button').find(btn => btn.text().includes('Pilih Semua'))
    expect(selectAllBtn).toBeDefined()
    await selectAllBtn!.trigger('click')
    await flushPromises()

    // Uji skenario sebaliknya: Role punya 101 & 102, filter 'adjust', klik "Batal Semua" -> 101 tetap tercentang!
    await permSearchInput.setValue('')
    await flushPromises()
    expect((wrapper.find('#perm-101').element as HTMLInputElement).checked).toBe(true)
    expect((wrapper.find('#perm-102').element as HTMLInputElement).checked).toBe(true)

    await permSearchInput.setValue('adjust')
    await flushPromises()
    const deselectAllBtn = wrapper.findAll('button').find(btn => btn.text().includes('Batal Semua'))
    expect(deselectAllBtn).toBeDefined()
    await deselectAllBtn!.trigger('click')
    await flushPromises()

    await permSearchInput.setValue('')
    await flushPromises()
    expect((wrapper.find('#perm-101').element as HTMLInputElement).checked).toBe(true)
    expect((wrapper.find('#perm-102').element as HTMLInputElement).checked).toBe(false)
  })
})
