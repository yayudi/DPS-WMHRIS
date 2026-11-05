<script setup lang="ts">
import { computed } from 'vue'
import { formatDate, formatFileName } from '@/core/utils/formatters'
import { useDownload } from '@/core/presentation/composables/useDownload'

export interface JobItem {
  id?: string | number
  status?: string
  created_at?: string
  createdAt?: string
  type?: string
  job_type?: string
  file_path?: string
  filePath?: string
  original_filename?: string
  originalFilename?: string
  download_url?: string
  downloadUrl?: string
  error_message?: string
  errorMessage?: string
  error_file_path?: string
  filters?: string
  [key: string]: unknown
}

const props = withDefaults(
  defineProps<{
    jobs: JobItem[]
    loading?: boolean
    emptyText?: string
    layout?: 'list' | 'table'
    showDownload?: boolean
    showType?: boolean
    showDryRunBadge?: boolean
  }>(),
  {
    loading: false,
    emptyText: 'Belum ada riwayat file.',
    layout: 'list',
    showDownload: true,
    showType: true,
    showDryRunBadge: true
  }
)

const emit = defineEmits<{
  (e: 'download', job: JobItem): void
}>()

const { openDownloadUrl } = useDownload()

const formatStatus = (status?: string): string => {
  switch (status) {
    case 'PENDING':
      return 'Menunggu'
    case 'PROCESSING':
      return 'Memproses'
    case 'COMPLETED':
      return 'Selesai'
    case 'FAILED':
      return 'Gagal'
    default:
      return status || '-'
  }
}

const getStatusClass = (status?: string): string => {
  switch (status) {
    case 'PENDING':
      return 'bg-warning/10 text-warning border-warning/20'
    case 'PROCESSING':
      return 'bg-accent/10 text-accent border-accent/20 animate-pulse'
    case 'COMPLETED':
      return 'bg-success/10 text-success border-success/20'
    case 'FAILED':
      return 'bg-danger/10 text-danger border-danger/20'
    default:
      return 'bg-secondary/10 text-text/60 border-secondary/20'
  }
}

const getJobDate = (job: JobItem): string => {
  const rawDate = job.created_at || job.createdAt
  return rawDate ? formatDate(rawDate) || '-' : '-'
}

const getJobFileName = (job: JobItem): string => {
  if (job.original_filename) return job.original_filename
  if (job.originalFilename) return job.originalFilename
  const path = job.file_path || job.filePath
  return formatFileName(path, job.type || job.job_type)
}

const getDownloadUrl = (job: JobItem): string | undefined => {
  return job.download_url || job.downloadUrl
}

const isDryRun = (job: JobItem): boolean => {
  const type = String(job.type || job.job_type || '')
  if (type.endsWith('_DRY_RUN')) return true
  if (job.filters) {
    try {
      const parsed = typeof job.filters === 'string' ? JSON.parse(job.filters) : job.filters
      return Boolean(parsed.dryRun || parsed.dry_run)
    } catch {
      return false
    }
  }
  return false
}

const handleDownload = (job: JobItem) => {
  emit('download', job)
  const url = getDownloadUrl(job)
  if (url) {
    openDownloadUrl(url)
  }
}
</script>

<template>
  <div class="w-full">
    <!-- Loading State -->
    <div
      v-if="loading && jobs.length === 0"
      class="flex flex-col items-center justify-center p-8 text-text/40"
    >
      <font-awesome-icon icon="fa-solid fa-circle-notch" spin size="2x" />
      <p class="mt-3 text-xs font-medium">Memuat riwayat...</p>
    </div>

    <!-- Empty State -->
    <div
      v-else-if="jobs.length === 0"
      class="flex flex-col items-center justify-center p-8 text-center"
    >
      <div class="w-14 h-14 bg-secondary/10 rounded-full flex items-center justify-center mb-3 text-text/30 text-2xl">
        <font-awesome-icon icon="fa-solid fa-folder-open" />
      </div>
      <p class="text-xs text-text/60 font-medium">{{ emptyText }}</p>
    </div>

    <!-- List Layout -->
    <div v-else-if="layout === 'list'" class="space-y-2.5">
      <div
        v-for="job in jobs"
        :key="job.id"
        class="flex items-center justify-between p-3.5 border border-secondary/20 rounded-xl bg-background hover:border-primary/30 transition-colors shadow-sm group"
      >
        <div class="min-w-0 pr-3">
          <div class="flex items-center gap-2 mb-1.5 flex-wrap">
            <span
              class="px-2 py-0.5 rounded text-[10px] font-extrabold uppercase tracking-wider border"
              :class="getStatusClass(job.status)"
            >
              {{ formatStatus(job.status) }}
            </span>
            <span
              v-if="showDryRunBadge && isDryRun(job)"
              class="px-1.5 py-0.5 rounded text-[9px] font-bold bg-secondary/20 text-text/60"
            >
              DRY RUN
            </span>
            <span class="text-xs text-text/40 font-medium flex items-center gap-1">
              <font-awesome-icon icon="fa-solid fa-clock" />
              {{ getJobDate(job) }}
            </span>
          </div>

          <p class="text-xs font-bold text-text truncate mb-0.5" :title="getJobFileName(job)">
            {{ getJobFileName(job) }}
          </p>

          <p
            v-if="job.status === 'FAILED'"
            class="text-[11px] text-danger font-semibold flex items-center gap-1 mt-1 truncate"
            :title="job.error_message || job.errorMessage || 'Gagal'"
          >
            <font-awesome-icon icon="fa-solid fa-circle-exclamation" />
            {{ job.error_message || job.errorMessage || 'Gagal memproses file' }}
          </p>
          <p
            v-else-if="showType && (job.type || job.job_type)"
            class="text-[10px] text-text/50 uppercase tracking-wider"
          >
            {{ String(job.type || job.job_type).replace(/_/g, ' ') }}
          </p>
        </div>

        <!-- Action / Download -->
        <div v-if="showDownload" class="shrink-0">
          <button
            v-if="job.status === 'COMPLETED' && getDownloadUrl(job)"
            type="button"
            @click.prevent="handleDownload(job)"
            class="px-3 py-1.5 bg-primary/10 text-primary hover:bg-primary hover:text-secondary rounded-lg text-xs font-bold transition-all flex items-center gap-1.5"
          >
            <font-awesome-icon icon="fa-solid fa-download" />
            <span>Unduh</span>
          </button>
          <span
            v-else-if="job.status === 'PROCESSING' || job.status === 'PENDING'"
            class="text-xs text-text/40 flex items-center gap-1"
          >
            <font-awesome-icon icon="fa-solid fa-circle-notch" spin />
          </span>
        </div>
      </div>
    </div>

    <!-- Table Layout -->
    <div v-else class="w-full overflow-x-auto rounded-xl border border-secondary/20 bg-background">
      <table class="w-full text-left border-collapse">
        <thead>
          <tr class="border-b border-secondary/20 bg-secondary/5 text-[11px] font-bold uppercase text-text/60">
            <th class="p-3">File / Tipe</th>
            <th class="p-3">Waktu</th>
            <th class="p-3">Status</th>
            <th v-if="showDownload" class="p-3 text-right">Aksi</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-secondary/10 text-xs">
          <tr v-for="job in jobs" :key="job.id" class="hover:bg-secondary/5 transition-colors">
            <td class="p-3">
              <div class="font-bold text-text truncate max-w-xs" :title="getJobFileName(job)">
                {{ getJobFileName(job) }}
              </div>
              <div v-if="job.error_message || job.errorMessage" class="text-[11px] text-danger mt-0.5">
                {{ job.error_message || job.errorMessage }}
              </div>
              <div v-else-if="showType && (job.type || job.job_type)" class="text-[10px] text-text/50 uppercase">
                {{ String(job.type || job.job_type).replace(/_/g, ' ') }}
              </div>
            </td>
            <td class="p-3 whitespace-nowrap text-text/60">
              {{ getJobDate(job) }}
            </td>
            <td class="p-3 whitespace-nowrap">
              <span
                class="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border inline-flex items-center gap-1"
                :class="getStatusClass(job.status)"
              >
                <span v-if="job.status === 'PROCESSING'" class="w-1.5 h-1.5 rounded-full bg-current animate-ping"></span>
                {{ formatStatus(job.status) }}
              </span>
              <span
                v-if="showDryRunBadge && isDryRun(job)"
                class="ml-1.5 px-1.5 py-0.5 rounded text-[9px] font-bold bg-secondary/20 text-text/60"
              >
                DRY RUN
              </span>
            </td>
            <td v-if="showDownload" class="p-3 text-right whitespace-nowrap">
              <button
                v-if="job.status === 'COMPLETED' && getDownloadUrl(job)"
                type="button"
                @click.prevent="handleDownload(job)"
                class="px-2.5 py-1 bg-primary/10 text-primary hover:bg-primary hover:text-secondary rounded-lg font-bold text-xs transition-colors inline-flex items-center gap-1.5"
              >
                <font-awesome-icon icon="fa-solid fa-download" />
                <span>Unduh</span>
              </button>
              <span v-else-if="job.status === 'FAILED'" class="text-danger font-medium text-xs">
                Gagal
              </span>
              <span v-else class="text-text/40 text-xs italic">
                Memproses...
              </span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

