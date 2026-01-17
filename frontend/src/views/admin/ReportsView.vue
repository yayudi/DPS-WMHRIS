<!-- frontend/src/views/admin/ReportsView.vue -->
<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import axios from '@/api/axios.js'
import { useToast } from '@/composables/useToast.js'
import TableSkeleton from '@/components/ui/TableSkeleton.vue'
import dayjs from 'dayjs'

const { show } = useToast()

const jobs = ref([])
const loading = ref(false)
const intervalId = ref(null)

const fetchJobs = async () => {
  try {
    const response = await axios.get('/reports/my-jobs')
    if (response.data.success) {
      jobs.value = response.data.data
    }
  } catch (err) {
    console.error('Failed to fetch jobs:', err)
  }
}

const handleDownload = async (url, fileName) => {
  try {
    show('Memulai unduhan...', 'info')
    console.log(`[Frontend] Downloading from: ${url}`);
    console.log(`[Frontend] Desired Filename: ${fileName}`);

    // Fetch as Blob using Axios to bypass CORS/Browser naming issues
    const response = await axios.get(url, { responseType: 'blob' })
    console.log(`[Frontend] Response Headers:`, response.headers);
    console.log(`[Frontend] Content-Type:`, response.headers['content-type']);

    // Create Object URL
    const blobUrl = window.URL.createObjectURL(new Blob([response.data]))
    console.log(`[Frontend] Blob URL created: ${blobUrl}`);

    show('Unduhan berhasil.', 'success')
    const link = document.createElement('a')
    link.href = blobUrl
    link.setAttribute('download', fileName || 'download.xlsx')
    document.body.appendChild(link)
    link.click()

    // Clean up
    document.body.removeChild(link)
    window.URL.revokeObjectURL(blobUrl)

    show('Unduhan berhasil.', 'success')
  } catch (err) {
    console.error('Download error:', err)
    show('Gagal mengunduh file.', 'error')
  }
}

// Format status untuk badge
const getStatusClass = (status) => {
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

const formatDate = (dateStr) => {
  return dayjs(dateStr).format('DD MMM YYYY HH:mm')
}

// Helpers untuk Label Tipe Job
const getJobTypeLabel = (type) => {
  switch (type) {
    case 'STOCK_REPORT': return 'Laporan Stok'
    case 'PRODUCT_MASTER': return 'Batch Produk'
    case 'EXPORT_PACKAGES': return 'Batch Paket'
    default: return type // Fallback
  }
}

const getJobTypeClass = (type) => {
  switch (type) {
    case 'STOCK_REPORT': return 'bg-primary/5 text-primary border-primary/20'
    case 'PRODUCT_MASTER': return 'bg-accent/5 text-accent border-accent/20'
    case 'EXPORT_PACKAGES': return 'bg-warning/5 text-warning border-warning/20'
    default: return 'bg-secondary/5 text-text/60 border-secondary/20'
  }
}

onMounted(() => {
  loading.value = true
  fetchJobs().finally(() => {
    loading.value = false
  })

  // Auto refresh setiap 5 detik
  intervalId.value = setInterval(fetchJobs, 5000)
})

onUnmounted(() => {
  if (intervalId.value) clearInterval(intervalId.value)
})
</script>

<template>
  <div class="p-6 max-w-7xl mx-auto">
    <!-- Header -->
    <div class="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
      <div>
        <h1 class="text-3xl font-bold tracking-tight flex items-center gap-3">
          <span class="bg-[hsl(var(--color-primary))/0.1] text-[hsl(var(--color-primary))] p-2 rounded-lg text-2xl">
            <font-awesome-icon icon="fa-solid fa-file-arrow-down" />
          </span>
          Laporan Saya
        </h1>
        <p class="text-[hsl(var(--color-text))/0.6] text-sm mt-2 ml-1">
          Unduh hasil export data dan laporan yang telah Anda request.
        </p>
      </div>

      <button @click="fetchJobs"
        class="px-4 py-2 bg-[hsl(var(--color-secondary))] hover:bg-[hsl(var(--color-secondary))/0.8] rounded-lg font-medium transition-colors flex items-center gap-2">
        <font-awesome-icon icon="fa-solid fa-rotate-right" :spin="loading" />
        Refresh
      </button>
    </div>

    <!-- Job List -->
    <div
      class="bg-background rounded-xl shadow-lg border border-secondary/20 overflow-x-auto overflow-y-auto relative custom-scrollbar h-[calc(100vh-250px)]">

      <table class="w-full min-w-[800px] text-left border-collapse">
        <thead
          class="sticky top-0 z-30 bg-background/95 backdrop-blur-md shadow-sm ring-1 ring-secondary/5 text-xs uppercase font-bold text-text/60">
          <tr>
            <th
              class="p-4 w-16 text-center sticky left-0 z-30 bg-background/95 backdrop-blur-md border-b border-secondary/10 shadow-[4px_0_8px_-4px_rgba(0,0,0,0.05)]">
              #</th>
            <th class="p-4 border-b border-secondary/10">Tipe</th>
            <th class="p-4 border-b border-secondary/10">File</th>
            <th class="p-4 border-b border-secondary/10">Waktu Request</th>
            <th class="p-4 border-b border-secondary/10">Status</th>
            <th
              class="p-4 text-right sticky right-0 z-30 bg-background/95 backdrop-blur-md border-b border-secondary/10 shadow-[-4px_0_8px_-4px_rgba(0,0,0,0.05)]">
              Aksi</th>
          </tr>
        </thead>
        <TransitionGroup tag="tbody" name="list" class="divide-y divide-secondary/10 relative">
          <!-- Loading State -->
          <template v-if="loading && jobs.length === 0">
            <TableSkeleton v-for="n in 5" :key="`skeleton-${n}`" />
          </template>

          <tr v-else-if="jobs.length === 0" key="empty">
            <td colspan="6" class="p-12 text-center text-text/50">
              <font-awesome-icon icon="fa-solid fa-folder-open" class="text-5xl mb-4 opacity-30" />
              <p class="font-bold text-lg">Belum Ada Laporan</p>
              <p class="text-sm">Silakan lakukan export di menu Produk atau Stok.</p>
            </td>
          </tr>

          <tr v-else v-for="(job, index) in jobs" :key="job.id"
            class="hover:bg-secondary/5 transition-colors group relative">
            <td
              class="p-4 text-center font-mono opacity-50 sticky left-0 z-20 bg-background group-hover:bg-secondary/5 transition-colors shadow-[4px_0_8px_-4px_rgba(0,0,0,0.05)]">
              {{ index + 1 }}</td>
            <td class="p-4">
              <span class="font-bold text-xs uppercase tracking-wider px-2 py-1 rounded border"
                :class="getJobTypeClass(job.type)">
                {{ getJobTypeLabel(job.type) }}
              </span>
            </td>
            <td class="p-4">
              <div class="font-bold text-sm">{{ job.file_path || 'Menunggu Proses...' }}</div>
              <div v-if="job.error_message" class="text-xs text-danger mt-1">
                Error: {{ job.error_message }}
              </div>
            </td>
            <td class="p-4 text-sm whitespace-nowrap opacity-80">
              {{ formatDate(job.created_at) }}
            </td>
            <td class="p-4">
              <span class="px-2.5 py-1 rounded-full text-xs font-bold border inline-flex items-center gap-1.5"
                :class="getStatusClass(job.status)">
                <span v-if="job.status === 'PROCESSING'"
                  class="w-1.5 h-1.5 rounded-full bg-current animate-ping"></span>
                {{ job.status }}
              </span>
            </td>
            <td
              class="p-4 text-right sticky right-0 z-20 bg-background group-hover:bg-secondary/5 transition-colors shadow-[-4px_0_8px_-4px_rgba(0,0,0,0.05)]">
              <button v-if="job.status === 'COMPLETED' && job.download_url"
                @click="handleDownload(job.download_url, job.file_path)"
                class="px-3 py-1.5 bg-primary text-secondary rounded-lg text-sm font-bold shadow-md hover:scale-105 active:scale-95 transition-all inline-flex items-center gap-2">
                <font-awesome-icon icon="fa-solid fa-download" />
                Download
              </button>
              <button v-else-if="job.status === 'FAILED'"
                class="px-3 py-1.5 text-text/40 cursor-not-allowed text-sm font-medium" disabled>
                Gagal
              </button>
              <button v-else
                class="px-3 py-1.5 text-primary opacity-70 cursor-wait text-sm font-medium inline-flex items-center gap-2"
                disabled>
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
.custom-scrollbar::-webkit-scrollbar {
  width: 6px;
  height: 6px;
}

.custom-scrollbar::-webkit-scrollbar-track {
  background: transparent;
}

.custom-scrollbar::-webkit-scrollbar-thumb {
  background-color: hsl(var(--color-secondary) / 0.3);
  border-radius: 4px;
}

.custom-scrollbar::-webkit-scrollbar-thumb:hover {
  background-color: hsl(var(--color-secondary) / 0.5);
}

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
  position: absolute;
  width: 100%;
}
</style>
