import { ref } from 'vue'
import { userApi } from '../infrastructure/user.api'
import type { UserManagementUser, CreateUserPayload, UpdateUserPayload } from '../domain/user.entity'
import { useToast } from '@/composables/useToast'

export function useUsers() {
  const users = ref<UserManagementUser[]>([])
  const isLoading = ref(false)
  const error = ref<string | null>(null)
  const { toast } = useToast()

  async function fetchUsers() {
    isLoading.value = true
    error.value = null
    try {
      const response = await userApi.fetchAllUsers()
      users.value = response.users || response.data?.users || response.data || []
    } catch (err: any) {
      error.value = err?.response?.data?.message || err.message || 'Gagal mengambil data pengguna.'
      toast(error.value || 'Error', 'error')
    } finally {
      isLoading.value = false
    }
  }

  async function createUser(payload: CreateUserPayload) {
    isLoading.value = true
    error.value = null
    try {
      await userApi.createUser(payload)
      toast('Pengguna berhasil dibuat!', 'success')
      await fetchUsers()
      return true
    } catch (err: any) {
      error.value = err?.response?.data?.message || err.message || 'Gagal membuat pengguna.'
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
      await userApi.updateUser(id, payload)
      toast('Data pengguna berhasil diperbarui!', 'success')
      await fetchUsers()
      return true
    } catch (err: any) {
      error.value = err?.response?.data?.message || err.message || 'Gagal memperbarui pengguna.'
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
      await userApi.deleteUser(id)
      toast('Pengguna berhasil dihapus!', 'success')
      await fetchUsers()
      return true
    } catch (err: any) {
      error.value = err?.response?.data?.message || err.message || 'Gagal menghapus pengguna.'
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
      await userApi.updateUserLocations(userId, locationIds)
      toast('Izin lokasi berhasil diperbarui!', 'success')
      return true
    } catch (err: any) {
      error.value = err?.response?.data?.message || err.message || 'Gagal memperbarui lokasi pengguna.'
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
    } catch (err: any) {
      console.error(err)
      toast('Gagal mengambil lokasi pengguna.', 'error')
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
