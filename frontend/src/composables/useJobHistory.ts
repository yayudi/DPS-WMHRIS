// frontend/src/composables/useJobHistory.js
import { computed, onMounted } from 'vue'
import { stockApi } from '@/modules/wms/infrastructure/stock.api'
import { useToast } from '@/composables/useToast'
import { swalConfirm } from '@/composables/useSweetAlert'
import { useUploadStore } from '@/stores/uploadStore'

/**
 * @param {string} jobTypePrefix - Prefix to filter job type (e.g., 'IMPORT_ATTENDANCE' or 'IMPORT_SALES_')
 */
export function useJobHistory(jobTypePrefix) {
  const { toast } = useToast()
  const uploadStore = useUploadStore()

  const isHistoryLoading = computed(() => uploadStore.jobs.length === 0 && !uploadStore.isExpanded)

  const importJobHistory = computed(() => {
    return uploadStore.jobs
      .filter(j => (j.job_type || j.jobType || '').startsWith(jobTypePrefix))
      .sort((a, b) => new Date(b.created_at || b.createdAt) - new Date(a.created_at || a.createdAt))
  })

  async function fetchJobHistory() {
    // Dipanggil untuk backward compatibility atau jika butuh trigger paksa
    await uploadStore.fetchJobs()
  }

  async function handleVoidJob(job) {
    if (!(await swalConfirm(`Void antrian file "${job.original_filename}"?`))) return
    try {
      await stockApi.voidImportJob(job.id)
      toast('Antrian berhasil di-void.', 'success')
      fetchJobHistory()
    } catch (error) {
      console.error(error)
      toast('Gagal melakukan void.', 'error')
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
