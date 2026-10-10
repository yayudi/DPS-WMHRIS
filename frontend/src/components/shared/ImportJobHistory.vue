<template>
  <div class="h-full flex flex-col">
    <!-- Header -->
    <div class="flex justify-between items-center mb-4">
      <h4 class="font-semibold text-text text-sm">Riwayat Upload Terakhir</h4>
    </div>

    <!-- Loading State -->
    <div v-if="loading && jobs.length === 0" class="text-center py-8 text-text/40">
      <font-awesome-icon icon="fa-solid fa-circle-notch" spin size="2x" />
      <p class="mt-2 text-xs">Memuat riwayat...</p>
    </div>

    <!-- Empty State -->
    <div
      v-else-if="filteredJobs.length === 0"
      class="text-center py-8 border border-dashed border-secondary/30 rounded-xl bg-secondary/5"
    >
      <font-awesome-icon icon="fa-solid fa-history" class="text-text/20 text-3xl mb-2" />
      <p class="text-sm text-text/60">Belum ada riwayat upload.</p>
    </div>

    <!-- List -->
    <div v-else class="flex-1 overflow-y-auto space-y-3 pr-2 scrollbar-thin">
      <div
        v-for="job in filteredJobs"
        :key="job.id"
        class="bg-background border border-secondary/20 rounded-lg p-3 shadow-sm hover:shadow-md transition-shadow"
      >
        <div class="flex justify-between items-start mb-2">
          <div>
            <div class="flex items-center gap-2">
              <span
                class="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider"
                :class="getStatusClass(job.status)"
              >
                {{ formatStatus(job.status) }}
              </span>
              <span
                v-if="getIsDryRun(job)"
                class="text-[10px] bg-secondary/20 text-text/60 px-1.5 rounded"
              >
                TEST (DRY RUN)
              </span>
            </div>
            <p class="text-xs text-text/40 mt-1 flex items-center gap-1">
              <font-awesome-icon icon="fa-solid fa-clock" />
              {{ formatDate(job.created_at) }}
            </p>
          </div>

          <!-- Download Error Button -->
          <a
            v-if="getErrorUrl(job)"
            :href="getErrorUrl(job)"
            target="_blank"
            class="text-[10px] bg-danger/10 text-danger border border-danger/20 hover:bg-danger/20 px-2 py-1 rounded transition-colors flex items-center gap-1"
            title="Download Laporan Error"
          >
            <font-awesome-icon icon="fa-solid fa-download" />
            Detail Error
          </a>
        </div>

        <div class="flex items-center gap-2 mb-1">
          <font-awesome-icon icon="fa-solid fa-file-excel" class="text-success text-xs" />
          <span
            class="text-xs font-medium text-text truncate max-w-[200px]"
            :title="job.original_filename"
          >
            {{ job.original_filename }}
          </span>
        </div>

        <div
          class="text-[11px] text-text/70 bg-secondary/10 p-2 rounded leading-relaxed border border-secondary/10 flex flex-col gap-1"
        >
          <p v-if="job.notes"><span class="font-semibold">Catatan:</span> {{ job.notes }}</p>
          <p>{{ job.log_summary || 'Tidak ada detail.' }}</p>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted } from 'vue'
import dayjs from 'dayjs'
import { useUploadStore } from '@/stores/uploadStore'
import { useFirebaseSync } from '@/composables/useFirebaseSync'

const props = defineProps({
  // Array of Job Types to filter. If empty, shows all.
  jobTypes: {
    type: Array,
    default: () => [],
  }
})

const uploadStore = useUploadStore()
const loading = computed(() => uploadStore.jobs.length === 0 && !uploadStore.isExpanded)

const jobs = computed(() => {
  return uploadStore.jobs.filter(j => !j.job_type?.startsWith('EXPORT_'))
})

const filteredJobs = computed(() => {
  if (props.jobTypes.length === 0) return jobs.value
  return jobs.value.filter((j) => props.jobTypes.includes(j.job_type))
})

const formatDate = (date) => {
  return dayjs(date).format('DD MMM YYYY, HH:mm')
}

const formatStatus = (status) => {
  const map = {
    PENDING: 'Menunggu',
    PROCESSING: 'Memproses',
    COMPLETED: 'Selesai',
    COMPLETED_WITH_ERRORS: 'Selesai (Partial)',
    FAILED: 'Gagal',
  }
  return map[status] || status
}

const getStatusClass = (status) => {
  const map = {
    PENDING: 'bg-warning/10 text-warning',
    PROCESSING: 'bg-accent/10 text-accent animate-pulse',
    COMPLETED: 'bg-success/10 text-success',
    COMPLETED_WITH_ERRORS: 'bg-warning/10 text-warning',
    FAILED: 'bg-danger/10 text-danger',
  }
  return map[status] || 'bg-secondary/10 text-text/60'
}

const getIsDryRun = (job) => {
  return job.job_type?.endsWith('_DRY_RUN')
}

const getErrorUrl = (job) => {
  try {
    if (!job.error_log) return null
    const log = typeof job.error_log === 'string' ? JSON.parse(job.error_log) : job.error_log

    if (!log.download_url) return null

    // Determine Base URL from Env or Default
    let baseUrl = import.meta.env.VITE_API_BASE_URL || ''

    // Remove trailing /api if present (because uploads are served at root /uploads, not /api/uploads)
    baseUrl = baseUrl.replace(/\/api$/, '')

    // Remove trailing slash to prevent double slash
    baseUrl = baseUrl.replace(/\/$/, '')

    return `${baseUrl}${log.download_url}`
  } catch {
    return null
  }
}

onMounted(() => {
  if (uploadStore.jobs.length === 0) {
    uploadStore.fetchJobs()
  }
})

useFirebaseSync('BACKGROUND_JOBS', ['IMPORT_COMPLETED', 'IMPORT_FAILED'], () => {
  uploadStore.fetchJobs()
})
</script>
