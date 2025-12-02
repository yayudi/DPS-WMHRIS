<!-- frontend\src\components\picking\PickingUploadTab.vue -->
<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import { useToast } from '@/composables/UseToast.js'
import { getImportJobs, cancelImportJob } from '@/api/helpers/stock.js'
import { uploadSalesReport } from '@/api/helpers/picking.js'

const { show } = useToast()
const emit = defineEmits(['view-errors'])

// State
const uploadSource = ref('Tokopedia')
const uploadNotes = ref('')
const selectedFiles = ref([])
const isUploading = ref(false)
const uploadProgress = ref({ current: 0, total: 0, success: 0, fail: 0 })
const uploadInputKey = ref(0)
const importJobHistory = ref([])
const isHistoryLoading = ref(false)

// Polling
let pollingInterval = null

function startPolling() {
  if (pollingInterval) clearInterval(pollingInterval)
  pollingInterval = setInterval(fetchJobHistory, 3000)
}

function stopPolling() {
  if (pollingInterval) clearInterval(pollingInterval)
}

// Actions
async function fetchJobHistory() {
  // Kita tidak set isHistoryLoading true disini agar polling tidak bikin UI kedip
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

function handleFileSelect(e) {
  const files = Array.from(e.target.files)
  const validFiles = files.filter((f) =>
    ['csv', 'xlsx'].includes(f.name.split('.').pop().toLowerCase()),
  )
  if (validFiles.length !== files.length)
    show('Beberapa file formatnya salah dan diabaikan.', 'warning')

  const currentFiles = [...selectedFiles.value]
  validFiles.forEach((newFile) => {
    if (!currentFiles.some((f) => f.name === newFile.name)) currentFiles.push(newFile)
  })
  selectedFiles.value = currentFiles
  e.target.value = ''
}

function removeFile(index) {
  selectedFiles.value.splice(index, 1)
}

async function handleUpload() {
  if (selectedFiles.value.length === 0) return show('Pilih minimal satu file.', 'warning')
  isUploading.value = true
  uploadProgress.value = { current: 0, total: selectedFiles.value.length, success: 0, fail: 0 }

  for (const [index, file] of selectedFiles.value.entries()) {
    uploadProgress.value.current = index + 1
    try {
      const fileNote = uploadNotes.value
        ? `${uploadNotes.value} [File: ${file.name}]`
        : `Batch Upload [File: ${file.name}]`
      await uploadSalesReport(file, uploadSource.value, fileNote)
      uploadProgress.value.success++
    } catch (error) {
      console.error(`Gagal upload ${file.name}`, error)
      uploadProgress.value.fail++
    }
  }

  if (uploadProgress.value.fail === 0) {
    show(`Berhasil mengunggah ${uploadProgress.value.success} file!`, 'success')
    selectedFiles.value = []
    uploadNotes.value = ''
  } else {
    show(
      `Selesai. ${uploadProgress.value.success} Sukses, ${uploadProgress.value.fail} Gagal.`,
      'warning',
    )
    selectedFiles.value = []
  }
  isUploading.value = false
  uploadInputKey.value++
  fetchJobHistory()
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
    <!-- Upload Form -->
    <div class="xl:col-span-1 space-y-6">
      <div class="bg-secondary/30 border border-secondary/20 rounded-2xl p-6 shadow-sm">
        <h3 class="text-lg font-bold mb-6 flex items-center gap-2">
          <span class="bg-primary/20 text-primary p-2 rounded-lg text-sm"
            ><font-awesome-icon icon="fa-solid fa-upload"
          /></span>
          Formulir Import
        </h3>
        <div class="space-y-5">
          <!-- Source Select -->
          <div class="space-y-1">
            <label class="text-xs font-bold uppercase text-text/50 ml-1">Marketplace</label>
            <div class="relative">
              <select
                v-model="uploadSource"
                class="w-full appearance-none bg-background border border-secondary/30 text-text rounded-xl px-4 py-3 focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all"
              >
                <option value="Tokopedia">Tokopedia</option>
                <option value="Shopee">Shopee</option>
                <option value="Offline">Offline</option>
              </select>
              <font-awesome-icon
                icon="fa-solid fa-chevron-down"
                class="absolute right-4 top-3.5 text-text/40 pointer-events-none text-xs"
              />
            </div>
          </div>
          <!-- Notes Input -->
          <div class="space-y-1">
            <label class="text-xs font-bold uppercase text-text/50 ml-1"
              >Label Batch (Opsional)</label
            >
            <input
              type="text"
              v-model="uploadNotes"
              placeholder="Contoh: Sesi 1 Senin"
              class="w-full bg-background border border-secondary/30 text-text rounded-xl px-4 py-3 focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all placeholder-text/30"
            />
          </div>
          <!-- File Input -->
          <div class="relative group">
            <input
              type="file"
              multiple
              :key="uploadInputKey"
              @change="handleFileSelect"
              class="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
            />
            <div
              class="border-2 border-dashed border-secondary/30 rounded-xl p-6 text-center bg-background/30 group-hover:border-primary group-hover:bg-primary/5 transition-all duration-300"
            >
              <div
                class="bg-secondary/20 w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-3 text-text/50 group-hover:text-primary group-hover:scale-110 transition-all"
              >
                <font-awesome-icon icon="fa-solid fa-cloud-arrow-up" class="text-xl" />
              </div>
              <p class="font-bold text-sm">Klik untuk pilih banyak file</p>
              <p class="text-xs text-text/40 mt-1">.csv atau .xlsx</p>
            </div>
          </div>
          <!-- Selected Files List -->
          <div
            v-if="selectedFiles.length > 0"
            class="space-y-2 max-h-48 overflow-y-auto custom-scrollbar pr-2"
          >
            <div
              v-for="(file, index) in selectedFiles"
              :key="index"
              class="flex items-center justify-between bg-background border border-secondary/20 p-3 rounded-lg text-sm shadow-sm"
            >
              <div class="flex items-center gap-3 overflow-hidden">
                <font-awesome-icon icon="fa-solid fa-file-excel" class="text-success" /><span
                  class="truncate font-medium text-text/80"
                  >{{ file.name }}</span
                >
              </div>
              <button
                @click="removeFile(index)"
                class="text-text/40 hover:text-danger transition-colors p-1"
              >
                <font-awesome-icon icon="fa-solid fa-trash" />
              </button>
            </div>
          </div>
          <!-- Upload Button -->
          <button
            @click="handleUpload"
            :disabled="isUploading || selectedFiles.length === 0"
            class="w-full bg-primary hover:bg-primary/90 text-white font-bold py-3.5 rounded-xl shadow-lg shadow-primary/20 transition-all transform active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none flex justify-center items-center gap-2"
          >
            <font-awesome-icon v-if="isUploading" icon="fa-solid fa-spinner" class="animate-spin" />
            <span v-if="isUploading"
              >Mengunggah ({{ uploadProgress.current }}/{{ uploadProgress.total }})</span
            >
            <span v-else
              >Proses {{ selectedFiles.length > 0 ? selectedFiles.length : '' }} File</span
            >
          </button>
        </div>
      </div>
    </div>

    <!-- History Table -->
    <div
      class="xl:col-span-2 bg-secondary/30 border border-secondary/20 rounded-2xl overflow-hidden flex flex-col h-[600px] shadow-sm"
    >
      <div
        class="p-5 border-b border-secondary/20 bg-secondary/5 flex justify-between items-center backdrop-blur-sm"
      >
        <h3 class="font-bold flex items-center gap-2">
          <font-awesome-icon icon="fa-solid fa-clock-rotate-left" class="text-text/40" /> Riwayat
          Proses
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
                  <!-- Statuses -->
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
                    title="Lihat Error"
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
                  <!-- Cancel Button -->
                  <button
                    v-if="job.status === 'PENDING'"
                    @click="handleCancelJob(job)"
                    class="ml-2 text-text/40 hover:text-danger transition-colors p-1.5 rounded-lg hover:bg-danger/10"
                    title="Batalkan"
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

<style scoped>
.custom-scrollbar::-webkit-scrollbar {
  width: 6px;
  height: 6px;
}
.custom-scrollbar::-webkit-scrollbar-track {
  background: hsl(var(--color-secondary) / 0.1);
}
.custom-scrollbar::-webkit-scrollbar-thumb {
  background: hsl(var(--color-secondary) / 0.3);
  border-radius: 10px;
}
.custom-scrollbar::-webkit-scrollbar-thumb:hover {
  background: hsl(var(--color-primary) / 0.5);
}
.animate-fade-in {
  animation: fadeIn 0.4s ease-out forwards;
}
@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
</style>
