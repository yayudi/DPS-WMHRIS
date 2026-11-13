import { computed, onMounted } from 'vue'
import { stockApi } from '@/modules/wms/infrastructure/stock.api'
import { useToast } from '@/core/presentation/composables/useToast'
import { swalConfirm } from '@/core/presentation/composables/useSweetAlert'
import { useUploadStore } from '@/core/presentation/stores/uploadStore'
import { useI18n } from '@/core/presentation/composables/useI18n'

/**
 * @param {string} jobTypePrefix - Prefix to filter job type (e.g., 'IMPORT_ATTENDANCE' or 'IMPORT_SALES_')
 */
export function useJobHistory(jobTypePrefix: string) {
  const { toast } = useToast()
  const { t } = useI18n()
  const uploadStore = useUploadStore()

  const isHistoryLoading = computed(() => uploadStore.jobs.length === 0 && !uploadStore.isExpanded)

  const importJobHistory = computed(() => {
    return uploadStore.jobs
      .filter(j => (j.job_type || j.jobType || '').startsWith(jobTypePrefix))
      .sort((a, b) => new Date(b.created_at || b.createdAt).getTime() - new Date(a.created_at || a.createdAt).getTime())
  })

  async function fetchJobHistory() {
    // Dipanggil untuk backward compatibility atau jika butuh trigger paksa
    await uploadStore.fetchJobs()
  }

  async function handleVoidJob(job: any) {
    if (!(await swalConfirm(t('core.import.confirm_void_file', { filename: job.original_filename })))) return
    try {
      const res = await stockApi.voidImportJob(job.id)
      toast(res?.message || t('common.status.success'), 'success')
      fetchJobHistory()
    } catch (error) {
      console.error(error)
      toast(t('core.import.void_error'), 'error')
    }
  }

  function getProgress(job) {
    if (!job.total_records || job.total_records === 0) return 0
    const pct = Math.round((job.processed_records / job.total_records) * 100)
    return Math.min(pct, 100)
  }

  onMounted(() => {
    if (uploadStore.jobs.length === 0) {
      uploadStore.fetchJobs()
    }
  })

  return {
    importJobHistory,
    isHistoryLoading,
    fetchJobHistory,
    handleVoidJob,
    getProgress
  }
}
