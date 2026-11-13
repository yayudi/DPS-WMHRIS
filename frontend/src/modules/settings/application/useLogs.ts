import { ref } from 'vue'
import { logApi } from '../infrastructure/log.api'
import type { SystemLog, LogFilter } from '../domain/log.entity'
import { useToast } from '@/core/presentation/composables/useToast'
import { useI18n } from '@/core/infrastructure/localization'

export function useLogs() {
  const logs = ref<SystemLog[]>([])
  const total = ref(0)
  const isLoading = ref(false)
  const error = ref<string | null>(null)
  const { toast } = useToast()
  const { t } = useI18n()

  async function fetchLogs(filter: LogFilter) {
    isLoading.value = true
    error.value = null
    try {
      const response = await logApi.fetchLogs(filter)
      // Struktur balikan dari log API mungkin: { success: true, data: { data: [...], total: X } }
      // Tapi response interceptor mengembalikan inner `data`?
      // Jika interceptor mengembalikan data langsung, maka response itu sendiri adalah objek yang memiliki data dan total.
      logs.value = response.data || response.data?.data || []
      total.value = response.total || response.data?.total || 0
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } }; message?: string }
      error.value = e?.response?.data?.message || e?.message || t('settings.log.fetch_error')
      toast(error.value || 'Error', 'error')
    } finally {
      isLoading.value = false
    }
  }

  return {
    logs,
    total,
    isLoading,
    error,
    fetchLogs
  }
}
