import { ref } from 'vue'
import { userApi } from '../infrastructure/user.api'
import type { UserManagementUser, CreateUserPayload, UpdateUserPayload } from '../domain/user.entity'
import { useToast } from '@/core/presentation/composables/useToast'
import { useI18n } from '@/core/infrastructure/localization'

export function useUsers() {
  const users = ref<UserManagementUser[]>([])
  const isLoading = ref(false)
  const error = ref<string | null>(null)
  const { toast } = useToast()
  const { t } = useI18n()

  async function fetchUsers() {
    isLoading.value = true
    error.value = null
    try {
      const response = await userApi.fetchAllUsers()
      users.value = response.users || response.data?.users || response.data || []
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } }; message?: string }
      error.value = e?.response?.data?.message || e?.message || t('settings.user.fetch_failed')
      toast(error.value || 'Error', 'error')
    } finally {
      isLoading.value = false
    }
  }

  async function createUser(payload: CreateUserPayload) {
    isLoading.value = true
    error.value = null
    try {
      const res = await userApi.createUser(payload)
      toast(res?.message || t('common.status.success'), 'success')
      await fetchUsers()
      return true
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } }; message?: string }
      error.value = e?.response?.data?.message || e?.message || t('settings.user.create_error')
      toast(error.value || 'Error', 'error')
      return false
    } finally {
      isLoading.value = false
    }
  }

  async function updateUser(id: number, payload: UpdateUserPayload) {
    isLoading.value = true
    error.value = null
    try {
      const res = await userApi.updateUser(id, payload)
      toast(res?.message || t('common.status.success'), 'success')
      await fetchUsers()
      return true
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } }; message?: string }
      error.value = e?.response?.data?.message || e?.message || t('settings.user.update_error')
      toast(error.value || 'Error', 'error')
      return false
    } finally {
      isLoading.value = false
    }
  }

  async function deleteUser(id: number) {
    isLoading.value = true
    error.value = null
    try {
      const res = await userApi.deleteUser(id)
      toast(res?.message || t('common.status.success'), 'success')
      await fetchUsers()
      return true
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } }; message?: string }
      error.value = e?.response?.data?.message || e?.message || t('settings.user.delete_error')
      toast(error.value || 'Error', 'error')
      return false
    } finally {
      isLoading.value = false
    }
  }

  async function updateUserLocations(userId: number, locationIds: number[]) {
    isLoading.value = true
    error.value = null
    try {
      const res = await userApi.updateUserLocations(userId, locationIds)
      toast(res?.message || t('common.status.success'), 'success')
      return true
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } }; message?: string }
      error.value = e?.response?.data?.message || e?.message || t('settings.user.update_locations_error')
      toast(error.value || 'Error', 'error')
      return false
    } finally {
      isLoading.value = false
    }
  }

  async function fetchUserLocationIds(userId: number): Promise<number[]> {
    try {
      const response = await userApi.fetchUserLocationIds(userId)
      return response.data || []
    } catch (err: unknown) {
      console.error(err)
      toast(t('settings.user.fetch_locations_failed'), 'error')
      return []
    }
  }

  return {
    users,
    isLoading,
    error,
    fetchUsers,
    createUser,
    updateUser,
    deleteUser,
    updateUserLocations,
    fetchUserLocationIds
  }
}
