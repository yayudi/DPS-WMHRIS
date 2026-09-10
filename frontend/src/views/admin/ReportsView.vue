<!-- frontend/src/views/admin/ReportsView.vue -->
<script setup>
import { ref, computed, onMounted } from 'vue'
import { useDownload } from '@/composables/useDownload.js'
import { useDownloadStore } from '@/stores/downloadStore.js'
import BaseSkeleton from '@/components/ui/BaseSkeleton.vue'
import WmsActionHeader from '@/components/wms/shared/WmsActionHeader.vue'
import dayjs from 'dayjs'
import { useMobile } from '@/composables/useMobile.js'
import { formatFileName } from '@/utils/formatters.js'

const { isMobile } = useMobile()
const { openDownloadUrl } = useDownload()
const downloadStore = useDownloadStore()
const jobs = computed(() => downloadStore.jobs)
const loading = ref(false)

// Format status untuk badge
const getStatusClass = status => {
  switch (status) {
    case 'COMPLETED':
      return 'bg-[hsl(var(--color-success))/0.1] text-[hsl(var(--color-success))] border-[hsl(var(--color-success))/0.2]'
    case 'FAILED':
      return 'bg-[hsl(var(--color-danger))/0.1] text-[hsl(var(--color-danger))] border-[hsl(var(--color-danger))/0.2]'
    case 'PROCESSING':
      return 'bg-[hsl(var(--color-primary))/0.1] text-[hsl(var(--color-primary))] border-[hsl(var(--color-primary))/0.2] animate-pulse'
    default:
      return 'bg-[hsl(var(--color-text))/0.1] text-[hsl(var(--color-text))/0.6] border-[hsl(var(--color-text))/0.2]'
  }
}

const formatDate = dateStr => {
  return dayjs(dateStr).format('DD MMM YYYY HH:mm')
}

// Helpers untuk Label Tipe Job
const JOB_TYPE_MAP = {
  STOCK_REPORT: { label: 'Laporan Stok', cls: 'bg-primary/5 text-primary border-primary/20' },
  PRODUCT_MASTER: { label: 'Batch Produk', cls: 'bg-accent/5 text-accent border-accent/20' },
  EXPORT_PACKAGES: { label: 'Batch Paket', cls: 'bg-warning/5 text-warning border-warning/20' },
  STATISTICS_STOCK_MOVEMENT: { label: 'Pergerakan Stok', cls: 'bg-success/5 text-success border-success/20' },
  IMPORT_STOCK_INBOUND: { label: 'Impor Inbound', cls: 'bg-primary/5 text-primary border-primary/20' },
  IMPORT_STOCK_ADJUSTMENT: { label: 'Impor Adjustment', cls: 'bg-warning/5 text-warning border-warning/20' },
  IMPORT_MEDIA_BULK_LINK: { label: 'Link Media', cls: 'bg-accent/5 text-accent border-accent/20' },
  EXPORT_PRODUCT: { label: 'Ekspor Produk', cls: 'bg-primary/5 text-primary border-primary/20' },
}
const DEFAULT_JOB = { label: '', cls: 'bg-secondary/5 text-text/60 border-secondary/20' }

const getJobTypeLabel = type => (JOB_TYPE_MAP[type]?.label || type.replace(/_/g, ' '))
const getJobTypeClass = type => (JOB_TYPE_MAP[type]?.cls || DEFAULT_JOB.cls)

const STATUS_LABEL = { COMPLETED: 'Selesai', FAILED: 'Gagal', PROCESSING: 'Proses...', PENDING: 'Antrian' }
const getStatusLabel = status => STATUS_LABEL[status] || status

onMounted(() => {
  // Hanya fetch jika store masih kosong (misal langsung buka halaman ini pertama kali tanpa refresh GlobalManager)
  if (downloadStore.jobs.length === 0) {
    loading.value = true
    downloadStore.fetchJobs().finally(() => {
      loading.value = false
    })
  }
})
</script>

<template>
  <div class="max-w-7xl mx-auto">
    <!-- Header -->
    <WmsActionHeader
      title="Laporan Saya"
      description="Unduh hasil export data dan laporan yang telah Anda request."
      icon="fa-solid fa-file-arrow-down"
    >
    </WmsActionHeader>

    <!-- Job List -->
    <div
      class="bg-background rounded-xl shadow-lg border border-secondary/20 overflow-x-auto overflow-y-auto relative custom-scrollbar h-[calc(100vh-100px)]"
    >
      <table class="w-full text-left border-collapse" :class="isMobile ? 'block' : 'min-w-[800px]'">
        <thead
          class="bg-background/95 backdrop-blur-md shadow-sm ring-1 ring-secondary/5 text-xs uppercase font-bold text-text/60"
          :class="isMobile ? 'hidden' : 'sticky top-0 z-30'"
        >
          <tr>
            <th
              class="p-4 w-16 text-center sticky left-0 z-30 bg-background/95 backdrop-blur-md border-b border-secondary/10 shadow-[4px_0_8px_-4px_rgba(0,0,0,0.05)]"
            >
              #
            </th>
            <th class="p-4 border-b border-secondary/10">Tipe</th>
            <th class="p-4 border-b border-secondary/10">File</th>
            <th class="p-4 border-b border-secondary/10">Waktu Request</th>
            <th class="p-4 border-b border-secondary/10">Status</th>
            <th
              class="p-4 text-right sticky right-0 z-30 bg-background/95 backdrop-blur-md border-b border-secondary/10 shadow-[-4px_0_8px_-4px_rgba(0,0,0,0.05)]"
            >
              Aksi
            </th>
          </tr>
        </thead>
        <TransitionGroup
          tag="tbody"
          name="list"
          class="relative"
          :class="isMobile ? 'block' : 'divide-y divide-secondary/10'"
        >
          <!-- Loading State -->
          <template v-if="loading && jobs.length === 0">
            <tr v-for="n in 5" :key="`skeleton-${n}`" class="border-b border-secondary/20 animate-pulse">
              <td v-for="i in 5" :key="i" class="px-6 py-4">
                <BaseSkeleton
                  :shape="i === 5 ? 'rect' : 'text'"
                  :className="i === 1 ? 'w-8 h-4 mx-auto' : i === 5 ? 'w-16 h-6 mx-auto rounded-md' : 'w-full h-4'"
                />
              </td>
            </tr>
          </template>

          <tr v-else-if="jobs.length === 0" key="empty">
            <td colspan="6" class="p-12 text-center text-text/50">
              <font-awesome-icon icon="fa-solid fa-folder-open" class="text-5xl mb-4 opacity-30" />
              <p class="font-bold text-lg">Belum Ada Laporan</p>
              <p class="text-sm">Silakan lakukan export di menu Produk atau Stok.</p>
            </td>
          </tr>

          <tr
            v-else
            v-for="(job, index) in jobs"
            :key="job.id"
            class="transition-colors group relative"
            :class="
              isMobile
                ? 'block mb-4 p-4 bg-background/50 rounded-xl border border-secondary/20 shadow-sm mx-4 mt-4'
                : 'hover:bg-secondary/5'
            "
          >
            <td
              class="font-mono opacity-50 bg-background group-hover:bg-secondary/5 transition-colors"
              :class="
                isMobile
                  ? 'flex justify-between items-center py-2 border-b border-secondary/10'
                  : 'p-4 text-center sticky left-0 z-20 shadow-[4px_0_8px_-4px_rgba(0,0,0,0.05)]'
              "
            >
              <span v-if="isMobile" class="text-text/60 text-xs uppercase font-semibold">#</span>
              <span>{{ index + 1 }}</span>
            </td>
            <td :class="isMobile ? 'flex justify-between items-center py-2 border-b border-secondary/10' : 'p-4'">
              <span v-if="isMobile" class="text-text/60 text-xs uppercase font-semibold">Tipe</span>
              <span
                class="font-bold text-xs uppercase tracking-wider px-2 py-1 rounded border"
                :class="getJobTypeClass(job.type)"
              >
                {{ getJobTypeLabel(job.type) }}
              </span>
            </td>
            <td :class="isMobile ? 'flex justify-between items-center py-2 border-b border-secondary/10' : 'p-4'">
              <span v-if="isMobile" class="text-text/60 text-xs uppercase font-semibold">File</span>
              <div class="flex flex-col" :class="isMobile ? 'items-end' : ''">
                <div class="font-bold text-sm truncate max-w-xs" :title="job.file_path">{{ formatFileName(job.file_path, job.type) || 'Menunggu Proses...' }}</div>
                <div v-if="job.error_message" class="text-xs text-danger mt-1">Error: {{ job.error_message }}</div>
              </div>
            </td>
            <td
              class="text-sm whitespace-nowrap opacity-80"
              :class="isMobile ? 'flex justify-between items-center py-2 border-b border-secondary/10' : 'p-4'"
            >
              <span v-if="isMobile" class="text-text/60 text-xs uppercase font-semibold">Waktu</span>
              <span>{{ formatDate(job.created_at) }}</span>
            </td>
            <td :class="isMobile ? 'flex justify-between items-center py-2 border-b border-secondary/10' : 'p-4'">
              <span v-if="isMobile" class="text-text/60 text-xs uppercase font-semibold">Status</span>
              <span
                class="px-2.5 py-1 rounded-full text-xs font-bold border inline-flex items-center gap-1.5"
                :class="getStatusClass(job.status)"
              >
                <span
                  v-if="job.status === 'PROCESSING'"
                  class="w-1.5 h-1.5 rounded-full bg-current animate-ping"
                ></span>
                {{ getStatusLabel(job.status) }}
              </span>
            </td>
            <td
              class="bg-background group-hover:bg-secondary/5 transition-colors"
              :class="
                isMobile
                  ? 'flex justify-end items-center pt-4'
                  : 'p-4 text-right sticky right-0 z-20 shadow-[-4px_0_8px_-4px_rgba(0,0,0,0.05)]'
              "
            >
              <button
                v-if="job.status === 'COMPLETED' && job.download_url"
                @click="openDownloadUrl(job.download_url)"
                class="px-3 py-1.5 bg-primary text-secondary rounded-lg text-sm font-bold shadow-md hover:scale-105 active:scale-95 transition-all inline-flex items-center gap-2"
              >
                <font-awesome-icon icon="fa-solid fa-download" />
                Download
              </button>
              <button
                v-else-if="job.status === 'FAILED'"
                class="px-3 py-1.5 text-text/40 cursor-not-allowed text-sm font-medium"
                disabled
              >
                Gagal
              </button>
              <button
                v-else
                class="px-3 py-1.5 text-primary opacity-70 cursor-wait text-sm font-medium inline-flex items-center gap-2"
                disabled
              >
                <font-awesome-icon icon="fa-solid fa-spinner" spin />
                Proses...
              </button>
            </td>
          </tr>
        </TransitionGroup>
      </table>
    </div>
  </div>
</template>

<style scoped>
/* List Transitions */
.list-enter-active,
.list-leave-active {
  transition: all 0.3s ease;
}

.list-enter-from,
.list-leave-to {
  opacity: 0;
  transform: translateX(-10px);
}

.list-leave-active {
  transition: all 0.3s ease;
}
</style>
