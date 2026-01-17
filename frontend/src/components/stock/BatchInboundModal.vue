<template>
  <div v-if="isOpen" class="fixed inset-0 z-50 flex items-center justify-center p-4">
    <!-- Backdrop -->
    <div class="absolute inset-0 bg-black/50 backdrop-blur-sm transition-opacity" @click="close"></div>

    <!-- Modal Content -->
    <div
      class="bg-background rounded-2xl shadow-xl w-full max-w-lg overflow-hidden transform transition-all relative z-10 flex flex-col max-h-[90vh] border border-secondary/20">
      <!-- Header -->
      <div class="px-6 py-4 border-b border-secondary/20 flex flex-col gap-4 bg-secondary/5">
        <div class="flex justify-between items-center">
          <div>
            <h3 class="font-bold text-lg text-text">Batch Stock Inbound</h3>
            <p class="text-xs text-text/60 mt-0.5">Input stok masuk massal via Excel</p>
          </div>
          <button @click="close"
            class="text-text/40 hover:text-text/80 transition-colors w-8 h-8 flex items-center justify-center rounded-full hover:bg-secondary/10">
            <font-awesome-icon icon="fa-solid fa-times" />
          </button>
        </div>

        <!-- TABS -->
        <div class="flex items-center gap-1 bg-secondary/10 p-1 rounded-lg">
          <button @click="activeTab = 'input'" class="flex-1 px-3 py-1.5 rounded-md text-xs font-bold transition-all"
            :class="activeTab === 'input' ? 'bg-background shadow-sm text-primary' : 'text-text/60 hover:text-text hover:bg-secondary/10'">
            Input Baru
          </button>
          <button @click="activeTab = 'history'" class="flex-1 px-3 py-1.5 rounded-md text-xs font-bold transition-all"
            :class="activeTab === 'history' ? 'bg-background shadow-sm text-primary' : 'text-text/60 hover:text-text hover:bg-secondary/10'">
            Riwayat Upload
          </button>
        </div>
      </div>

      <!-- Body -->
      <div class="p-6 overflow-y-auto space-y-6 flex-1 relative">
        <transition name="fade" mode="out-in">
          <!-- TAB: INPUT -->
          <div v-if="activeTab === 'input'" key="input" class="space-y-6">
            <!-- Step 1: Download Template -->
            <div class="bg-primary/5 border border-primary/20 rounded-xl p-4">
              <div class="flex items-start gap-3">
                <div
                  class="bg-primary/10 text-primary w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5">
                  <span class="font-bold text-sm">1</span>
                </div>
                <div class="flex-1">
                  <h4 class="font-semibold text-text text-sm">Download Template</h4>
                  <p class="text-xs text-text/60 mt-1 mb-3 leading-relaxed">
                    Unduh template Excel terbaru. Pastikan SKU dan Lokasi sesuai dengan data di sistem.
                  </p>
                  <button @click="downloadTemplate" :disabled="isDownloading"
                    class="text-xs font-semibold bg-background border border-primary/30 text-primary px-3 py-2 rounded-lg hover:bg-primary/5 hover:border-primary/50 transition-all flex items-center gap-2 shadow-sm">
                    <font-awesome-icon v-if="isDownloading" icon="fa-solid fa-circle-notch" spin />
                    <font-awesome-icon v-else icon="fa-solid fa-download" />
                    <span>Unduh Template Inbound</span>
                  </button>
                </div>
              </div>
            </div>

            <!-- Step 2: Upload File -->
            <div class="bg-secondary/5 border border-secondary/20 rounded-xl p-4">
              <div class="flex items-start gap-3">
                <div
                  class="bg-secondary/20 text-text/70 w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5">
                  <span class="font-bold text-sm">2</span>
                </div>
                <div class="w-full">
                  <h4 class="font-semibold text-text text-sm">Upload File Excel</h4>
                  <p class="text-xs text-text/60 mt-1 mb-3">
                    Upload file yang sudah diisi. Maksimal 10MB.
                  </p>

                  <!-- Dropzone -->
                  <div @dragover.prevent="isDragging = true" @dragleave.prevent="isDragging = false"
                    @drop.prevent="handleDrop"
                    class="border-2 border-dashed rounded-xl p-6 text-center transition-all cursor-pointer relative group bg-background"
                    :class="[
                      isDragging ? 'border-primary bg-primary/5' : 'border-secondary/30 hover:border-primary/50 hover:bg-secondary/5',
                      file ? 'border-success bg-success/5' : ''
                    ]" @click="$refs.fileInput.click()">
                    <input type="file" ref="fileInput" class="hidden" accept=".xlsx" @change="handleFileSelect" />

                    <div v-if="file" class="py-2">
                      <div
                        class="w-12 h-12 bg-success/10 text-success rounded-full flex items-center justify-center mx-auto mb-2">
                        <font-awesome-icon icon="fa-solid fa-file-excel" size="lg" />
                      </div>
                      <p class="text-sm font-medium text-text break-all">{{ file.name }}</p>
                      <p class="text-xs text-text/40 mt-1">{{ formatFileSize(file.size) }}</p>
                      <button @click.stop="file = null" class="text-xs text-danger hover:underline mt-2">Hapus
                        File</button>
                    </div>

                    <div v-else class="py-4 space-y-2 pointer-events-none">
                      <div
                        class="w-12 h-12 bg-secondary/10 text-text/40 group-hover:bg-primary/10 group-hover:text-primary rounded-full flex items-center justify-center mx-auto transition-colors">
                        <font-awesome-icon icon="fa-solid fa-cloud-upload-alt" size="lg" />
                      </div>
                      <p class="text-sm text-text/60 font-medium">
                        <span class="text-primary">Klik upload</span> atau drag & drop
                      </p>
                      <p class="text-[10px] text-text/40 uppercase">XLSX ONLY</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- TAB: HISTORY -->
          <div v-else key="history" class="h-full flex flex-col">
            <ImportJobHistory :job-types="['IMPORT_STOCK_INBOUND']" />
          </div>
        </transition>
      </div>

      <!-- Footer -->
      <div class="px-6 py-4 border-t border-secondary/20 bg-secondary/5 flex justify-end gap-3"
        v-if="activeTab === 'input'">
        <button @click="close"
          class="px-4 py-2 text-sm font-semibold text-text/60 hover:bg-secondary/20 rounded-lg transition-colors">
          Batal
        </button>
        <button @click="uploadFile" :disabled="!file || isUploading"
          class="px-5 py-2 text-sm font-bold text-secondary bg-primary hover:bg-primary/90 rounded-lg shadow-lg shadow-primary/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2">
          <font-awesome-icon v-if="isUploading" icon="fa-solid fa-circle-notch" spin />
          <span>{{ isUploading ? 'Mengupload...' : 'Proses Inbound' }}</span>
        </button>
      </div>
      <!-- Footer History (Optional Close Button) -->
      <div class="px-6 py-4 border-t border-secondary/20 bg-secondary/5 flex justify-end gap-3"
        v-if="activeTab === 'history'">
        <button @click="close"
          class="px-4 py-2 text-sm font-semibold text-text hover:bg-secondary/20 rounded-lg transition-colors">
          Tutup
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { useToast } from '@/composables/useToast.js'
import axios from '@/api/axios.js'
import ImportJobHistory from '@/components/shared/ImportJobHistory.vue'

const props = defineProps({
  isOpen: Boolean
})

const emit = defineEmits(['close', 'success'])

const { show: showToast } = useToast()
const file = ref(null)
const isDragging = ref(false)
const isDownloading = ref(false)
const isUploading = ref(false)
const fileInput = ref(null)
const activeTab = ref('input') // 'input' | 'history'

const formatFileSize = (bytes) => {
  if (bytes === 0) return '0 Bytes'
  const k = 1024
  const sizes = ['Bytes', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

const close = () => {
  file.value = null
  activeTab.value = 'input'
  emit('close')
}

const downloadTemplate = async () => {
  try {
    isDownloading.value = true
    const response = await axios.get('/stock/template/inbound', {
      responseType: 'blob'
    })

    // Create download link
    const url = window.URL.createObjectURL(new Blob([response.data]))
    const link = document.createElement('a')
    link.href = url
    link.setAttribute('download', 'Template_Inbound_Stok.xlsx')
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)

    showToast('Template berhasil diunduh', 'success')
  } catch (error) {
    console.error('Download error:', error)
    showToast('Gagal mengunduh template', 'error')
  } finally {
    isDownloading.value = false
  }
}

const handleFileSelect = (event) => {
  const selectedFile = event.target.files[0]
  validateAndSetFile(selectedFile)
}

const handleDrop = (event) => {
  isDragging.value = false
  const droppedFile = event.dataTransfer.files[0]
  validateAndSetFile(droppedFile)
}

const validateAndSetFile = (selectedFile) => {
  if (!selectedFile) return

  const isExcel = selectedFile.type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
    selectedFile.name.endsWith('.xlsx')

  if (!isExcel) {
    showToast('Hanya file Excel (.xlsx) yang diperbolehkan', 'error')
    return
  }

  if (selectedFile.size > 10 * 1024 * 1024) {
    showToast('Ukuran file maksimal 10MB', 'error')
    return
  }

  file.value = selectedFile
}

const uploadFile = async () => {
  if (!file.value) return

  try {
    isUploading.value = true
    const formData = new FormData()
    formData.append('file', file.value)

    const response = await axios.post('/stock/import-batch', formData, {
      headers: {
        'Content-Type': 'multipart/form-data'
      }
    })

    if (response.data.success) {
      showToast(response.data.message, 'success')
      emit('success')
      activeTab.value = 'history' // Switch to history tab on success
      file.value = null // Clear file
    }
  } catch (error) {
    console.error('Upload Error:', error)
    showToast(error.response?.data?.message || 'Gagal mengupload file', 'error')
  } finally {
    isUploading.value = false
  }
}
</script>
