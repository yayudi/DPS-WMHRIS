<!-- frontend/src/views/admin/ReportsView.vue -->
<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import axios from '@/api/axios.js'
import { useToast } from '@/composables/useToast.js'
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

      <button
        @click="fetchJobs"
        class="px-4 py-2 bg-[hsl(var(--color-secondary))] hover:bg-[hsl(var(--color-secondary))/0.8] rounded-lg font-medium transition-colors flex items-center gap-2"
      >
        <font-awesome-icon icon="fa-solid fa-rotate-right" :spin="loading" />
        Refresh
      </button>
    </div>

    <!-- Job List -->
    <div class="bg-[hsl(var(--color-background))] rounded-xl shadow-lg border border-[hsl(var(--color-secondary))/0.2] overflow-x-auto">
      <div v-if="loading && jobs.length === 0" class="p-8 text-center opacity-50">
        <font-awesome-icon icon="fa-solid fa-spinner" spin class="text-3xl mb-3" />
        <p>Memuat riwayat...</p>
      </div>

      <div v-else-if="jobs.length === 0" class="p-12 text-center text-[hsl(var(--color-text))/0.5]">
        <font-awesome-icon icon="fa-solid fa-folder-open" class="text-5xl mb-4 opacity-30" />
        <p class="font-bold text-lg">Belum Ada Laporan</p>
        <p class="text-sm">Silakan lakukan export di menu Produk atau Stok.</p>
      </div>

      <table v-else class="w-full min-w-[600px] text-left border-collapse">
        <thead class="bg-[hsl(var(--color-secondary))/0.05] border-b border-[hsl(var(--color-secondary))/0.2] text-xs uppercase font-bold text-[hsl(var(--color-text))/0.6]">
          <tr>
            <th class="p-4 w-16 text-center">#</th>
            <th class="p-4">Tipe</th>
            <th class="p-4">File</th>
            <th class="p-4">Waktu Request</th>
            <th class="p-4">Status</th>
            <th class="p-4 text-right">Aksi</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-[hsl(var(--color-secondary))/0.1]">
          <tr v-for="(job, index) in jobs" :key="job.id" class="hover:bg-[hsl(var(--color-secondary))/0.02] transition-colors">
            <td class="p-4 text-center font-mono opacity-50">{{ index + 1 }}</td>
            <td class="p-4">
              <span class="font-bold text-xs uppercase tracking-wider px-2 py-1 rounded border"
                :class="getJobTypeClass(job.type)">
                {{ getJobTypeLabel(job.type) }}
              </span>
            </td>
            <td class="p-4">
              <div class="font-bold text-sm">{{ job.file_path || 'Menunggu Proses...' }}</div>
              <div v-if="job.error_message" class="text-xs text-[hsl(var(--color-danger))] mt-1">
                Error: {{ job.error_message }}
              </div>
            </td>
            <td class="p-4 text-sm whitespace-nowrap opacity-80">
              {{ formatDate(job.created_at) }}
            </td>
            <td class="p-4">
              <span
                class="px-2.5 py-1 rounded-full text-xs font-bold border inline-flex items-center gap-1.5"
                :class="getStatusClass(job.status)"
              >
                <span v-if="job.status === 'PROCESSING'" class="w-1.5 h-1.5 rounded-full bg-current animate-ping"></span>
                {{ job.status }}
              </span>
            </td>
            <td class="p-4 text-right">
              <button
                v-if="job.status === 'COMPLETED' && job.download_url"
                @click="handleDownload(job.download_url, job.file_path)"
                class="px-3 py-1.5 bg-[hsl(var(--color-primary))] text-white rounded-lg text-sm font-bold shadow-md hover:scale-105 active:scale-95 transition-all flex items-center gap-2 ml-auto"
              >
                <font-awesome-icon icon="fa-solid fa-download" />
                Download
              </button>
              <button
                v-else-if="job.status === 'FAILED'"
                class="px-3 py-1.5 text-[hsl(var(--color-text))/0.4] cursor-not-allowed text-sm font-medium"
                disabled
              >
                Gagal
              </button>
               <button
                v-else
                class="px-3 py-1.5 text-[hsl(var(--color-primary))] opacity-70 cursor-wait text-sm font-medium flex items-center gap-2 ml-auto"
                disabled
              >
                <font-awesome-icon icon="fa-solid fa-spinner" spin />
                Proses...
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
