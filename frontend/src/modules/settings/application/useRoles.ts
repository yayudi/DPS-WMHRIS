import { ref } from 'vue'
import { roleApi } from '../infrastructure/role.api'
import type { Role, Permission, CreateRolePayload, UpdateRolePayload } from '../domain/role.entity'
import { useToast } from '@/core/presentation/composables/useToast'
import { useI18n } from '@/core/infrastructure/localization'

export function useRoles() {
  const roles = ref<Role[]>([])
  const permissions = ref<Permission[]>([])
  const isLoading = ref(false)
  const error = ref<string | null>(null)
  const { toast } = useToast()
  const { t } = useI18n()

  async function fetchRoles() {
    isLoading.value = true
    error.value = null
    try {
      const response = await roleApi.fetchAllRoles()
      roles.value = response.data || response.roles || []
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } }; message?: string }
      error.value = e?.response?.data?.message || e?.message || t('settings.roles.fetch_failed')
      toast(error.value || 'Error', 'error')
    } finally {
      isLoading.value = false
    }
  }

  async function fetchPermissions() {
    try {
      const response = await roleApi.fetchAllPermissions()
      permissions.value = response.data || []
    } catch (err: unknown) {
      console.error(err)
      toast(t('settings.roles.fetch_permissions_failed'), 'error')
    }
  }

  async function createRole(payload: CreateRolePayload) {
    isLoading.value = true
    error.value = null
    try {
      const res = await roleApi.createRole(payload)
      toast(res?.message || t('common.status.success'), 'success')
      await fetchRoles()
      return true
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } }; message?: string }
      error.value = e?.response?.data?.message || e?.message || t('settings.roles.create_failed')
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
      const res = await roleApi.updateRole(id, payload)
      toast(res?.message || t('common.status.success'), 'success')
      await fetchRoles()
      return true
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } }; message?: string }
      error.value = e?.response?.data?.message || e?.message || t('settings.roles.update_failed')
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
      const res = await roleApi.deleteRole(id)
      toast(res?.message || t('common.status.success'), 'success')
      await fetchRoles()
      return true
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } }; message?: string }
      error.value = e?.response?.data?.message || e?.message || t('settings.roles.delete_failed')
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
    } catch (err: unknown) {
      console.error(err)
      toast(t('settings.roles.fetch_role_permissions_failed'), 'error')
      return []
    }
  }

  async function updateRolePermissions(roleId: number, permissionIds: number[]) {
    isLoading.value = true
    try {
      const res = await roleApi.updateRolePermissions(roleId, permissionIds)
      toast(res?.message || t('common.status.success'), 'success')
      return true
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } }; message?: string }
      error.value = e?.response?.data?.message || e?.message || t('settings.roles.permissions_update_failed')
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
