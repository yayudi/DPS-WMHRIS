import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import UserManagement from '@/modules/settings/presentation/views/UserManagement.vue'
import { userApi } from '@/modules/settings/infrastructure/user.api'
import { roleApi } from '@/modules/settings/infrastructure/role.api'
import { shiftApi } from '@/modules/hr/infrastructure/shift.api'

vi.mock('@/core/presentation/composables/useSweetAlert', () => ({
  swalConfirm: vi.fn().mockResolvedValue(true)
}))

vi.mock('@/modules/settings/infrastructure/user.api', () => ({
  userApi: {
    fetchAllUsers: vi.fn(),
    createUser: vi.fn(),
    updateUser: vi.fn(),
    deleteUser: vi.fn(),
    fetchUserLocationIds: vi.fn(),
    updateUserLocations: vi.fn(),
    fetchMyLocations: vi.fn()
  }
}))

vi.mock('@/modules/settings/infrastructure/role.api', () => ({
  roleApi: {
    fetchAllRoles: vi.fn(),
    fetchAllPermissions: vi.fn(),
    createRole: vi.fn(),
    updateRole: vi.fn(),
    deleteRole: vi.fn()
  }
}))

vi.mock('@/modules/hr/infrastructure/shift.api', () => ({
  shiftApi: {
    fetchSchedules: vi.fn(),
    createSchedule: vi.fn(),
    deleteSchedule: vi.fn(),
    uploadScheduleImport: vi.fn(),
    fetchShifts: vi.fn()
  }
}))

describe('UserManagement.vue', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('menampilkan search dan filter Role/Shift langsung sejajar dengan tombol Tambah Pengguna tanpa FilterToggle', async () => {
    vi.mocked(userApi.fetchAllUsers).mockResolvedValue({
      users: [
        { id: 1, username: 'budi_wh', nickname: 'Budi', role_id: 10, shift_id: 100, is_active: true }
      ]
    })
    vi.mocked(roleApi.fetchAllRoles).mockResolvedValue({
      data: [{ id: 10, name: 'Admin Gudang' }]
    })
    vi.mocked(shiftApi.fetchShifts).mockResolvedValue([
      { id: 100, name: 'Pagi', start_time: '08:00:00', end_time: '17:00:00' } as any
    ])

    const wrapper = mount(UserManagement, {
      global: {
        stubs: {
          FontAwesomeIcon: true,
          BaseModal: true,
          BaseContextMenu: true,
          BaseSkeleton: true,
          UserLocationModal: true,
          UserEditModal: true,
          Teleport: true
        }
      }
    })

    await flushPromises()

    const searchInput = wrapper.find('#global-search-input')
    expect(searchInput.exists()).toBe(true)
    expect(searchInput.isVisible()).toBe(true)

    expect(wrapper.findComponent({ name: 'FilterToggle' }).exists()).toBe(false)
    expect(wrapper.findComponent({ name: 'BaseFilterPanel' }).exists()).toBe(false)
    expect(wrapper.text()).toContain('Semua Role')
    expect(wrapper.text()).toContain('Semua Shift')
    expect(wrapper.text()).toContain('Tambah Pengguna')

    const addBtn = wrapper.findAll('button').find(btn => btn.text().includes('Tambah Pengguna'))
    expect(addBtn).toBeDefined()
    expect(addBtn?.element.parentElement?.contains(searchInput.element)).toBe(true)
  })

  it('memfilter pengguna berdasarkan pencarian, role, dan shift termasuk shift default (null)', async () => {
    vi.mocked(userApi.fetchAllUsers).mockResolvedValue({
      users: [
        { id: 1, username: 'andi_admin', nickname: 'Andi', role_id: 1, shift_id: 10, is_active: true },
        { id: 2, username: 'sari_picker', nickname: 'Sari', role_id: 2, shift_id: null, is_active: true },
        { id: 3, username: 'rudi_packer', nickname: 'Rudi', role_id: 2, is_active: true }
      ]
    })
    vi.mocked(roleApi.fetchAllRoles).mockResolvedValue({
      data: [
        { id: 1, name: 'Admin' },
        { id: 2, name: 'Staff' }
      ]
    })
    vi.mocked(shiftApi.fetchShifts).mockResolvedValue([
      { id: 10, name: 'Shift Pagi', start_time: '08:00:00', end_time: '17:00:00' } as any
    ])

    const wrapper = mount(UserManagement, {
      global: {
        stubs: {
          FontAwesomeIcon: true,
          BaseModal: true,
          BaseContextMenu: true,
          BaseSkeleton: true,
          UserLocationModal: true,
          UserEditModal: true,
          Teleport: true
        }
      }
    })

    await flushPromises()

    // 1. Pencarian nickname
    const searchInput = wrapper.find('#global-search-input')
    await searchInput.setValue('Sari')
    await flushPromises()
    expect(wrapper.text()).toContain('sari_picker')
    expect(wrapper.text()).not.toContain('andi_admin')

    // 2. Filter Role (TriStateSelect include role_id=1)
    await searchInput.setValue('')
    const selects = wrapper.findAllComponents({ name: 'TriStateSelect' })
    expect(selects).toHaveLength(2)

    selects[0].vm.$emit('update:modelValue', { include: [1], exclude: [] })
    await flushPromises()
    expect(wrapper.text()).toContain('andi_admin')
    expect(wrapper.text()).not.toContain('sari_picker')

    // 3. Reset Role, lalu filter Shift Default (null) -> harus menyertakan shift_id null maupun undefined
    selects[0].vm.$emit('update:modelValue', { include: [], exclude: [] })
    selects[1].vm.$emit('update:modelValue', { include: [null], exclude: [] })
    await flushPromises()
    expect(wrapper.text()).toContain('sari_picker')
    expect(wrapper.text()).toContain('rudi_packer')
    expect(wrapper.text()).not.toContain('andi_admin')
  })
})
