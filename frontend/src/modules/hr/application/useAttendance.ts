import { ref } from 'vue'
import { attendanceApi } from '../infrastructure/attendance.api'
import { AttendanceData } from '../domain/attendance.entity'
import { useI18n } from '@/core/presentation/composables/useI18n'

export function useAttendance() {
  const { t } = useI18n()
  const attendanceData = ref<AttendanceData | null>(null)
  const availableIndexes = ref<any[]>([])
  const isLoading = ref(false)
  const error = ref<string | null>(null)

  const fetchAvailableIndexes = async () => {
    try {
      isLoading.value = true
      error.value = null
      availableIndexes.value = await attendanceApi.getAvailableIndexes()
    } catch (err: any) {
      error.value = err.message || t('hris.attendance.fetch_index_error')
    } finally {
      isLoading.value = false
    }
  }

  const fetchAbsensiData = async (year: number, month: number) => {
    try {
      isLoading.value = true
      error.value = null
      attendanceData.value = await attendanceApi.getAbsensiData(year, month)
    } catch (err: any) {
      error.value = err.message || t('hris.attendance.fetch_data_error')
      attendanceData.value = null
    } finally {
      isLoading.value = false
    }
  }

  const fetchAbsensiRange = async (startDate: string, endDate: string) => {
    try {
      isLoading.value = true
      error.value = null
      attendanceData.value = await attendanceApi.getAbsensiRange(startDate, endDate)
    } catch (err: any) {
      error.value = err.message || t('hris.attendance.fetch_range_error')
      attendanceData.value = null
    } finally {
      isLoading.value = false
    }
  }

  const uploadAbsensiFile = async (formData: FormData) => {
    try {
      isLoading.value = true
      error.value = null
      return await attendanceApi.uploadAbsensiFile(formData)
    } catch (err: any) {
      error.value = err.message || t('hris.attendance.upload_error')
      throw err
    } finally {
      isLoading.value = false
    }
  }

  return {
    attendanceData,
    availableIndexes,
    isLoading,
    error,
    fetchAvailableIndexes,
    fetchAbsensiData,
    fetchAbsensiRange,
    uploadAbsensiFile
  }
}
