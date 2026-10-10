<template>
  <Teleport to="body">
    <div v-if="isOpen" class="fixed inset-0 z-50 flex items-center justify-center p-4">
      <!-- Backdrop -->
      <div class="absolute inset-0 bg-text/50 backdrop-blur-sm transition-opacity" @click="close"></div>

      <!-- Modal Content -->
      <div
        class="bg-background rounded-2xl shadow-xl w-full overflow-hidden transform transition-all relative z-10 flex flex-col max-h-[90vh] border border-secondary/20 duration-300"
        :class="activeTab === 'review' ? 'max-w-[80vw] mt-8' : 'max-w-lg'"
      >
        <!-- Header -->
        <div class="px-6 py-4 border-b border-secondary/20 flex flex-col gap-4 bg-secondary/5">
          <div class="flex justify-between items-center">
            <div>
              <h3 class="font-bold text-lg text-text">Batch Stock Inbound</h3>
              <p class="text-xs text-text/60 mt-0.5">Input stok masuk massal via Excel atau PDF</p>
            </div>
            <button
              @click="close"
              class="text-text/40 hover:text-text/80 transition-colors w-8 h-8 flex items-center justify-center rounded-full hover:bg-secondary/10"
            >
              <font-awesome-icon icon="fa-solid fa-times" />
            </button>
          </div>

          <!-- TABS -->
          <div class="flex items-center gap-1 bg-secondary/10 p-1 rounded-lg">
            <button
              @click="activeTab = 'input'"
              class="flex-1 px-3 py-1.5 rounded-md text-xs font-bold transition-all"
              :class="
                activeTab === 'input' || activeTab === 'review'
                  ? 'bg-background shadow-sm text-primary'
                  : 'text-text/60 hover:text-text hover:bg-secondary/10'
              "
            >
              Input Baru
            </button>
            <button
              @click="activeTab = 'history'"
              class="flex-1 px-3 py-1.5 rounded-md text-xs font-bold transition-all"
              :class="
                activeTab === 'history'
                  ? 'bg-background shadow-sm text-primary'
                  : 'text-text/60 hover:text-text hover:bg-secondary/10'
              "
            >
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
                    class="bg-primary/10 text-primary w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5"
                  >
                    <span class="font-bold text-sm">1</span>
                  </div>
                  <div class="flex-1">
                    <h4 class="font-semibold text-text text-sm">Download Template Excel</h4>
                    <p class="text-xs text-text/60 mt-1 mb-3 leading-relaxed">
                      Unduh template Excel terbaru. Pastikan SKU dan Lokasi sesuai dengan data di sistem.
                    </p>
                    <button
                      @click="downloadTemplate"
                      :disabled="isDownloading"
                      class="text-xs font-semibold bg-background border border-primary/30 text-primary px-3 py-2 rounded-lg hover:bg-primary/5 hover:border-primary/50 transition-all flex items-center gap-2 shadow-sm"
                    >
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
                    class="bg-secondary/20 text-text/70 w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5"
                  >
                    <span class="font-bold text-sm">2</span>
                  </div>
                  <div class="w-full">
                    <h4 class="font-semibold text-text text-sm">Upload File Excel / PDF</h4>
                    <p class="text-xs text-text/60 mt-1 mb-3">
                      Unggah file Excel hasil pengisian template atau PDF Purchase Order supplier. Maksimal 10MB.
                    </p>

                    <!-- Dropzone -->
                    <div
                      @dragover.prevent="isDragging = true"
                      @dragleave.prevent="isDragging = false"
                      @drop.prevent="handleDrop"
                      class="border-2 border-dashed rounded-xl p-6 text-center transition-all cursor-pointer relative group bg-background"
                      :class="[
                        isDragging
                          ? 'border-primary bg-primary/5'
                          : 'border-secondary/30 hover:border-primary/50 hover:bg-secondary/5',
                        file ? 'border-success bg-success/5' : ''
                      ]"
                      @click="$refs.fileInput.click()"
                    >
                      <input
                        type="file"
                        ref="fileInput"
                        class="hidden"
                        accept=".xlsx,.pdf"
                        @change="handleFileSelect"
                      />

                      <div v-if="file" class="py-2">
                        <div
                          class="w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-2"
                          :class="
                            file.name.endsWith('.pdf') ? 'bg-danger/10 text-danger' : 'bg-success/10 text-success'
                          "
                        >
                          <font-awesome-icon
                            :icon="file.name.endsWith('.pdf') ? 'fa-solid fa-file-pdf' : 'fa-solid fa-file-excel'"
                            size="lg"
                          />
                        </div>
                        <p class="text-sm font-medium text-text break-all">{{ file.name }}</p>
                        <p class="text-xs text-text/40 mt-1">{{ formatFileSize(file.size) }}</p>
                        <button @click.stop="file = null" class="text-xs text-danger hover:underline mt-2">
                          Hapus File
                        </button>
                      </div>

                      <div v-else class="py-4 space-y-2 pointer-events-none">
                        <div
                          class="w-12 h-12 bg-secondary/10 text-text/40 group-hover:bg-primary/10 group-hover:text-primary rounded-full flex items-center justify-center mx-auto transition-colors"
                        >
                          <font-awesome-icon icon="fa-solid fa-cloud-upload-alt" size="lg" />
                        </div>
                        <p class="text-sm text-text/60 font-medium">
                          <span class="text-primary">Klik upload</span> atau drag & drop
                        </p>
                        <p class="text-[10px] text-text/40 uppercase">XLSX ATAU PDF ONLY</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <!-- Notes -->
              <div>
                <label class="block text-sm font-bold text-text mb-1.5"
                  >Catatan <span class="text-text/40 font-normal">(opsional)</span></label
                >
                <textarea
                  v-model="userNotes"
                  rows="2"
                  placeholder="Tulis catatan untuk upload ini..."
                  class="w-full px-3 py-2 border border-secondary/30 rounded-lg bg-background text-text text-sm outline-none focus:border-primary transition-colors resize-none placeholder:text-text/30"
                ></textarea>
              </div>
            </div>

            <!-- TAB: REVIEW (NEW) -->
            <div v-else-if="activeTab === 'review'" key="review" class="space-y-6">
              <!-- Info & Global Options -->
              <div
                class="bg-secondary/20 border border-secondary/50 rounded-xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-4"
              >
                <div>
                  <h4 class="font-bold text-text text-sm flex items-center gap-2">
                    <font-awesome-icon icon="fa-solid fa-file-pdf" class="text-danger" />
                    Review Hasil Parsing PDF
                  </h4>
                  <p class="text-xs text-text/60 mt-1 leading-relaxed">
                    Silakan periksa item produk yang dibaca dari PDF. Pastikan memetakan produk dan lokasi dengan benar.
                  </p>
                </div>

                <!-- Global Location Selector -->
                <div class="w-full md:w-72 shrink-0">
                  <label class="block text-xs font-bold text-text mb-1 uppercase tracking-wider"
                    >Lokasi Tujuan Default</label
                  >
                  <BaseSelect
                    v-model="globalLocationId"
                    :options="locationOptions"
                    label="label"
                    track-by="id"
                    placeholder="Set lokasi untuk semua..."
                    :searchable="true"
                    emit-value
                    @update:modelValue="applyGlobalLocation"
                  />
                </div>
              </div>

              <!-- Review Grid -->
              <div class="border border-secondary/50 rounded-xl overflow-hidden shadow-sm bg-background">
                <!-- === MOBILE: Card Layout === -->
                <div v-if="isMobile" class="divide-y divide-secondary/20">
                  <div v-for="(row, idx) in reviewRows" :key="row.id" class="p-4 space-y-3 relative">
                    <!-- Status + Parsed Name Header -->
                    <div class="flex items-start gap-2">
                      <font-awesome-icon
                        v-if="row.productId && row.locationId && row.quantity > 0"
                        icon="fa-solid fa-circle-check"
                        class="text-success mt-0.5 shrink-0"
                      />
                      <font-awesome-icon
                        v-else
                        icon="fa-solid fa-circle-exclamation"
                        class="text-warning mt-0.5 shrink-0"
                      />
                      <div class="flex-1 min-w-0">
                        <p class="text-sm font-bold text-text truncate">{{ row.parsedName }}</p>
                        <p v-if="row.sku" class="text-[10px] text-text/40 font-mono">{{ row.sku }}</p>
                      </div>
                      <button
                        @click="removeReviewRow(idx)"
                        class="w-7 h-7 text-text/30 hover:text-danger hover:bg-danger/10 rounded-lg flex items-center justify-center shrink-0 transition-colors"
                      >
                        <font-awesome-icon icon="fa-solid fa-trash-alt" class="text-xs" />
                      </button>
                    </div>
                    <!-- Product Selector -->
                    <div>
                      <label class="text-[10px] text-text/50 font-bold uppercase mb-1 block">Produk Sistem</label>
                      <BaseSelect
                        :modelValue="row.productId"
                        :options="productSelectOptions"
                        label="label"
                        track-by="id"
                        placeholder="Cari & pilih produk..."
                        :searchable="true"
                        emit-value
                        @update:modelValue="val => handleProductChange(row, val)"
                      />
                    </div>
                    <!-- Qty + Location Row -->
                    <div class="grid grid-cols-2 gap-3">
                      <div>
                        <label class="text-[10px] text-text/50 font-bold uppercase mb-1 block">Qty</label>
                        <input
                          v-model.number="row.quantity"
                          type="number"
                          min="1"
                          class="w-full text-center px-2 py-2 border border-secondary/50 rounded-lg bg-background text-text font-bold text-sm outline-none focus:border-primary transition-colors"
                        />
                      </div>
                      <div>
                        <label class="text-[10px] text-text/50 font-bold uppercase mb-1 block">Lokasi</label>
                        <BaseSelect
                          v-model="row.locationId"
                          :options="locationOptions"
                          label="label"
                          track-by="id"
                          placeholder="Pilih..."
                          :searchable="true"
                          emit-value
                        />
                      </div>
                    </div>
                  </div>
                </div>

                <!-- === DESKTOP: Table Layout === -->
                <table v-else class="w-full border-collapse text-left text-sm">
                  <thead>
                    <tr
                      class="bg-secondary/40 border-b border-secondary text-xs font-bold text-text uppercase tracking-wider"
                    >
                      <th class="p-2 w-16"></th>
                      <th class="p-2 w-80">Nama di PDF</th>
                      <th class="p-2 w-50">Produk Sistem (Autocomplete)</th>
                      <th class="p-2 w-24 text-center">Qty</th>
                      <th class="p-2 w-36">Lokasi Tujuan</th>
                      <th class="p-2 w-16 text-center">Aksi</th>
                    </tr>
                  </thead>
                  <tbody class="divide-y divide-secondary/20">
                    <tr v-for="(row, idx) in reviewRows" :key="row.id" class="hover:bg-secondary/5 transition-colors">
                      <td class="p-2 text-center">
                        <font-awesome-icon
                          v-if="row.productId && row.locationId && row.quantity > 0"
                          icon="fa-solid fa-circle-check"
                          class="text-success text-lg"
                          title="Siap diinbound"
                        />
                        <font-awesome-icon
                          v-else
                          icon="fa-solid fa-circle-exclamation"
                          class="text-warning text-lg"
                          title="Ada data yang kurang"
                        />
                      </td>
                      <td class="p-2 font-medium text-text">{{ row.parsedName }}</td>
                      <td class="p-2">
                        <BaseSelect
                          :modelValue="row.productId"
                          :options="productSelectOptions"
                          label="label"
                          track-by="id"
                          placeholder="Cari & pilih produk..."
                          :searchable="true"
                          emit-value
                          @update:modelValue="val => handleProductChange(row, val)"
                        />
                      </td>
                      <td class="p-2">
                        <input
                          v-model.number="row.quantity"
                          type="number"
                          min="1"
                          class="min-w-16 w-full text-center px-2 py-2 border border-secondary/50 rounded-lg bg-background text-text font-bold text-sm outline-none focus:border-primary transition-colors"
                        />
                      </td>
                      <td class="p-2">
                        <BaseSelect
                          v-model="row.locationId"
                          :options="locationOptions"
                          label="label"
                          track-by="id"
                          placeholder="Pilih lokasi..."
                          :searchable="true"
                          emit-value
                        />
                      </td>
                      <td class="p-2 text-center">
                        <button
                          @click="removeReviewRow(idx)"
                          class="w-8 h-8 text-text/40 hover:text-danger hover:bg-danger/10 rounded-lg flex items-center justify-center mx-auto transition-colors"
                          title="Hapus baris ini"
                        >
                          <font-awesome-icon icon="fa-solid fa-trash-alt" />
                        </button>
                      </td>
                    </tr>
                  </tbody>
                </table>

                <div class="bg-secondary/10 border-t border-secondary/50 p-1 flex justify-center gap-4">
                  <button
                    @click="addManualRow"
                    class="text-xs font-bold text-primary hover:text-primary/80 transition-colors flex items-center gap-2 p-3 rounded-lg hover:bg-primary/5"
                  >
                    <font-awesome-icon icon="fa-solid fa-plus" />
                    <span>Tambah Baris Manual</span>
                  </button>
                  <button
                    @click="openCreateProductModal"
                    class="text-xs font-bold text-success hover:text-success/80 transition-colors flex items-center gap-2 p-3 rounded-lg hover:bg-success/5"
                  >
                    <font-awesome-icon icon="fa-solid fa-plus-circle" />
                    <span>Buat Produk Baru</span>
                  </button>
                </div>

                <!-- Empty State in Review -->
                <div v-if="reviewRows.length === 0" class="py-12 text-center text-text/40">
                  <font-awesome-icon icon="fa-solid fa-box-open" size="2xl" class="mb-2 text-text/20" />
                  <p>Tidak ada produk yang tersisa untuk diproses.</p>
                </div>
              </div>
            </div>

            <!-- TAB: HISTORY -->
            <div v-else key="history" class="h-full flex flex-col">
              <ImportJobHistory :job-types="['IMPORT_STOCK_INBOUND', 'IMPORT_STOCK_INBOUND_DRY_RUN']" />
            </div>
          </transition>
        </div>

        <!-- Footer -->
        <!-- Input Tab Footer -->
        <div
          class="px-6 py-4 border-t border-secondary/20 bg-secondary/5 flex justify-end gap-3"
          v-if="activeTab === 'input'"
        >
          <button
            @click="close"
            class="px-4 py-2 text-sm font-semibold text-text/60 hover:bg-secondary/20 rounded-lg transition-colors"
          >
            Batal
          </button>
          <button
            @click="processUpload"
            :disabled="!file || isUploading"
            class="px-5 py-2 text-sm font-bold text-secondary bg-primary hover:bg-primary/90 rounded-lg shadow-lg shadow-primary/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            <font-awesome-icon v-if="isUploading" icon="fa-solid fa-circle-notch" spin />
            <span>{{ isUploading ? 'Memproses...' : 'Proses Inbound' }}</span>
          </button>
        </div>

        <!-- Review Tab Footer (NEW) -->
        <div
          class="px-6 py-4 border-t border-secondary/20 bg-secondary/5 flex justify-between items-center"
          v-if="activeTab === 'review'"
        >
          <div class="text-xs text-text/60">
            Total: <span class="font-bold text-text">{{ reviewRows.length }}</span> item terdeteksi
          </div>
          <div class="flex gap-3">
            <button
              @click="goBackToInput"
              :disabled="isSubmitting"
              class="px-4 py-2 text-sm font-semibold text-text border border-secondary rounded-lg hover:bg-secondary/10 transition-colors"
            >
              Kembali
            </button>
            <button
              @click="submitBatchJSON"
              :disabled="!isReviewValid || isSubmitting"
              class="px-5 py-2 text-sm font-bold text-secondary bg-primary hover:bg-primary/90 rounded-lg shadow-lg shadow-primary/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              <font-awesome-icon v-if="isSubmitting" icon="fa-solid fa-circle-notch" spin />
              <font-awesome-icon v-else icon="fa-solid fa-check" />
              <span>{{ isSubmitting ? 'Menyimpan...' : 'Simpan Inbound' }}</span>
            </button>
          </div>
        </div>

        <!-- Footer History -->
        <div
          class="px-6 py-4 border-t border-secondary/20 bg-secondary/5 flex justify-end gap-3"
          v-if="activeTab === 'history'"
        >
          <button
            @click="close"
            class="px-4 py-2 text-sm font-semibold text-text hover:bg-secondary/20 rounded-lg transition-colors"
          >
            Tutup
          </button>
        </div>
      </div>

      <!-- Modal Product Creator -->
      <ProductFormModal
        :show="showProductFormModal"
        mode="create"
        @close="showProductFormModal = false"
        @refresh="handleProductCreated"
      />
    </div>
  </Teleport>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { useToast } from '@/composables/useToast'
import { useDownload } from '@/composables/useDownload'
import { useUpload } from '@/composables/useUpload'
import { useMobile } from '@/composables/useMobile'
import axios from '@/core/infrastructure/http.client'
import { stockApi } from '@/modules/wms/infrastructure/stock.api'
import ImportJobHistory from '@/components/shared/ImportJobHistory.vue'
import BaseSelect from '@/components/ui/BaseSelect.vue'
import ProductFormModal from '@/modules/wms/presentation/components/shared/ProductFormModal.vue'
import { useMasterDataStore } from '@/stores/masterData'

// Dynamic worker import for client side PDF parsing
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.mjs?url'

const props = defineProps({
  isOpen: Boolean
})

const emit = defineEmits(['close', 'success'])

const { toast } = useToast()
const { downloadFile } = useDownload()
const { uploadFile } = useUpload()
const { isMobile } = useMobile()
const file = ref(null)
const isDragging = ref(false)
const isDownloading = ref(false)
const isUploading = ref(false)
const isSubmitting = ref(false)
const fileInput = ref(null)
const activeTab = ref('input') // 'input' | 'review' | 'history'
const userNotes = ref('')

// Review Data Lists
const reviewRows = ref([])
const activeProducts = ref([])
const locations = ref([])
const globalLocationId = ref(null)

// Modal Product Creator States
const showProductFormModal = ref(false)

const openCreateProductModal = () => {
  showProductFormModal.value = true
}

const handleProductCreated = async () => {
  await loadInboundContext()
  toast('Katalog produk sistem diperbarui.', 'success')
}

let pdfjsLib = null

// --- COMPUTED DATA FOR SELECTS ---
const productSelectOptions = computed(() =>
  activeProducts.value.map(p => ({
    id: p.id,
    label: `${p.name} (${p.sku})`,
    sku: p.sku
  }))
)

const locationOptions = computed(() =>
  locations.value.map(loc => ({
    id: loc.id,
    label: loc.code
  }))
)

// Validation: all items must be matched to system product, have location, and quantity > 0
const isReviewValid = computed(() => {
  if (reviewRows.value.length === 0) return false
  return reviewRows.value.every(row => row.productId && row.locationId && row.quantity > 0)
})

// --- ACTIONS & HANDLERS ---
const formatFileSize = bytes => {
  if (bytes === 0) return '0 Bytes'
  const k = 1024
  const sizes = ['Bytes', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

const close = () => {
  file.value = null
  reviewRows.value = []
  activeTab.value = 'input'
  userNotes.value = ''
  emit('close')
}

// Load dynamic data on modal load
const loadInboundContext = async () => {
  try {
    const prodRes = await axios.get('/products/admin-list')
    activeProducts.value = prodRes.data.data || []

    const masterData = useMasterDataStore()
    locations.value = await masterData.getLocations()
  } catch (err) {
    console.error('Failed to load system context:', err)
  }
}

watch(
  () => props.isOpen,
  newVal => {
    if (newVal) {
      loadInboundContext()
    }
  }
)

const downloadTemplate = async () => {
  try {
    isDownloading.value = true
    await downloadFile('/stock/template/inbound', 'Template_Inbound_Stok.xlsx')
    toast('Template berhasil diunduh', 'success')
  } catch (err) {
    console.error('Failed to download template:', err)
  } finally {
    isDownloading.value = false
  }
}

const handleFileSelect = event => {
  const selectedFile = event.target.files[0]
  validateAndSetFile(selectedFile)
}

const handleDrop = event => {
  isDragging.value = false
  const droppedFile = event.dataTransfer.files[0]
  validateAndSetFile(droppedFile)
}

const validateAndSetFile = selectedFile => {
  if (!selectedFile) return

  const isExcel =
    selectedFile.type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
    selectedFile.name.endsWith('.xlsx')
  const isPDF = selectedFile.type === 'application/pdf' || selectedFile.name.endsWith('.pdf')

  if (!isExcel && !isPDF) {
    return
  }

  if (selectedFile.size > 10 * 1024 * 1024) {
    return
  }

  file.value = selectedFile
}

// Redirect processes
const processUpload = () => {
  if (!file.value) return
  if (file.value.name.endsWith('.pdf')) {
    parsePDFAndShowReview(file.value)
  } else {
    uploadExcelFile()
  }
}

// --- PDF COORDINATE PARSING LOGIC ---
const parsePDFAndShowReview = async pdfFile => {
  try {
    isUploading.value = true

    if (!pdfjsLib) {
      pdfjsLib = await import('pdfjs-dist')
      pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker
      pdfjsLib.GlobalWorkerOptions.maxWorkerCount = 0
    }

    const arrayBuffer = await pdfFile.arrayBuffer()
    const loadingTask = pdfjsLib.getDocument({
      data: new Uint8Array(arrayBuffer),
      disableFontFace: true
    })
    const pdfDocument = await loadingTask.promise
    const allParsedRows = []

    for (let pageNum = 1; pageNum <= pdfDocument.numPages; pageNum++) {
      const page = await pdfDocument.getPage(pageNum)
      const textContent = await page.getTextContent()
      const items = textContent.items.filter(item => item.str.trim())
      page.cleanup()

      const prodHeader = items.find(item => item.str.trim() === 'Produk')
      const descHeader = items.find(item => item.str.trim() === 'Deskripsi')
      const qtyHeader = items.find(item => item.str.trim() === 'Kuantitas')
      const noHeader = items.find(item => item.str.trim() === 'No.')

      if (!prodHeader || !qtyHeader) continue

      const headerY = noHeader ? noHeader.transform[5] : 650

      const prodX = prodHeader.transform[4]
      const descX = descHeader ? descHeader.transform[4] : 200
      const nameMidpoint = (prodX + descX) / 2

      // Find Row anchors in the "No." column range (X: 35 to 55) below header Y
      const anchors = items.filter(item => {
        const x = item.transform[4]
        const y = item.transform[5]
        const val = item.str.trim()
        return x >= 35 && x <= 55 && y < headerY && /^\d+$/.test(val)
      })

      for (const anchor of anchors) {
        const anchorY = anchor.transform[5]

        // Group items on this baseline Y coordinates +/- 12
        const rowItems = items.filter(item => {
          const y = item.transform[5]
          return Math.abs(y - anchorY) <= 12
        })

        // Sort multi-line product names descending (top-to-bottom)
        const nameParts = rowItems
          .filter(item => {
            const x = item.transform[4]
            return x >= 60 && x < nameMidpoint
          })
          .sort((a, b) => b.transform[5] - a.transform[5])

        const qtyPart = rowItems.find(item => {
          const x = item.transform[4]
          return x >= 270 && x <= 320
        })

        const productName = nameParts.map(p => p.str.trim()).join(' ')
        const quantity = qtyPart ? parseInt(qtyPart.str.trim(), 10) : 0

        if (productName && quantity > 0) {
          // Find matched product in db active catalog
          const exactMatch = activeProducts.value.find(p => p.name.toLowerCase() === productName.toLowerCase())
          const substringMatch =
            exactMatch ||
            activeProducts.value.find(
              p =>
                p.name.toLowerCase().includes(productName.toLowerCase()) ||
                productName.toLowerCase().includes(p.name.toLowerCase())
            )

          allParsedRows.push({
            id: Math.random().toString(36).substr(2, 9),
            parsedName: productName,
            productId: substringMatch ? substringMatch.id : null,
            sku: substringMatch ? substringMatch.sku : '',
            quantity,
            locationId: null,
            status: substringMatch ? 'matched' : 'error'
          })
        }
      }
    }

    await pdfDocument.destroy()

    if (allParsedRows.length === 0) {
      file.value = null
    } else {
      reviewRows.value = allParsedRows
      activeTab.value = 'review'
      globalLocationId.value = null // reset default global
      toast(`Berhasil mem-parse ${allParsedRows.length} item dari PDF.`, 'success')
    }
  } catch (error) {
    console.error('Failed to parse PDF:', error)
    file.value = null
  } finally {
    isUploading.value = false
  }
}

// Global batch action for location assignment
const applyGlobalLocation = locId => {
  if (!locId) return
  reviewRows.value.forEach(row => {
    row.locationId = locId
  })
  toast('Lokasi tujuan diterapkan ke semua baris', 'success')
}

// Modify mapping on specific row select
const handleProductChange = (row, productId) => {
  const product = activeProducts.value.find(p => p.id === productId)
  if (product) {
    row.productId = product.id
    row.sku = product.sku
    row.status = 'matched'
  } else {
    row.productId = null
    row.sku = ''
    row.status = 'error'
  }
}

const removeReviewRow = idx => {
  reviewRows.value.splice(idx, 1)
}

const addManualRow = () => {
  reviewRows.value.push({
    id: Math.random().toString(36).substr(2, 9),
    parsedName: '(Input Manual)',
    productId: null,
    sku: '',
    quantity: 1,
    locationId: globalLocationId.value || null,
    status: 'error'
  })
}

const goBackToInput = () => {
  activeTab.value = 'input'
}

// Direct clean batch submission
const submitBatchJSON = async () => {
  if (!isReviewValid.value) return
  try {
    isSubmitting.value = true

    const payload = {
      type: 'INBOUND',
      notes: userNotes.value.trim()
        ? `PDF Inbound PO: ${file.value?.name || 'Manual Upload'} | ${userNotes.value.trim()}`
        : `PDF Inbound PO: ${file.value?.name || 'Manual Upload'}`,
      movements: reviewRows.value.map(row => ({
        sku: row.sku,
        quantity: row.quantity,
        toLocationId: row.locationId
      }))
    }

    const res = await stockApi.processBatchMovement(payload)
    if (res.success) {
      toast(res.message || 'Inbound stok berhasil diproses', 'success')
      emit('success')
      close()
    }
  } catch (error) {
    console.error('Submit JSON Error:', error)
  } finally {
    isSubmitting.value = false
  }
}

// --- STANDARD EXCEL WORKER UPLOAD ---
const uploadExcelFile = async () => {
  try {
    isUploading.value = true
    const response = await uploadFile('/stock/import-batch', file.value, 'file', {
      notes: userNotes.value.trim() || ''
    })

    if (response.data.success) {
      toast(response.data.message, 'success')
      emit('success')
      activeTab.value = 'history'
      file.value = null
    }
  } catch (error) {
    console.error('Upload Error:', error)
  } finally {
    isUploading.value = false
  }
}
</script>

<style scoped>
.transition-all {
  transition-property: all;
  transition-timing-function: cubic-bezier(0.4, 0, 0.2, 1);
  transition-duration: 200ms;
}
</style>
