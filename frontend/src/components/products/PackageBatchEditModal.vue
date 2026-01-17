<script setup>
import { ref } from 'vue'
import ImportJobHistory from '@/components/shared/ImportJobHistory.vue'

const props = defineProps({
  isOpen: Boolean,
  isExporting: Boolean,
  isImporting: Boolean,
})

const emit = defineEmits(['close', 'export', 'import'])

// Tabs
const activeTab = ref('export') // 'export' | 'import'
const exportFormat = ref('xlsx')
const fileInput = ref(null)
const selectedFile = ref(null)
const isDryRun = ref(false)

const handleExport = () => {
  emit('export', { format: exportFormat.value })
}

const handleFileSelect = (event) => {
  const file = event.target.files[0]
  if (file) selectedFile.value = file
}

const handleDrop = (event) => {
  const file = event.dataTransfer.files[0]
  if (file) selectedFile.value = file
}

const handleImport = () => {
  if (!selectedFile.value) return
  const formData = new FormData()
  formData.append('file', selectedFile.value)
  formData.append('dryRun', isDryRun.value)
  emit('import', formData)

  // Clear file input to prevent double upload
  selectedFile.value = null
  if (fileInput.value) fileInput.value.value = ''
}

const close = () => {
  emit('close')
  selectedFile.value = null
  activeTab.value = 'export'
}
</script>

<template>
  <div v-if="isOpen"
    class="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 backdrop-blur-sm">
    <div
      class="bg-[hsl(var(--color-background))] text-[hsl(var(--color-text))] rounded-xl shadow-2xl w-full max-w-2xl p-0 overflow-hidden border border-[hsl(var(--color-secondary))/0.3] flex flex-col md:flex-row h-[600px] md:h-[500px]">
      <!-- SIDEBAR -->
      <div
        class="w-full md:w-1/3 bg-[hsl(var(--color-secondary))/0.05] p-6 border-r border-[hsl(var(--color-secondary))/0.1]">
        <h3 class="text-xl font-bold mb-6 flex items-center gap-2">
          <font-awesome-icon icon="fa-solid fa-boxes-stacked" />
          Batch Edit Paket
        </h3>

        <div class="space-y-2">
          <button @click="activeTab = 'export'"
            class="w-full text-left px-4 py-3 rounded-lg font-medium transition-all flex items-center gap-3"
            :class="activeTab === 'export' ? 'bg-[hsl(var(--color-primary))/0.1] text-[hsl(var(--color-primary))] border border-[hsl(var(--color-primary))/0.2]' : 'hover:bg-[hsl(var(--color-secondary))/0.1] opacity-70'">
            <font-awesome-icon icon="fa-solid fa-download" />
            <span>1. Download Data</span>
          </button>

          <button @click="activeTab = 'import'"
            class="w-full text-left px-4 py-3 rounded-lg font-medium transition-all flex items-center gap-3"
            :class="activeTab === 'import' ? 'bg-[hsl(var(--color-primary))/0.1] text-[hsl(var(--color-primary))] border border-[hsl(var(--color-primary))/0.2]' : 'hover:bg-[hsl(var(--color-secondary))/0.1] opacity-70'">
            <font-awesome-icon icon="fa-solid fa-upload" />
            <span>2. Upload Revisi</span>
          </button>
          <button @click="activeTab = 'logs'"
            class="w-full text-left px-4 py-3 rounded-lg font-medium transition-all flex items-center gap-3"
            :class="activeTab === 'logs' ? 'bg-[hsl(var(--color-primary))/0.1] text-[hsl(var(--color-primary))] border border-[hsl(var(--color-primary))/0.2]' : 'hover:bg-[hsl(var(--color-secondary))/0.1] opacity-70'">
            <font-awesome-icon icon="fa-solid fa-history" />
            <span>3. Riwayat & Log</span>
          </button>
        </div>

        <div class="mt-8 text-xs opacity-60 leading-relaxed">
          <div v-if="activeTab === 'export'">
            <p class="font-bold mb-1">Struktur CSV/Excel:</p>
            <ul class="list-disc list-inside space-y-1">
              <li>SKU, Name, Price (Standard)</li>
              <li><strong>Component_N</strong>: SKU Komponen</li>
              <li><strong>Qty_N</strong>: Jumlah Komponen</li>
            </ul>
          </div>
          <div v-else-if="activeTab === 'import'">
            <p class="font-bold mb-1">Step 2:</p>
            Upload file yang sudah diedit untuk mengupdate komposisi paket.
          </div>
          <div v-else>
            <p class="font-bold mb-1">Step 3:</p>
            Pantau status upload dan error log jika ada masalah pada baris tertentu.
          </div>
        </div>
      </div>

      <!-- MAIN CONTENT -->
      <div class="w-full md:w-2/3 p-6 relative flex flex-col">
        <button @click="close"
          class="absolute top-4 right-4 text-[hsl(var(--color-text))] opacity-30 hover:opacity-100 text-2xl leading-none z-10">
          &times;
        </button>

        <!-- STEP 1: EXPORT -->
        <div v-if="activeTab === 'export'" class="flex-1 flex flex-col">
          <h4 class="text-lg font-bold mb-1">Download Data Paket</h4>
          <p class="text-sm opacity-60 mb-6">Pilih format file.</p>

          <div class="grid grid-cols-2 gap-4 mb-6">
            <label
              class="flex items-center gap-3 p-4 border rounded-xl cursor-pointer transition-all hover:bg-[hsl(var(--color-secondary))/0.1]"
              :class="exportFormat === 'xlsx' ? 'border-[hsl(var(--color-success))] bg-[hsl(var(--color-success))/0.05]' : 'border-[hsl(var(--color-secondary))/0.3]'">
              <input type="radio" v-model="exportFormat" value="xlsx" class="hidden" />
              <font-awesome-icon icon="fa-solid fa-file-excel" class="text-2xl text-[hsl(var(--color-success))]" />
              <div>
                <div class="font-bold">Excel (.xlsx)</div>
                <div class="text-xs opacity-60">Komponen Kolom</div>
              </div>
            </label>

            <!-- CSV Option (Disabled for Package to avoid complexity if wanted, but Plan said support both. Let's support both) -->
            <label
              class="flex items-center gap-3 p-4 border rounded-xl cursor-pointer transition-all hover:bg-[hsl(var(--color-secondary))/0.1]"
              :class="exportFormat === 'csv' ? 'border-[hsl(var(--color-primary))] bg-[hsl(var(--color-primary))/0.05]' : 'border-[hsl(var(--color-secondary))/0.3]'">
              <input type="radio" v-model="exportFormat" value="csv" class="hidden" />
              <font-awesome-icon icon="fa-solid fa-file-csv" class="text-2xl text-[hsl(var(--color-primary))]" />
              <div>
                <div class="font-bold">CSV (.csv)</div>
                <div class="text-xs opacity-60">Standard</div>
              </div>
            </label>
          </div>

          <div class="mt-auto">
            <button @click="handleExport" :disabled="isExporting"
              class="w-full px-5 py-3 bg-[hsl(var(--color-secondary))] text-[hsl(var(--color-text))] rounded-xl font-bold hover:bg-[hsl(var(--color-secondary))/0.8] disabled:opacity-50 disabled:cursor-not-allowed transition-all flex justify-center items-center gap-2 border border-[hsl(var(--color-secondary))/0.4]">
              <font-awesome-icon v-if="isExporting" icon="fa-solid fa-spinner" spin />
              <span>{{ isExporting ? 'Sedang Memproses...' : 'Download File Ekspor' }}</span>
            </button>
            <p class="text-xs text-center mt-3 opacity-50">Sistem akan otomatis meratakan (flatten) komponen paket ke
              dalam kolom.</p>
          </div>
        </div>

        <!-- STEP 2: IMPORT -->
        <div v-if="activeTab === 'import'" class="flex-1 flex flex-col">
          <h4 class="text-lg font-bold mb-1">Upload Revisi Paket</h4>
          <p class="text-sm opacity-60 mb-6">Upload file untuk mengupdate komposisi paket.</p>

          <div
            class="flex-1 border-2 border-dashed border-[hsl(var(--color-secondary))] rounded-xl flex flex-col items-center justify-center p-6 text-center cursor-pointer hover:border-[hsl(var(--color-primary))] hover:bg-[hsl(var(--color-primary))/0.05] transition-all group relative mb-4"
            @click="$refs.fileInput.click()" @dragover.prevent @drop.prevent="handleDrop">
            <input type="file" ref="fileInput" class="hidden" accept=".csv, .xlsx, .xls" @change="handleFileSelect" />

            <div v-if="selectedFile" class="z-10">
              <font-awesome-icon icon="fa-solid fa-file-circle-check"
                class="text-5xl mb-4 text-[hsl(var(--color-success))]" />
              <p class="font-bold text-lg max-w-[200px] truncate mx-auto">{{ selectedFile.name }}</p>
              <p class="text-sm opacity-60 mt-1">{{ (selectedFile.size / 1024).toFixed(1) }} KB</p>
              <div class="mt-4 px-3 py-1 bg-[hsl(var(--color-background))] rounded-full text-xs border inline-block">
                Klik untuk ganti</div>
            </div>

            <div v-else class="z-10">
              <font-awesome-icon icon="fa-solid fa-cloud-arrow-up"
                class="text-5xl mb-4 text-[hsl(var(--color-text))] opacity-20 group-hover:text-[hsl(var(--color-primary))] group-hover:opacity-100 transition-all" />
              <p class="font-medium">Klik atau Drag file ke sini</p>
            </div>
          </div>

          <!-- Dry Run Option -->
          <div
            class="flex items-center gap-3 p-2 mb-4 rounded-lg hover:bg-[hsl(var(--color-secondary))/0.05] transition-colors cursor-pointer"
            @click="isDryRun = !isDryRun">
            <div class="relative flex items-center">
              <input type="checkbox" v-model="isDryRun"
                class="peer h-5 w-5 cursor-pointer appearance-none rounded-md border border-[hsl(var(--color-secondary))] checked:bg-[hsl(var(--color-primary))] checked:border-transparent transition-all" />
              <font-awesome-icon icon="fa-solid fa-check"
                class="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-secondary opacity-0 peer-checked:opacity-100 text-xs pointer-events-none" />
            </div>
            <label class="text-sm cursor-pointer select-none flex-1">
              Test Import (Dry Run) <span class="opacity-50 ml-1">- Cek validitas komponen</span>
            </label>
          </div>

          <button @click="handleImport" :disabled="!selectedFile || isImporting"
            class="w-full px-5 py-3 bg-[hsl(var(--color-primary))] text-secondary rounded-xl font-bold hover:bg-[hsl(var(--color-primary))/0.9] disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-[hsl(var(--color-primary))/0.3] flex justify-center items-center gap-2 transition-all">
            <font-awesome-icon v-if="isImporting" icon="fa-solid fa-spinner" spin />
            <span>{{ isImporting ? 'Mengunggah...' : 'Update Paket' }}</span>
          </button>
        </div>

        <!-- STEP 3: LOGS -->
        <div v-if="activeTab === 'logs'" class="flex-1 flex flex-col h-full overflow-hidden">
          <ImportJobHistory :job-types="['IMPORT_PACKAGES']" />
        </div>

      </div>
    </div>
  </div>
</template>
