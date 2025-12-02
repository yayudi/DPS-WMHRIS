<!-- frontend\src\components\picking\PickingUploadTab.vue -->
<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import { useToast } from '@/composables/UseToast.js'
import { getImportJobs, cancelImportJob } from '@/api/helpers/stock.js'

// [UPDATE] Hapus import modal validasi yang tidak dipakai lagi
import PickingUploadForm from './PickingUploadForm.vue'

const { show } = useToast()
const emit = defineEmits(['view-errors', 'switch-tab'])

// --- STATE HISTORY TABLE ---
const importJobHistory = ref([])
const isHistoryLoading = ref(false)
let pollingInterval = null

// --- LOGIKA HISTORY ---
function startPolling() {
  if (pollingInterval) clearInterval(pollingInterval)
  pollingInterval = setInterval(fetchJobHistory, 3000)
}

function stopPolling() {
  if (pollingInterval) clearInterval(pollingInterval)
}

async function fetchJobHistory() {
  try {
    const res = await getImportJobs()
    if (res && res.data) {
      importJobHistory.value = res.data
        .filter((j) => j.job_type && j.job_type.startsWith('IMPORT_SALES_'))
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    }
  } catch (error) {
    console.error(error)
  }
}

async function handleCancelJob(job) {
  if (!confirm(`Batalkan antrian file "${job.original_filename}"?`)) return
  try {
    await cancelImportJob(job.id)
    show('Antrian berhasil dibatalkan.', 'success')
    fetchJobHistory()
  } catch (error) {
    show(error.response?.data?.message || 'Gagal membatalkan job.', 'error')
  }
}

// [UPDATE] Handler Langsung Redirect
function handleUploadComplete(data) {
  // Data (summary) diterima, tapi karena Backend V2 sudah insert DB,
  // Kita tidak perlu konfirmasi manual lagi.

  // Jika ada error parsial (beberapa file gagal), tampilkan toast warning
  if (data.errors && data.errors.length > 0) {
    show(`Berhasil sebagian. ${data.errors.length} file bermasalah (cek history).`, 'warning')
  }

  // REFRESH HISTORY (agar user bisa lihat lognya nanti)
  fetchJobHistory()

  // LANGSUNG PINDAH TAB
  emit('switch-tab', 'pickingList')
}

// Lifecycle
onMounted(() => {
  isHistoryLoading.value = true
  fetchJobHistory().finally(() => {
    isHistoryLoading.value = false
    startPolling()
  })
})

onUnmounted(() => {
  stopPolling()
})
</script>

<template>
  <div class="grid grid-cols-1 xl:grid-cols-3 gap-8 animate-fade-in">
    <div class="xl:col-span-1 space-y-6">
      <div class="bg-secondary/30 border border-secondary/20 rounded-2xl p-6 shadow-sm">
        <h3 class="text-lg font-bold mb-6 flex items-center gap-2">
          <span class="bg-primary/20 text-primary p-2 rounded-lg text-sm">
            <font-awesome-icon icon="fa-solid fa-upload" />
          </span>
          Formulir Import
        </h3>

        <PickingUploadForm @upload-complete="handleUploadComplete" />
      </div>
    </div>

    <div
      class="xl:col-span-2 bg-secondary/30 border border-secondary/20 rounded-2xl overflow-hidden flex flex-col h-[600px] shadow-sm"
    >
      <div
        class="p-5 border-b border-secondary/20 bg-secondary/5 flex justify-between items-center backdrop-blur-sm"
      >
        <h3 class="font-bold flex items-center gap-2">
          <font-awesome-icon icon="fa-solid fa-clock-rotate-left" class="text-text/40" />
          Riwayat Proses
        </h3>
        <font-awesome-icon
          v-if="isHistoryLoading"
          icon="fa-solid fa-circle-notch"
          class="animate-spin text-primary"
        />
      </div>
      <div class="flex-1 overflow-y-auto custom-scrollbar">
        <table class="w-full text-left border-collapse">
          <thead
            class="bg-secondary/20 text-xs uppercase text-text/50 font-bold sticky top-0 backdrop-blur-md z-10"
          >
            <tr>
              <th class="p-4 font-bold tracking-wider">Waktu</th>
              <th class="p-4 font-bold tracking-wider">File</th>
              <th class="p-4 font-bold tracking-wider text-right">Status</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-secondary/10 text-sm">
            <tr v-if="importJobHistory.length === 0 && !isHistoryLoading">
              <td colspan="3" class="p-8 text-center text-text/40 italic">Belum ada riwayat.</td>
            </tr>
            <tr
              v-for="job in importJobHistory"
              :key="job.id"
              class="hover:bg-secondary/10 transition-colors"
            >
              <td class="p-4 whitespace-nowrap text-text/70 font-mono text-xs">
                {{
                  new Date(job.created_at).toLocaleString('id-ID', {
                    day: 'numeric',
                    month: 'short',
                    hour: '2-digit',
                    minute: '2-digit',
                  })
                }}
              </td>
              <td class="p-4">
                <div class="font-bold text-text">{{ job.original_filename }}</div>
                <div class="text-xs text-text/40 mt-1 italic max-w-[200px] truncate">
                  {{ job.notes || '-' }}
                </div>
              </td>
              <td class="p-4 text-right">
                <div class="flex items-center justify-end gap-2">
                  <span
                    v-if="job.status === 'COMPLETED'"
                    class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-success/10 text-success border border-success/20"
                  >
                    <font-awesome-icon icon="fa-solid fa-check" /> Selesai
                  </span>
                  <span
                    v-else-if="job.status === 'FAILED' || job.status === 'COMPLETED_WITH_ERRORS'"
                    @click="$emit('view-errors', job)"
                    class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-danger/10 text-danger border border-danger/20 cursor-pointer hover:bg-danger/20 transition-colors"
                  >
                    <font-awesome-icon icon="fa-solid fa-triangle-exclamation" />
                    {{ job.status === 'FAILED' ? 'Gagal' : 'Ada Masalah' }}
                  </span>
                  <span
                    v-else-if="job.status === 'CANCELLED'"
                    class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-secondary/20 text-text/60 border border-secondary/30"
                  >
                    <font-awesome-icon icon="fa-solid fa-ban" /> Dibatalkan
                  </span>
                  <span
                    v-else
                    class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-primary/10 text-primary border border-primary/20 animate-pulse"
                  >
                    <font-awesome-icon icon="fa-solid fa-circle-notch" class="animate-spin" />
                    Proses
                  </span>
                  <button
                    v-if="job.status === 'PENDING'"
                    @click="handleCancelJob(job)"
                    class="ml-2 text-text/40 hover:text-danger transition-colors p-1.5 rounded-lg hover:bg-danger/10"
                  >
                    <font-awesome-icon icon="fa-solid fa-xmark" />
                  </button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>
