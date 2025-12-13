<!-- frontend\src\components\picking\PickingUploadForm.vue -->
<script setup>
import { ref, computed } from 'vue'
import Tabs from '@/components/ui/Tabs.vue'
import { useToast } from '@/composables/useToast.js'
import axios from '@/api/axios.js'

const emit = defineEmits(['upload-complete'])
const { show: showToast } = useToast()

const selectedFiles = ref([]) // [UPDATE] Array, bukan single object
const selectedSource = ref('Tokopedia')
const isLoading = ref(false)
const loadingMessage = ref('')

const tabs = [
  { label: 'Tokopedia', value: 'Tokopedia' },
  { label: 'Offline (Tagihan)', value: 'Offline' },
  { label: 'Shopee', value: 'Shopee' },
]

const fileAcceptString = computed(() => {
  if (selectedSource.value === 'Shopee') return '.xlsx, .xls'
  return '.csv, .xlsx, .xls'
})

// [UPDATE] Handle Multiple Files
function handleFileChange(event) {
  // Convert FileList ke Array biasa
  selectedFiles.value = Array.from(event.target.files)
}

function resetFileInput() {
  selectedFiles.value = []
  const input = document.getElementById('pickingListFileInput')
  if (input) input.value = ''
}

async function triggerUpload() {
  if (selectedFiles.value.length === 0) {
    showToast('Silakan pilih minimal satu file.', 'warning')
    return
  }

  // Validasi Ekstensi (Looping)
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
  }

  isLoading.value = true
  loadingMessage.value = `Mengunggah ${selectedFiles.value.length} file...`

  try {
    const formData = new FormData()
    // [UPDATE] Append 'files' (sesuai backend .array('files'))
    selectedFiles.value.forEach((file) => {
      formData.append('files', file)
    })
    formData.append('source', selectedSource.value)

    const response = await axios.post('/picking/upload-and-validate', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 120000, // 2 menit timeout karena multiple files
    })

    const result = response.data
    if (result.success) {
      showToast(result.message, 'success')
      // Kirim hasil ke parent
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
  <div class="space-y-4 max-w-lg mx-auto">
    <div>
      <label class="block text-sm font-medium text-text/90 mb-2">Pilih Sumber Pesanan</label>
      <Tabs :tabs="tabs" v-model:model-value="selectedSource" />
    </div>

    <div>
      <label for="pickingListFileInput" class="block text-sm font-medium text-text/90 mb-2">
        Pilih Laporan ({{ fileAcceptString }})
      </label>

      <div class="relative group">
        <input
          type="file"
          id="pickingListFileInput"
          @change="handleFileChange"
          :accept="fileAcceptString"
          multiple
          class="block w-full text-sm text-text/80 file:mr-4 file:py-3 file:px-4 file:rounded-xl file:border-0 file:text-sm file:font-bold file:bg-primary/10 file:text-primary hover:file:bg-primary/20 cursor-pointer border border-dashed border-secondary/40 rounded-xl p-2 focus:outline-none focus:border-primary transition-all"
        />
      </div>

      <div class="mt-2 text-xs text-text/50 flex justify-between items-center">
        <span v-if="selectedFiles.length > 0" class="text-primary font-medium text-right">
          <font-awesome-icon icon="fa-solid fa-copy" class="mr-1" />
          {{ selectedFiles.length }} file dipilih
        </span>
        <span v-else class="italic text-primary font-medium text-right">Max 20 files</span>
      </div>

      <div
        v-if="selectedFiles.length > 0"
        class="mt-2 max-h-20 overflow-y-auto border border-secondary/10 rounded p-1 bg-secondary/5"
      >
        <p v-for="(f, i) in selectedFiles" :key="i" class="text-[10px] text-text/60 truncate">
          {{ i + 1 }}. {{ f.name }}
        </p>
      </div>
    </div>

    <div class="pt-2">
      <button
        @click="triggerUpload"
        :disabled="isLoading || selectedFiles.length === 0"
        class="w-full px-6 py-3 bg-primary text-white rounded-xl font-bold shadow-lg shadow-primary/20 hover:shadow-primary/40 hover:-translate-y-0.5 disabled:opacity-50 disabled:shadow-none disabled:translate-y-0 disabled:cursor-not-allowed transition-all duration-200 flex items-center justify-center gap-2"
      >
        <font-awesome-icon v-if="isLoading" icon="fa-solid fa-circle-notch" class="animate-spin" />
        <span>{{
          isLoading
            ? loadingMessage
            : `Proses ${selectedFiles.length > 0 ? selectedFiles.length + ' File' : ''}`
        }}</span>
      </button>
    </div>
  </div>
</template>
