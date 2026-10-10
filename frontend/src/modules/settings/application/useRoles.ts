import { ref } from 'vue'
import { roleApi } from '../infrastructure/role.api'
import type { Role, Permission, CreateRolePayload, UpdateRolePayload } from '../domain/role.entity'
import { useToast } from '@/composables/useToast'

export function useRoles() {
  const roles = ref<Role[]>([])
  const permissions = ref<Permission[]>([])
  const isLoading = ref(false)
  const error = ref<string | null>(null)
  const { toast } = useToast()

  async function fetchRoles() {
    isLoading.value = true
    error.value = null
    try {
      const response = await roleApi.fetchAllRoles()
      roles.value = response.data || response.roles || []
    } catch (err: any) {
      error.value = err?.response?.data?.message || err.message || 'Gagal mengambil data peran.'
      toast(error.value || 'Error', 'error')
    } finally {
      isLoading.value = false
    }
  }

  async function fetchPermissions() {
    try {
      const response = await roleApi.fetchAllPermissions()
      permissions.value = response.data || []
    } catch (err: any) {
      console.error(err)
      toast('Gagal mengambil daftar izin.', 'error')
    }
  }

  async function createRole(payload: CreateRolePayload) {
    isLoading.value = true
    error.value = null
    try {
      await roleApi.createRole(payload)
      toast('Peran berhasil dibuat!', 'success')
      await fetchRoles()
      return true
    } catch (err: any) {
      error.value = err?.response?.data?.message || err.message || 'Gagal membuat peran.'
      toast(error.value || 'Error', 'error')
      return false
    } finally {
      isLoading.value = false
    }
  }

  async function updateRole(id: number, payload: UpdateRolePayload) {
    isLoading.value = true
    error.value = null
    try {
      await roleApi.updateRole(id, payload)
      toast('Peran berhasil diperbarui!', 'success')
      await fetchRoles()
      return true
    } catch (err: any) {
      error.value = err?.response?.data?.message || err.message || 'Gagal memperbarui peran.'
      toast(error.value || 'Error', 'error')
      return false
    } finally {
      isLoading.value = false
    }
  }

  async function deleteRole(id: number) {
    isLoading.value = true
    error.value = null
    try {
      await roleApi.deleteRole(id)
      toast('Peran berhasil dihapus!', 'success')
      await fetchRoles()
      return true
    } catch (err: any) {
      error.value = err?.response?.data?.message || err.message || 'Gagal menghapus peran.'
      toast(error.value || 'Error', 'error')
      return false
    } finally {
      isLoading.value = false
    }
  }

  async function fetchRolePermissions(roleId: number): Promise<number[]> {
    try {
      const response = await roleApi.fetchRolePermissions(roleId)
      return response.data || []
    } catch (err: any) {
      console.error(err)
      toast('Gagal mengambil izin peran.', 'error')
      return []
    }
  }

  async function updateRolePermissions(roleId: number, permissionIds: number[]) {
    isLoading.value = true
    try {
      await roleApi.updateRolePermissions(roleId, permissionIds)
      toast('Izin peran berhasil diperbarui!', 'success')
      return true
    } catch (err: any) {
      error.value = err?.response?.data?.message || err.message || 'Gagal memperbarui izin peran.'
      toast(error.value || 'Error', 'error')
      return false
    } finally {
      isLoading.value = false
    }
  }

  return {
    roles,
    permissions,
    isLoading,
    error,
    fetchRoles,
    fetchPermissions,
    createRole,
    updateRole,
    deleteRole,
    fetchRolePermissions,
    updateRolePermissions
  }
}
