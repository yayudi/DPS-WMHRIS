<!-- frontend\src\components\picking\PickingUploadForm.vue -->
<script setup>
import { ref, computed } from 'vue'
import Tabs from '@/components/ui/Tabs.vue'
import { useToast } from '@/composables/useToast.js'
import axios from '@/api/axios.js'

const emit = defineEmits(['upload-complete'])
const { show: showToast } = useToast()

const fileInputRef = ref(null)
const selectedFiles = ref([])
const selectedSource = ref('Tokopedia')
const isLoading = ref(false)
const loadingMessage = ref('')
const isDragging = ref(false)
const isDryRun = ref(false)

const tabs = [
  { label: 'Tokopedia', value: 'Tokopedia' },
  { label: 'Offline', value: 'Offline' },
  { label: 'Shopee', value: 'Shopee' },
]

const fileAcceptString = computed(() => {
  if (selectedSource.value === 'Shopee') return '.xlsx, .xls'
  return '.csv, .xlsx, .xls'
})

// --- FILE HANDLING ---

function triggerFileSelect() {
  fileInputRef.value?.click()
}

function handleFileChange(event) {
  addFiles(Array.from(event.target.files))
}

function onDrop(e) {
  isDragging.value = false
  addFiles(Array.from(e.dataTransfer.files))
}

function addFiles(files) {
  selectedFiles.value = files
}

function removeFile(index) {
  selectedFiles.value.splice(index, 1)
  if (selectedFiles.value.length === 0 && fileInputRef.value) {
    fileInputRef.value.value = ''
  }
}

function resetFileInput() {
  selectedFiles.value = []
  if (fileInputRef.value) fileInputRef.value.value = ''
}

// --- UPLOAD LOGIC ---

async function triggerUpload() {
  if (selectedFiles.value.length === 0) {
    showToast('Silakan pilih minimal satu file.', 'warning')
    return
  }

  // Validasi Dasar
  const MAX_SIZE_MB = 10
  for (const file of selectedFiles.value) {
    const fileName = file.name.toLowerCase()
    const isCsv = fileName.endsWith('.csv')
    const isExcel = fileName.endsWith('.xlsx') || fileName.endsWith('.xls')

    if (selectedSource.value === 'Shopee' && !isExcel) {
      showToast(`File ${file.name} salah format. Shopee hanya menerima Excel.`, 'error')
      return
    }
    if (!isCsv && !isExcel) {
      showToast(`File ${file.name} format tidak didukung.`, 'error')
      return
    }

    // Validasi Ukuran
    if (file.size > MAX_SIZE_MB * 1024 * 1024) {
      showToast(`File ${file.name} terlalu besar (Max ${MAX_SIZE_MB}MB).`, 'error')
      return
    }
  }

  isLoading.value = true
  const actionText = isDryRun.value ? 'Simulasi' : 'Mengunggah'
  loadingMessage.value = `${actionText} ${selectedFiles.value.length} file...`

  try {
    const formData = new FormData()
    // Append semua file ke key 'files' (array)
    selectedFiles.value.forEach((file) => {
      formData.append('files', file)
    })
    formData.append('source', selectedSource.value)

    // [NEW] Kirim flag dryRun ke backend
    if (isDryRun.value) {
      formData.append('dryRun', 'true')
    }

    const response = await axios.post('/picking/upload-and-validate', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 120000,
    })

    const result = response.data
    if (result.success) {
      const msg = isDryRun.value
        ? 'Simulasi selesai. Cek hasil validasi di riwayat.'
        : result.message || 'Berhasil masuk antrian'

      showToast(msg, 'success')
      emit('upload-complete', result.data)
      resetFileInput()
    } else {
      throw new Error(result.message)
    }
  } catch (error) {
    console.error('Upload Error:', error)
    const msg = error.response?.data?.message || error.message || 'Terjadi kesalahan saat upload.'
    showToast(msg, 'error')
  } finally {
    isLoading.value = false
    loadingMessage.value = ''
  }
}
</script>

<template>
  <div class="space-y-6">
    <!-- 1. Source Tabs -->
    <div>
      <label class="block text-[10px] font-bold uppercase text-text/40 mb-2 tracking-wider">Sumber Data</label>
      <Tabs :tabs="tabs" v-model:model-value="selectedSource" class="w-full" />
    </div>

    <!-- File Input Area -->
    <div>
      <label class="block text-[10px] font-bold uppercase text-text/40 mb-2 tracking-wider">
        File Import
      </label>

      <!-- Hidden Input -->
      <input ref="fileInputRef" type="file" class="hidden" @change="handleFileChange" :accept="fileAcceptString"
        multiple />

      <!-- Custom Dropzone -->
      <div @click="triggerFileSelect" @dragover.prevent="isDragging = true" @dragleave.prevent="isDragging = false"
        @drop.prevent="onDrop" :class="[
          'relative border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all duration-200 group',
          isDragging
            ? 'border-primary bg-primary/5 scale-[1.01]'
            : 'border-secondary/30 hover:border-primary/50 hover:bg-secondary/5 bg-background',
        ]">
        <div class="flex flex-col items-center justify-center gap-3 py-4">
          <!-- Icon berubah jika ada file -->
          <div class="w-12 h-12 rounded-full flex items-center justify-center transition-colors" :class="selectedFiles.length > 0
              ? 'bg-success/10 text-success'
              : 'bg-primary/10 text-primary group-hover:bg-primary/20'
            ">
            <font-awesome-icon :icon="selectedFiles.length > 0
                ? 'fa-solid fa-file-circle-check'
                : 'fa-solid fa-cloud-arrow-up'
              " class="text-xl" />
          </div>

          <div class="space-y-1">
            <p class="text-sm font-bold text-text/80">
              {{
                selectedFiles.length > 0
                  ? `${selectedFiles.length} File Dipilih`
                  : 'Klik atau Tarik File ke Sini'
              }}
            </p>
            <p class="text-xs text-text/40">Format: {{ fileAcceptString }}</p>
          </div>
        </div>
      </div>

      <!-- 3. File List Preview (Dismissible) -->
      <div v-if="selectedFiles.length > 0" class="mt-3 space-y-2 max-h-40 overflow-y-auto custom-scrollbar">
        <div v-for="(f, i) in selectedFiles" :key="i"
          class="flex items-center gap-3 p-2 bg-secondary/5 border border-secondary/10 rounded-lg text-xs group hover:bg-secondary/10 transition-colors">
          <font-awesome-icon :icon="f.name.endsWith('.csv') ? 'fa-solid fa-file-csv' : 'fa-solid fa-file-excel'"
            class="text-text/40 text-lg ml-1" />
          <div class="flex-1 min-w-0">
            <div class="font-semibold text-text/80 truncate">{{ f.name }}</div>
            <div class="text-[10px] text-text/40 font-mono">
              {{ (f.size / 1024).toFixed(0) }} KB
            </div>
          </div>
          <button @click.stop="removeFile(i)"
            class="p-1.5 hover:bg-danger/10 text-text/30 hover:text-danger rounded transition-colors"
            title="Hapus file">
            <font-awesome-icon icon="fa-solid fa-xmark" />
          </button>
        </div>
      </div>
    </div>

    <!-- 4. Options & Actions -->
    <div class="pt-2 space-y-4">
      <!-- [NEW] Dry Run Checkbox -->
      <div class="flex items-center gap-2 px-1" v-if="selectedFiles.length > 0">
        <div class="relative flex items-center">
          <input type="checkbox" id="dryRunCheck" v-model="isDryRun"
            class="peer h-4 w-4 cursor-pointer appearance-none rounded border border-secondary/40 checked:bg-primary checked:border-primary transition-all" />
          <font-awesome-icon icon="fa-solid fa-check"
            class="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-[10px] text-secondary opacity-0 peer-checked:opacity-100" />
        </div>
        <label for="dryRunCheck" class="text-xs text-text/70 cursor-pointer select-none font-medium">
          Mode Simulasi
          <span class="text-text/40 font-normal">(Cek validasi tanpa simpan data)</span>
        </label>
      </div>

      <button @click="triggerUpload" :disabled="isLoading || selectedFiles.length === 0" :class="[
        'w-full px-6 py-3.5 rounded-xl font-bold shadow-lg hover:-translate-y-0.5 active:translate-y-0 active:shadow-sm disabled:opacity-50 disabled:shadow-none disabled:translate-y-0 disabled:cursor-not-allowed transition-all duration-200 flex items-center justify-center gap-3',
        isDryRun
          ? 'bg-secondary text-text hover:bg-secondary/80 shadow-secondary/20'
          : 'bg-primary text-secondary hover:bg-primary/90 shadow-primary/20 hover:shadow-primary/40',
      ]">
        <font-awesome-icon v-if="isLoading" icon="fa-solid fa-circle-notch" class="animate-spin text-lg" />
        <span class="text-sm tracking-wide">{{
          isLoading
            ? loadingMessage
            : isDryRun
              ? 'CEK VALIDASI'
              : `MULAI IMPORT ${selectedFiles.length > 0 ? '(' + selectedFiles.length + ')' : ''}`
        }}</span>
      </button>
    </div>
  </div>
</template>
