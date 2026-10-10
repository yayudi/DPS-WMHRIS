import { ref } from 'vue'
import { shiftApi } from '../infrastructure/shift.api'
import { Schedule } from '../domain/shift.entity'

export function useShift() {
  const schedules = ref<Schedule[]>([])
  const shifts = ref<Shift[]>([])
  const isLoading = ref(false)
  const error = ref<string | null>(null)

  const fetchSchedules = async (userId?: number | string, startDate?: string, endDate?: string) => {
    try {
      isLoading.value = true
      error.value = null
      schedules.value = await shiftApi.fetchSchedules(userId, startDate, endDate)
    } catch (err: any) {
      error.value = err.message || 'Gagal mengambil jadwal'
      schedules.value = []
    } finally {
      isLoading.value = false
    }
  }

  const fetchShifts = async () => {
    try {
      isLoading.value = true
      error.value = null
      shifts.value = await shiftApi.fetchShifts()
    } catch (err: any) {
      error.value = err.message || 'Gagal mengambil shift'
      shifts.value = []
    } finally {
      isLoading.value = false
    }
  }

  const createSchedule = async (payload: any) => {
    try {
      isLoading.value = true
      error.value = null
      return await shiftApi.createSchedule(payload)
    } catch (err: any) {
      error.value = err.message || 'Gagal membuat jadwal'
      throw err
    } finally {
      isLoading.value = false
    }
  }

  const deleteSchedule = async (userId: number | string, date: string) => {
    try {
      isLoading.value = true
      error.value = null
      return await shiftApi.deleteSchedule(userId, date)
    } catch (err: any) {
      error.value = err.message || 'Gagal menghapus jadwal'
      throw err
    } finally {
      isLoading.value = false
    }
  }

  const uploadScheduleImport = async (formData: FormData) => {
    try {
      isLoading.value = true
      error.value = null
      return await shiftApi.uploadScheduleImport(formData)
    } catch (err: any) {
      error.value = err.message || 'Gagal mengupload jadwal'
      throw err
    } finally {
      isLoading.value = false
    }
  }

  const createShift = async (payload: any) => {
    try {
      isLoading.value = true
      error.value = null
      return await shiftApi.createShift(payload)
    } catch (err: any) {
      error.value = err.message || 'Gagal membuat shift'
      throw err
    } finally {
      isLoading.value = false
    }
  }

  const updateShift = async (id: number | string, payload: any) => {
    try {
      isLoading.value = true
      error.value = null
      return await shiftApi.updateShift(id, payload)
    } catch (err: any) {
      error.value = err.message || 'Gagal memperbarui shift'
      throw err
    } finally {
      isLoading.value = false
    }
  }

  const deleteShift = async (id: number | string) => {
    try {
      isLoading.value = true
      error.value = null
      return await shiftApi.deleteShift(id)
    } catch (err: any) {
      error.value = err.message || 'Gagal menghapus shift'
      throw err
    } finally {
      isLoading.value = false
    }
  }

  return {
    schedules,
    shifts,
    isLoading,
    error,
    fetchSchedules,
    fetchShifts,
    createSchedule,
    deleteSchedule,
    uploadScheduleImport,
    createShift,
    updateShift,
    deleteShift
  }
}
