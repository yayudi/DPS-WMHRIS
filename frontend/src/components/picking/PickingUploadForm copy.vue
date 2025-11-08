<!-- frontend\src\components\picking\PickingUploadForm.vue -->
<script setup>
import { ref } from 'vue'
import Tabs from '@/components/Tabs.vue' // Asumsi Tabs ada di level atas

// Props untuk menerima status loading dari parent
defineProps({
  isLoading: {
    type: Boolean,
    default: false,
  },
  loadingMessage: {
    type: String,
    default: 'Memproses...',
  },
})

// Emit event saat tombol upload diklik
const emit = defineEmits(['upload-triggered'])

// State internal komponen
const selectedFile = ref(null)
const selectedSource = ref('Tokopedia') // Default source

function handleFileChange(event) {
  selectedFile.value = event.target.files[0]
}

function triggerUpload() {
  // Emit file dan source ke parent
  emit('upload-triggered', { file: selectedFile.value, source: selectedSource.value })
}
</script>

<template>
  <div class="space-y-4 max-w-lg mx-auto">
    <div>
      <label class="block text-sm font-medium text-text/90 mb-2">Pilih Sumber</label>
      <Tabs
        :tabs="[
          { label: 'Tokopedia', value: 'Tokopedia' },
          { label: 'Shopee', value: 'Shopee' },
          { label: 'Offline', value: 'Offline' },
        ]"
        v-model:model-value="selectedSource"
      />
    </div>
    <div>
      <label for="pickingListFileInput" class="block text-sm font-medium text-text/90 mb-2"
        >Pilih File (PDF atau Teks)</label
      >
      <!-- Beri ID unik ke input file -->
      <input
        type="file"
        id="pickingListFileInput"
        @change="handleFileChange"
        accept=".pdf,.txt,.csv"
        class="block w-full text-sm text-text/80 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-primary/10 file:text-primary hover:file:bg-primary/20 cursor-pointer border border-secondary/30 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary"
      />
      <p v-if="selectedFile" class="text-xs text-text/60 mt-1">
        File dipilih: {{ selectedFile.name }}
      </p>
    </div>
    <div class="pt-4">
      <button
        @click="triggerUpload"
        :disabled="isLoading || !selectedFile"
        class="w-full px-6 py-3 bg-primary text-white rounded-lg font-bold disabled:opacity-50 flex items-center justify-center gap-2"
      >
        <font-awesome-icon v-if="isLoading" icon="fa-solid fa-spinner" class="animate-spin" />
        <span>{{ isLoading ? loadingMessage : 'Upload & Validasi' }}</span>
      </button>
      <!-- Pesan error parsing bisa ditampilkan di sini jika perlu, diterima via prop -->
      <!-- <p v-if="parsingError" class="text-xs text-accent mt-2 text-center">{{ parsingError }}</p> -->
    </div>
  </div>
</template>
