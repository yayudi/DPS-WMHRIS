<!-- frontend/src/components/product/PriceUpdateModal.vue -->
<template>
  <!-- Menggunakan Base Modal Wrapper -->
  <div
    v-if="isOpen"
    class="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 backdrop-blur-sm"
  >
    <!--
      UPDATE: Background & Text menggunakan variabel tema.
      bg-[hsl(var(--color-background))] -> Mengambil warna background tema aktif
      text-[hsl(var(--color-text))] -> Mengambil warna teks tema aktif
    -->
    <div
      class="bg-[hsl(var(--color-background))] text-[hsl(var(--color-text))] rounded-xl shadow-2xl w-full max-w-md p-6 transform transition-all border border-[hsl(var(--color-secondary))/0.3]"
    >
      <!-- Header -->
      <div class="flex justify-between items-center mb-6">
        <h3 class="text-xl font-bold">Import Produk Massal</h3>
        <button
          @click="close"
          class="text-[hsl(var(--color-text))] opacity-50 hover:opacity-100 transition-opacity text-2xl leading-none"
        >
          &times;
        </button>
      </div>

      <!-- Body -->
      <div class="space-y-5">
        <!-- Info Box -->
        <div
          class="bg-[hsl(var(--color-primary))/0.1] text-[hsl(var(--color-primary))] p-4 rounded-lg text-sm border border-[hsl(var(--color-primary))/0.2]"
        >
          <p class="font-bold mb-2 flex items-center gap-2">
            <font-awesome-icon icon="fa-solid fa-file-csv" /> Format File
          </p>
          <ul class="list-disc list-inside opacity-90 space-y-1">
            <li>Gunakan file <b>CSV</b> atau <b>Excel (.xlsx)</b></li>
            <li>Kolom wajib: <code>sku</code>, <code>name</code></li>
            <li>
              Kolom opsional: <code>price</code>, <code>weight</code>, <code>is_package</code>,
              <code>is_active</code>
            </li>
            <li class="mt-1 text-xs opacity-80">
              *Jika SKU sudah ada, data produk akan di-update. Jika belum, akan dibuat produk baru.
            </li>
          </ul>
          <div class="mt-3 pt-3 border-t border-[hsl(var(--color-primary))/0.2]">
            <a
              href="#"
              @click.prevent="downloadTemplate"
              class="font-bold hover:underline inline-flex items-center gap-1"
            >
              <font-awesome-icon icon="fa-solid fa-download" /> Download Template
            </a>
          </div>
        </div>

        <!-- File Input Area -->
        <div
          class="border-2 border-dashed border-[hsl(var(--color-secondary))] rounded-xl p-8 text-center cursor-pointer hover:border-[hsl(var(--color-primary))] hover:bg-[hsl(var(--color-primary))/0.05] transition-all group"
          @click="$refs.fileInput.click()"
          @dragover.prevent
          @drop.prevent="handleDrop"
        >
          <input
            type="file"
            ref="fileInput"
            class="hidden"
            accept=".csv, .xlsx, .xls"
            @change="handleFileSelect"
          />

          <div v-if="!selectedFile">
            <font-awesome-icon
              icon="fa-solid fa-cloud-arrow-up"
              class="text-4xl mb-3 text-[hsl(var(--color-text))] opacity-30 group-hover:text-[hsl(var(--color-primary))] group-hover:opacity-100 transition-all"
            />
            <p class="font-medium">Klik untuk upload file</p>
            <p class="text-xs opacity-50 mt-1">atau drag & drop file ke sini</p>
          </div>

          <div v-else>
            <font-awesome-icon
              icon="fa-solid fa-file-excel"
              class="text-4xl mb-3 text-[hsl(var(--color-success))]"
            />
            <p class="font-bold text-lg truncate px-4">{{ selectedFile.name }}</p>
            <p class="text-xs opacity-60 mt-1">
              Ukuran: {{ (selectedFile.size / 1024).toFixed(2) }} KB
            </p>
          </div>
        </div>

        <!-- Dry Run Option -->
        <div
          class="flex items-center gap-3 p-3 rounded-lg hover:bg-[hsl(var(--color-secondary))/0.05] transition-colors cursor-pointer"
          @click="isDryRun = !isDryRun"
        >
          <div class="relative flex items-center">
            <input
              type="checkbox"
              id="dryRun"
              v-model="isDryRun"
              class="peer h-5 w-5 cursor-pointer appearance-none rounded-md border border-[hsl(var(--color-secondary))] checked:bg-[hsl(var(--color-primary))] checked:border-transparent transition-all"
            />
            <font-awesome-icon
              icon="fa-solid fa-check"
              class="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-white opacity-0 peer-checked:opacity-100 text-xs pointer-events-none"
            />
          </div>
          <label class="text-sm cursor-pointer select-none flex-1">
            <span class="font-bold block">Mode Simulasi (Dry Run)</span>
            <span class="text-xs opacity-60">Cek error tanpa mengubah data database.</span>
          </label>
        </div>

        <!-- Error Message -->
        <div
          v-if="errorMessage"
          class="bg-[hsl(var(--color-danger))/0.1] text-[hsl(var(--color-danger))] px-4 py-3 rounded-lg text-sm flex items-start gap-3"
        >
          <font-awesome-icon icon="fa-solid fa-circle-exclamation" class="mt-0.5 shrink-0" />
          <span>{{ errorMessage }}</span>
        </div>
      </div>

      <!-- Footer -->
      <div class="mt-8 flex justify-end gap-3">
        <button
          @click="close"
          class="px-5 py-2.5 rounded-lg font-medium text-[hsl(var(--color-text))] opacity-70 hover:opacity-100 hover:bg-[hsl(var(--color-secondary))/0.1] transition-all"
        >
          Batal
        </button>
        <button
          @click="upload"
          :disabled="!selectedFile || isLoading"
          class="px-5 py-2.5 bg-[hsl(var(--color-primary))] text-white rounded-lg shadow-lg shadow-[hsl(var(--color-primary))/0.3] font-bold hover:bg-[hsl(var(--color-primary))/0.9] disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none transition-all flex items-center gap-2"
        >
          <font-awesome-icon v-if="isLoading" icon="fa-solid fa-spinner" spin />
          <span>{{ isLoading ? 'Mengunggah...' : 'Mulai Import' }}</span>
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { uploadPriceUpdate } from '../../api/helpers/products'

const props = defineProps({
  isOpen: Boolean,
})

const emit = defineEmits(['close', 'success'])

const fileInput = ref(null)
const selectedFile = ref(null)
const isDryRun = ref(false)
const isLoading = ref(false)
const errorMessage = ref('')

const handleFileSelect = (event) => {
  const file = event.target.files[0]
  if (file) validateAndSetFile(file)
}

const handleDrop = (event) => {
  const file = event.dataTransfer.files[0]
  if (file) validateAndSetFile(file)
}

const validateAndSetFile = (file) => {
  // Validasi sederhana tipe file bisa ditambahkan di sini jika perlu
  selectedFile.value = file
  errorMessage.value = ''
}

const downloadTemplate = () => {
  const csvContent =
    'data:text/csv;charset=utf-8,sku,name,price,weight,is_package,is_active\nBRG-001,Produk Contoh,15000,500,0,1'
  const encodedUri = encodeURI(csvContent)
  const link = document.createElement('a')
  link.setAttribute('href', encodedUri)
  link.setAttribute('download', 'template_import_produk.csv')
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
}

const upload = async () => {
  if (!selectedFile.value) return

  isLoading.value = true
  errorMessage.value = ''

  const formData = new FormData()
  formData.append('file', selectedFile.value)
  formData.append('dryRun', isDryRun.value)

  try {
    await uploadPriceUpdate(formData)

    selectedFile.value = null
    isDryRun.value = false

    emit('success')
    close()
  } catch (error) {
    console.error(error)
    // Mengambil pesan error dari response backend atau fallback ke pesan default
    errorMessage.value = error.response?.data?.message || error.message || 'Gagal mengunggah file.'
  } finally {
    isLoading.value = false
  }
}

const close = () => {
  selectedFile.value = null
  errorMessage.value = ''
  emit('close')
}
</script>
