<script setup>
import { ref, computed } from 'vue'
import Tabs from '@/components/Tabs.vue'
import { useToast } from '@/composables/UseToast.js'

// Import helper API yang kita butuhkan
import {
  uploadBatchPickingListJson, // Untuk CSV baru
  validateParsedPickingList, // Untuk Tokopedia/Shopee PDF
  // uploadPickingList (legacy) sudah dihapus
} from '@/api/helpers/picking.js'

// Import kedua parser frontend
import { parseAndGroupCsv } from '@/services/pickingListParser.js' // Parser CSV
import { usePickingClientParser } from '@/composables/usePickingClientParser.js' // Parser PDF

const emit = defineEmits(['upload-complete'])
const { show: showToast } = useToast()

// Inisialisasi parser PDF
const pdfParser = usePickingClientParser()

// State internal
const selectedFile = ref(null)
// Default ke alur baru
const selectedSource = ref('Tagihan (CSV)')
const isLoading = ref(false)
const loadingMessage = ref('')

// ✅ Tab yang sudah bersih (tanpa 'Offline (TXT)' legacy)
const tabs = [
  { label: 'Tagihan (CSV)', value: 'Tagihan (CSV)' }, // Ini adalah "Offline" yang baru
  { label: 'Tokopedia (PDF)', value: 'Tokopedia' },
  { label: 'Shopee (PDF)', value: 'Shopee' },
]

// Helper untuk reset file input
function resetFileInput() {
  selectedFile.value = null
  const fileInput = document.getElementById('pickingListFileInput')
  if (fileInput) {
    fileInput.value = ''
  }
}

function handleFileChange(event) {
  selectedFile.value = event.target.files[0]
}

/**
 * Fungsi utama yang menangani semua logika upload
 */
async function triggerUpload() {
  if (!selectedFile.value) {
    showToast('Silakan pilih file terlebih dahulu.', 'warning')
    return
  }

  isLoading.value = true
  loadingMessage.value = 'Mempersiapkan upload...'

  try {
    // --- ALUR 1: Tagihan (CSV) ---
    if (selectedSource.value === 'Tagihan (CSV)') {
      if (!selectedFile.value.name.toLowerCase().endsWith('.csv')) {
        throw new Error("Untuk sumber 'Tagihan (CSV)', Anda harus meng-upload file .csv.")
      }
      loadingMessage.value = 'Mem-parsing CSV di browser...'
      const groupedData = await parseAndGroupCsv(selectedFile.value)

      loadingMessage.value = `Mengirim ${groupedData.length} invoice ke server...`
      // const result = await uploadBatchPickingListJson(groupedData) // API Hybrid

      // showToast(result.message, 'success')
      // emit('upload-complete') // Beri tahu parent (WMSPickingListView)
      const response = await uploadBatchPickingListJson(groupedData) // API Hybrid

      // [PERBAIKAN] Samakan logikanya dengan alur PDF
      if (response.success) {
        showToast(`Validasi CSV selesai. ${response.data.validItems.length} item valid.`, 'success')
        // Kirim data validasi ke parent (WMSPickingListView)
        emit('upload-complete', response.data)
      } else {
        throw new Error(response.message || 'Validasi CSV di server gagal.')
      }
    }
    // --- ALUR 2: Tokopedia / Shopee (PDF) ---
    else if (selectedSource.value === 'Tokopedia' || selectedSource.value === 'Shopee') {
      if (!selectedFile.value.name.toLowerCase().endsWith('.pdf')) {
        throw new Error(`Untuk sumber '${selectedSource.value}', Anda harus meng-upload file .pdf.`)
      }

      loadingMessage.value = 'Mem-parsing PDF di browser...'
      const parsedItems = await pdfParser.parseFile(selectedFile.value, selectedSource.value)

      if (!parsedItems || parsedItems.length === 0) {
        throw new Error(
          pdfParser.parsingError.value || 'Gagal mem-parsing PDF. Tidak ada item ditemukan.',
        )
      }

      loadingMessage.value = 'Mengirim data PDF ke server...'
      const payload = {
        source: selectedSource.value,
        items: parsedItems,
        filename: selectedFile.value.name,
      }
      const response = await validateParsedPickingList(payload) // API Validasi

      if (response.success) {
        showToast(`Validasi PDF selesai. ${response.data.validItems.length} item valid.`, 'success')
        // ✅ Kirim data validasi ke parent (WMSPickingListView)
        // Parent akan menangani `validationResults.value = response.data`
        emit('upload-complete', response.data)
      } else {
        throw new Error(response.message || 'Validasi PDF di server gagal.')
      }
    } else {
      throw new Error('Sumber upload tidak dikenal.')
    }

    resetFileInput() // Bersihkan input file setelah sukses
  } catch (error) {
    console.error('Gagal memproses upload:', error)
    const parserError = pdfParser.parsingError.value
    showToast(parserError || error.message || 'Terjadi kesalahan.', 'error')
  } finally {
    isLoading.value = false
    loadingMessage.value = ''
    if (pdfParser.parsingError.value) {
      pdfParser.parsingError.value = null
    }
  }
}

// Komputasi untuk accept string berdasarkan source
const fileAcceptString = computed(() => {
  if (selectedSource.value === 'Tagihan (CSV)') return '.csv'
  if (selectedSource.value === 'Tokopedia' || selectedSource.value === 'Shopee') return '.pdf'
  return '.csv,.pdf'
})
</script>

<template>
  <div class="space-y-4 max-w-lg mx-auto">
    <div>
      <label class="block text-sm font-medium text-text/90 mb-2">Pilih Sumber</label>
      <Tabs :tabs="tabs" v-model:model-value="selectedSource" />
    </div>

    <div>
      <label for="pickingListFileInput" class="block text-sm font-medium text-text/90 mb-2"
        >Pilih File ({{ fileAcceptString }})</label
      >
      <input
        type="file"
        id="pickingListFileInput"
        @change="handleFileChange"
        :accept="fileAcceptString"
        class="block w-full text-sm text-text/80 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-primary/10 file:text-primary hover:file:bg-primary/20 cursor-pointer border border-secondary/30 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary"
      />
      <p v-if="selectedFile" class="text-xs text-text/60 mt-1">
        File dipilih: {{ selectedFile.name }}
      </p>
    </div>

    <div class="pt-4">
      <button
        @click="triggerUpload"
        :disabled="isLoading || !selectedFile || pdfParser.isParsing.value"
        class="w-full px-6 py-3 bg-primary text-white rounded-lg font-bold disabled:opacity-50 flex items-center justify-center gap-2"
      >
        <font-awesome-icon
          v-if="isLoading || pdfParser.isParsing.value"
          icon="fa-solid fa-spinner"
          class="animate-spin"
        />
        <span>{{
          isLoading
            ? loadingMessage
            : pdfParser.isParsing.value
              ? pdfParser.parsingMessage.value || 'Mem-parsing...'
              : 'Upload & Proses'
        }}</span>
      </button>
    </div>
  </div>
</template>
