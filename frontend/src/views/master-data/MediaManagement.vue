<!-- frontend/src/views/media/MediaManagement.vue -->
<script setup>
import { swalConfirm, swalAlert } from '@/composables/useSweetAlert'
import { ref, onMounted, onUnmounted, watch, defineAsyncComponent } from 'vue'
import debounce from 'lodash/debounce'
import { useToast } from '@/composables/useToast.js'
import { useImageActions } from '@/composables/useImageActions.js'
import apiClient from '@/api/axios'
import MediaInfoModal from './MediaInfoModal.vue'
import MediaLightbox from '@/components/common/MediaLightbox.vue'
import LinkProductModal from './LinkProductModal.vue'
import BulkLinkMediaModal from './BulkLinkMediaModal.vue'
const ImageCropperModal = defineAsyncComponent(() => import('./ImageCropperModal.vue'))
import BulkEditTagsModal from './BulkEditTagsModal.vue'
import SegmentedControl from '@/components/ui/SegmentedControl.vue'
import BasePagination from '@/components/ui/BasePagination.vue'
import BaseModal from '@/components/ui/BaseModal.vue'
import { autoCropCenter } from '@/utils/imageCropper.js'
import FloatingTooltip from '@/components/ui/FloatingTooltip.vue'
import { resolveUrl } from '@/composables/useImageUrl'
import MediaCard from '@/components/common/MediaCard.vue'
import MediaActionBar from '@/components/common/MediaActionBar.vue'
import { useMobile } from '@/composables/useMobile.js'
import { formatBytes } from '@/utils/formatBytes.js'
import { uploadMediaToR2 } from '@/utils/mediaUploader.js'
import { formatTags } from '@/utils/formatters.js'
import { useProductSearch } from '@/composables/useProductSearch.js'
import { usePagination } from '@/composables/usePagination.js'
import { useFirebaseSync } from '@/composables/useFirebaseSync.js'

const linkStatusOptions = [
  { value: 'all', label: 'Semua', icon: 'fa-solid fa-layer-group' },
  { value: 'linked', label: 'Sudah', icon: 'fa-solid fa-link' },
  { value: 'orphaned', label: 'Belum', icon: 'fa-solid fa-link-slash' }
]

const { isMobile } = useMobile()
const { toast } = useToast()
const { downloadImage } = useImageActions()
const mediaList = ref([])
const viewMode = ref(localStorage.getItem('mediaViewMode') || 'grid')
watch(viewMode, newMode => {
  localStorage.setItem('mediaViewMode', newMode)
})

const initialPageSize = Number(localStorage.getItem('mediaPageSize')) || 20
const totalMedia = ref(0)
const {
  currentPage,
  currentLimit,
  meta: pagination,
  changePageSize: doChangePageSize
} = usePagination({
  totalItems: totalMedia,
  initialLimit: initialPageSize,
  storageKey: 'mediaPageSize'
})

// Firebase Real-time Sync untuk Media
useFirebaseSync('MASTER_DATA', 'REFRESH_MEDIA', () => fetchMedia(currentPage.value, true))
useFirebaseSync('BACKGROUND_JOBS', 'MEDIA_PROCESSED', () => fetchMedia(currentPage.value, true))

const changePageSize = newLimit => {
  doChangePageSize(newLimit)
  fetchMedia(1)
}

const isLoading = ref(false)
const uploaderInput = ref(null)
const isUploading = ref(false)
const globalSearchStr = ref('')
const linkStatusFilter = ref('all')
const isBulkLinkMediaModalOpen = ref(false)
const isUsageTooltipVisible = ref(false)
const usageTooltipTarget = ref(null)
const hoveredMediaItem = ref(null)

const handleTooltipOpen = async (event, item) => {
  if (item.usage_count > 0) {
    usageTooltipTarget.value = event.currentTarget
    hoveredMediaItem.value = item
    isUsageTooltipVisible.value = true
  }
}

const handleTooltipClose = () => {
  isUsageTooltipVisible.value = false
}

// Debounce: auto-fetch 400ms setelah user berhenti mengetik
const debouncedFetchMedia = debounce(() => fetchMedia(1), 400)
watch(globalSearchStr, () => debouncedFetchMedia())

// Instant fetch saat dropdown filter berubah
watch(linkStatusFilter, () => fetchMedia(1))

// Bulk Upload State
const isBulkModalOpen = ref(false)
const selectedFiles = ref([])
const fileTitles = ref([])
const bulkTagsStr = ref('')

// Bulk Products Autocomplete State
const bulkSelectedProducts = ref([])
const {
  query: bulkProductSearchQuery,
  results: bulkProductSearchResults,
  isSearching: isBulkProductSearching,
  clear: clearBulkProductSearch
} = useProductSearch()

const selectBulkProduct = prod => {
  if (!bulkSelectedProducts.value.find(p => p.id === prod.id)) {
    bulkSelectedProducts.value.push(prod)
  }
  clearBulkProductSearch()
}

const removeBulkProduct = prodId => {
  bulkSelectedProducts.value = bulkSelectedProducts.value.filter(p => p.id !== prodId)
}

const uploadProgress = ref('')

// Media Info Modal State
const isInfoModalOpen = ref(false)
const infoMediaId = ref(null)

const openInfoModal = item => {
  infoMediaId.value = item.id
  isInfoModalOpen.value = true
}

// backendUrl and resolveUrl now come from useImageUrl composable
const isLightboxOpen = ref(false)
const lightboxIndex = ref(0)

// Bulk Actions State
const isSelectionMode = ref(false)
const selectedMediaIds = ref(new Set())
const isLinkProductModalOpen = ref(false)
const isBulkEditTagsModalOpen = ref(false)

const toggleSelectionMode = () => {
  isSelectionMode.value = !isSelectionMode.value
  if (!isSelectionMode.value) selectedMediaIds.value = new Set()
}

const toggleSelection = item => {
  if (item.status !== 'COMPLETED') return
  const newSet = new Set(selectedMediaIds.value)
  if (newSet.has(item.id)) {
    newSet.delete(item.id)
  } else {
    newSet.add(item.id)
  }
  selectedMediaIds.value = newSet
}

const toggleSelectAll = e => {
  if (e.target.checked) {
    const newSet = new Set()
    mediaList.value.filter(i => i.status === 'COMPLETED').forEach(i => newSet.add(i.id))
    selectedMediaIds.value = newSet
  } else {
    selectedMediaIds.value = new Set()
  }
}

const confirmBulkDelete = async () => {
  if (selectedMediaIds.value.size === 0) return
  if (
    !(await swalConfirm(
      `Hapus ${selectedMediaIds.value.size} gambar terpilih secara permanen? Aksi ini tidak dapat dibatalkan.`
    ))
  )
    return

  isLoading.value = true
  let successCount = 0
  let usageConflictCount = 0
  let failCount = 0

  try {
    // Jalankan penghapusan berurutan agar pool database hosting tidak kebanjiran request
    for (const id of selectedMediaIds.value) {
      const item = mediaList.value.find(i => i.id === id)
      if (item && item.usage_count > 0) {
        usageConflictCount++
        continue
      }

      try {
        await apiClient.delete(`/media/${id}`)
        successCount++
        selectedMediaIds.value.delete(id) // Hapus dari seleksi jika berhasil
      } catch (err) {
        console.error(err) // Auto-added to prevent unused var
        if (err.response?.status === 409) {
          usageConflictCount++
        } else {
          failCount++
          console.error('Gagal hapus media ID ' + id, err)
        }
      }
    }

    let msg = `Selesai memproses pemusnahan massal.\nBerhasil: ${successCount}`
    if (usageConflictCount > 0) msg += `\nDilewati: ${usageConflictCount} gambar (Masih ditautkan ke produk)`
    if (failCount > 0) msg += `\nGagal sistem: ${failCount} gambar`
    await swalAlert(msg)
  } finally {
    fetchMedia(pagination.value.page, true)
    isLoading.value = false
    if (selectedMediaIds.value.size === 0) {
      isSelectionMode.value = false
    }
  }
}

const fetchMedia = async (page = 1, silent = false) => {
  if (!silent) isLoading.value = true
  try {
    const params = new URLSearchParams({ page, limit: currentLimit.value })
    if (globalSearchStr.value.trim()) params.append('search', globalSearchStr.value.trim())
    if (linkStatusFilter.value && linkStatusFilter.value !== 'all') {
      params.append('linkStatus', JSON.stringify({ include: [linkStatusFilter.value], exclude: [] }))
    }

    const res = await apiClient.get(`/media?${params.toString()}`)
    if (res.data.success) {
      mediaList.value = res.data.data
      if (res.data.pagination) {
        totalMedia.value = res.data.pagination.total
        currentPage.value = res.data.pagination.page
      }
    }
  } catch (error) {
    console.error('Failed to load media:', error)
    await swalAlert(error.response?.data?.message || 'Gagal memuat galeri media.')
  } finally {
    isLoading.value = false
  }
}

const triggerUpload = async () => {
  if (uploaderInput.value) {
    uploaderInput.value.click()
  }
}

const triggerExcelUpload = () => {
  isBulkLinkMediaModalOpen.value = true
}

const stripExtension = filename => filename.replace(/\.[^/.]+$/, '')

const processFilesForUpload = files => {
  if (!files || files.length === 0) return

  selectedFiles.value = Array.from(files)
  fileTitles.value = Array.from(files).map(f => stripExtension(f.name))
  bulkTagsStr.value = ''
  bulkSelectedProducts.value = []
  clearBulkProductSearch()
  isBulkModalOpen.value = true
}

const handleMultipleFiles = event => {
  processFilesForUpload(event.target.files)
  event.target.value = null // reset input
}

// --- PREVIEW & CROPPER STATE ---
const filePreviews = ref([])

watch(
  selectedFiles,
  newFiles => {
    // Revoke old URLs to prevent memory leak
    filePreviews.value.forEach(url => {
      if (url) URL.revokeObjectURL(url)
    })

    // Create new URLs
    filePreviews.value = newFiles.map(f => URL.createObjectURL(f))
  },
  { deep: true }
)

const isCropperOpen = ref(false)
const currentEditIndex = ref(-1)
const currentEditFile = ref(null)

const openCropper = index => {
  currentEditIndex.value = index
  currentEditFile.value = selectedFiles.value[index]
  isCropperOpen.value = true
}

const handleCroppedSave = newFile => {
  if (currentEditIndex.value !== -1) {
    // Replace file
    const updatedFiles = [...selectedFiles.value]
    updatedFiles[currentEditIndex.value] = newFile
    selectedFiles.value = updatedFiles
  }
}

const removeSelectedFile = index => {
  const updatedFiles = [...selectedFiles.value]
  updatedFiles.splice(index, 1)
  selectedFiles.value = updatedFiles

  const updatedTitles = [...fileTitles.value]
  updatedTitles.splice(index, 1)
  fileTitles.value = updatedTitles

  if (selectedFiles.value.length === 0) {
    isBulkModalOpen.value = false
  }
}

const autoCropAllProcessing = ref(false)

const autoCropAll = async () => {
  if (selectedFiles.value.length === 0) return
  autoCropAllProcessing.value = true

  try {
    const newFiles = await autoCropCenter(selectedFiles.value)
    selectedFiles.value = newFiles
  } catch (error) {
    console.error('Auto crop failed:', error)
    await swalAlert('Gagal melakukan auto-crop.')
  } finally {
    autoCropAllProcessing.value = false
  }
}

const handlePaste = async event => {
  // Abaikan paste jika pengguna sedang mengetik di dalam input/textarea (misal sedang ngetik pencarian)
  if (event.target.tagName === 'INPUT' || event.target.tagName === 'TEXTAREA') {
    return
  }

  const items = event.clipboardData?.items
  if (!items) return

  const pastedFiles = []
  for (let i = 0; i < items.length; i++) {
    if (items[i].type.startsWith('image/')) {
      const file = items[i].getAsFile()
      if (file) pastedFiles.push(file)
    }
  }

  if (pastedFiles.length > 0) {
    if (!isBulkModalOpen.value) {
      processFilesForUpload(pastedFiles)
    } else {
      selectedFiles.value = [...selectedFiles.value, ...pastedFiles]
      fileTitles.value = [...fileTitles.value, ...pastedFiles.map(f => stripExtension(f.name))]
    }
  }
}

import { isGenericTitle } from '@/utils/mediaUtils'

const executeBulkUpload = async () => {
  if (selectedFiles.value.length === 0) return
  const invalidIndex = fileTitles.value.findIndex(t => isGenericTitle(t))
  if (invalidIndex !== -1) {
    toast(`Silakan ubah nama file "${fileTitles.value[invalidIndex]}" menjadi lebih spesifik.`, 'warning')
    return
  }

  isUploading.value = true
  isBulkModalOpen.value = false

  const chunkSize = 5 // Batas batch API (menghindari 413 Payload Too Large)
  try {
    for (let i = 0; i < selectedFiles.value.length; i += chunkSize) {
      const chunk = selectedFiles.value.slice(i, i + chunkSize)
      uploadProgress.value = `Mengunggah ${i + chunk.length} dari ${selectedFiles.value.length} aset...`

      const chunkTitles = fileTitles.value.slice(i, i + chunkSize)
      let tags = []
      if (bulkTagsStr.value.trim()) {
        tags = bulkTagsStr.value
          .trim()
          .split(',')
          .map(t => t.trim())
          .filter(Boolean)
      }
      let products = []
      if (bulkSelectedProducts.value.length > 0) {
        products = bulkSelectedProducts.value.map(p => p.id)
      }

      const result = await uploadMediaToR2(apiClient, chunk, chunkTitles, tags, products, progress => {
        uploadProgress.value = `Memproses & Mengunggah ${i + chunk.length} dari ${selectedFiles.value.length} aset... (${progress}%)`
      })

      if (!result.success) {
        throw result
      }
    }
  } catch (err) {
    console.error(err)
    const errData = err.response?.data || err
    if (errData?.error_code === 'DUPLICATE_MEDIA') {
      await swalAlert(`Duplikat terdeteksi: ${errData.message}\n\nGunakan aset yang sudah ada.`)
    } else {
      console.error('Upload Error:', err)
      await swalAlert(errData?.message || 'Gagal mengunggah beberapa gambar.')
    }
  } finally {
    isUploading.value = false
    uploadProgress.value = ''
    selectedFiles.value = []
    fileTitles.value = []
    fetchMedia(1)
  }
}

const deleteMedia = async (id, usageCount) => {
  if (usageCount > 0) {
    await swalAlert('Media ini sedang digunakan oleh ' + usageCount + ' produk. Tidak bisa dihapus.')
    return
  }
  if (!(await swalConfirm('Yakin ingin menghapus aset media ini?'))) return

  try {
    const res = await apiClient.delete(`/media/${id}`)
    if (res.data.success) {
      fetchMedia(pagination.value.page)
    }
  } catch (error) {
    console.error('Delete Error:', error)
    await swalAlert(error.response?.data?.message || 'Gagal menghapus gambar.')
  }
}

// --- Bulk helpers ---
const getSelectedItems = () => mediaList.value.filter(i => selectedMediaIds.value.has(i.id) && i.status === 'COMPLETED')

const bulkCopyLinks = async () => {
  const items = getSelectedItems()
  if (items.length === 0) return
  const links = items.map(i => resolveUrl(i.main_path)).join('\n')
  try {
    await navigator.clipboard.writeText(links)
    toast(`${items.length} tautan berhasil disalin!`, 'success')
  } catch (e) {
    console.error(e)
  }
}

const bulkDownloadImages = async () => {
  const items = getSelectedItems()
  if (items.length === 0) return
  for (const item of items) {
    await downloadImage(resolveUrl(item.main_path), item.title || 'Gambar')
  }
  toast(`${items.length} gambar sedang diunduh.`, 'success')
}

// Global Drag and Drop State
const isDragging = ref(false)

const handleDragEnter = e => {
  e.preventDefault()
  isDragging.value = true
}

const handleDragLeave = e => {
  e.preventDefault()
  if (e.clientX === 0 || e.clientY === 0) {
    isDragging.value = false
  }
}

const handleDragOver = e => {
  e.preventDefault()
  isDragging.value = true
}

const handleDrop = async e => {
  e.preventDefault()
  isDragging.value = false

  const files = e.dataTransfer?.files
  if (!files || files.length === 0) return

  const imageFiles = Array.from(files).filter(f => f.type.startsWith('image/'))
  if (imageFiles.length === 0) {
    await swalAlert('Hanya format/tipe file gambar yang didukung.')
    return
  }

  processFilesForUpload(imageFiles)
}

onMounted(() => {
  fetchMedia(1)
  window.addEventListener('paste', handlePaste)
})

onUnmounted(() => {
  window.removeEventListener('paste', handlePaste)
  if (debouncedFetchMedia) debouncedFetchMedia.cancel()
})
</script>

<template>
  <div
    class="h-min-screen"
    @dragenter="handleDragEnter"
    @dragover="handleDragOver"
    @dragleave="handleDragLeave"
    @drop="handleDrop"
  >
    <!-- Global Drag overlay -->
    <div
      v-show="isDragging"
      class="fixed inset-0 z-[100] bg-primary/20 backdrop-blur-sm border-4 border-dashed border-primary flex items-center justify-center pointer-events-none transition-colors"
    >
      <div class="bg-background px-10 py-8 rounded-2xl shadow-2xl flex flex-col items-center">
        <font-awesome-icon icon="fa-solid fa-cloud-arrow-up" class="text-6xl text-primary mb-4 animate-bounce" />
        <h2 class="text-2xl font-bold text-text">Lepaskan gambar di sini</h2>
        <p class="text-text/70 mt-2">Gambar akan otomatis diunggah ke pustaka</p>
      </div>
    </div>

    <!-- Header -->
    <div class="mb-4">
      <!-- Bulk Actions Bar (Hidden when not in selection mode) -->
      <div
        v-if="isSelectionMode"
        class="fixed bottom-6 left-1/2 -translate-x-1/2 bg-background border border-secondary/50 shadow-2xl rounded-full px-5 py-3 flex items-center gap-4 z-[60] animate-fade-in-up"
      >
        <div class="flex items-center gap-3 pr-4 border-r border-secondary/30">
          <input
            type="checkbox"
            class="w-5 h-5 rounded border-secondary text-primary focus:ring-primary cursor-pointer accent-primary"
            :checked="
              selectedMediaIds.size > 0 &&
              selectedMediaIds.size === mediaList.filter(i => i.status === 'COMPLETED').length
            "
            @change="toggleSelectAll"
          />
          <span
            class="font-bold text-sm text-text whitespace-nowrap"
            v-text="`${selectedMediaIds.size} Terpilih`"
          ></span>
        </div>

        <div
          class="flex items-center gap-2"
          :class="{ 'opacity-50 grayscale pointer-events-none': selectedMediaIds.size === 0 }"
        >
          <button
            @click="bulkCopyLinks"
            class="px-3 py-1.5 rounded-lg hover:bg-primary/10 hover:text-primary text-text text-sm font-semibold transition-colors flex items-center whitespace-nowrap"
            title="Salin semua tautan"
          >
            <font-awesome-icon icon="fa-solid fa-link" class="mr-2" /> Salin Link
          </button>
          <button
            @click="bulkDownloadImages"
            class="px-3 py-1.5 rounded-lg hover:bg-primary/10 hover:text-primary text-text text-sm font-semibold transition-colors flex items-center whitespace-nowrap"
            title="Unduh semua gambar terpilih"
          >
            <font-awesome-icon icon="fa-solid fa-download" class="mr-2" /> Unduh
          </button>
          <div class="w-px h-6 bg-secondary/30"></div>
          <button
            @click="isLinkProductModalOpen = true"
            class="px-3 py-1.5 rounded-lg hover:bg-primary/10 hover:text-primary text-text text-sm font-semibold transition-colors flex items-center whitespace-nowrap"
          >
            <font-awesome-icon icon="fa-solid fa-chart-diagram" class="mr-2" /> Tautkan
          </button>
          <button
            @click="isBulkEditTagsModalOpen = true"
            class="px-3 py-1.5 rounded-lg hover:bg-accent/10 hover:text-accent text-text text-sm font-semibold transition-colors flex items-center whitespace-nowrap"
          >
            <font-awesome-icon icon="fa-solid fa-tags" class="mr-2" /> Tag Massal
          </button>
          <button
            @click="confirmBulkDelete"
            class="px-3 py-1.5 rounded-lg bg-danger/10 hover:bg-danger hover:text-background text-danger text-sm font-bold transition-colors flex items-center whitespace-nowrap"
          >
            <font-awesome-icon icon="fa-solid fa-trash" class="mr-2" /> Hapus
          </button>
        </div>
      </div>
      <div class="flex gap-2 flex-wrap justify-end items-end">
        <div class="relative w-full md:w-[300px] border border-secondary/20 rounded-lg bg-secondary">
          <input
            type="text"
            v-model="globalSearchStr"
            placeholder="Cari nama file, SKU, atau tag..."
            class="input input-sm input-bordered w-full p-2 pr-8 text-text rounded-lg bg-background h-[42px]"
          />
          <font-awesome-icon
            icon="fa-solid fa-search"
            class="absolute right-3 top-1/2 -translate-y-1/2 text-text/40 pointer-events-none"
          />
        </div>
        <div class="w-full sm:w-auto shrink-0 min-w-[200px]">
          <SegmentedControl
            label="Status Taut"
            label-variant="compact"
            v-model="linkStatusFilter"
            :options="linkStatusOptions"
          />
        </div>
        <input type="file" ref="uploaderInput" class="hidden" multiple accept="image/*" @change="handleMultipleFiles" />
        <!-- Actions -->

        <!-- View Pattern Switcher -->
        <div class="w-full sm:w-auto sm:min-w-[240px] shrink-0">
          <SegmentedControl
            label="Tampilan"
            label-variant="compact"
            v-model="viewMode"
            :options="[
              { value: 'grid', label: 'Grid', icon: 'fa-solid fa-border-all' },
              { value: 'list', label: 'List', icon: 'fa-solid fa-list-ul' },
              { value: 'compact', label: 'Compact', icon: 'fa-solid fa-table-cells' }
            ]"
          />
        </div>

        <button
          @click="fetchMedia(pagination.page)"
          class="flex items-center justify-center w-10 h-10 rounded-lg bg-background border border-secondary text-text hover:border-primary transition-colors"
          title="Refresh"
        >
          <font-awesome-icon icon="fa-solid fa-sync" :spin="isLoading" />
        </button>
        <button
          @click="toggleSelectionMode"
          class="px-4 py-1.5 h-10 rounded-lg font-medium transition-colors flex items-center justify-center whitespace-nowrap"
          :class="
            isSelectionMode
              ? 'bg-secondary text-text border border-secondary hover:brightness-95'
              : 'bg-background border border-secondary text-text hover:border-primary'
          "
        >
          <font-awesome-icon icon="fa-solid fa-check-double" class="mr-2" />
          <span v-text="isSelectionMode ? 'Batal' : 'Pilih'"></span>
        </button>
        <button
          @click="triggerExcelUpload"
          class="px-4 py-1.5 w-10 h-10 rounded-lg bg-accent text-background font-medium hover:brightness-110 transition-colors flex items-center justify-center whitespace-nowrap"
          :disabled="isUploading || isLoading"
          title="Tautkan Massal via Excel"
        >
          <font-awesome-icon icon="fa-solid fa-file-excel" :class="isMobile ? 'mr-2' : ''" />
          <span v-if="isMobile">Tautkan Massal (Excel)</span>
        </button>
        <button
          @click="triggerUpload"
          class="px-4 py-1.5 w-10 h-10 rounded-lg bg-primary text-background font-medium hover:bg-accent transition-colors flex items-center justify-center whitespace-nowrap"
          :disabled="isUploading"
        >
          <font-awesome-icon icon="fa-solid fa-upload" :class="isMobile ? 'mr-2' : ''" />
          <span v-if="isMobile" v-text="isUploading ? 'Mengunggah...' : 'Unggah Aset'"></span>
        </button>
      </div>
    </div>

    <div
      :class="{
        'grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 relative': viewMode === 'grid',
        'flex flex-col gap-3 relative': viewMode === 'list',
        'grid grid-cols-3 sm:grid-cols-5 md:grid-cols-7 xl:grid-cols-10 gap-2 relative': viewMode === 'compact'
      }"
    >
      <div
        v-for="(item, index) in mediaList"
        :key="item.id"
        class="card border transition-all relative overflow-hidden rounded-xl"
        :class="[
          selectedMediaIds.has(item.id)
            ? 'border-primary ring-1 ring-primary ring-offset-0 ring-offset-background'
            : 'bg-background border-secondary hover:border-primary/50',
          viewMode === 'list' ? 'flex flex-row items-center py-2 px-3 gap-4' : 'shadow-sm'
        ]"
      >
        <template v-if="viewMode === 'list'">
          <!-- List Mode Layout -->
          <div v-if="isSelectionMode" class="flex items-center">
            <input
              type="checkbox"
              :checked="selectedMediaIds.has(item.id)"
              @change="toggleSelection(item)"
              class="w-5 h-5 accent-primary cursor-pointer"
            />
          </div>

          <figure
            class="w-16 h-16 shrink-0 relative rounded-md overflow-hidden cursor-pointer"
            :class="selectedMediaIds.has(item.id) ? 'bg-primary/10' : 'bg-secondary/30'"
            @click="item.status === 'COMPLETED' ? ((isLightboxOpen = true), (lightboxIndex = index)) : null"
          >
            <img
              v-if="item.status === 'COMPLETED'"
              :src="resolveUrl(item.thumbnail_path || item.main_path)"
              class="w-full h-full object-cover"
            />
            <div v-else class="flex w-full h-full items-center justify-center text-text/50">
              <font-awesome-icon icon="fa-solid fa-image" class="text-2xl opacity-30" />
            </div>
          </figure>

          <div class="flex-1 min-w-0 flex flex-col justify-center">
            <div class="font-medium text-text truncate" :title="item.title">
              {{ item.title || 'Gambar' }}
            </div>
            <div class="text-sm text-text/60 mt-1 flex items-center gap-x-4 gap-y-1">
              <span>{{ formatBytes(item.size_bytes) }}</span>
              <span class="hidden sm:inline" v-if="item.width && item.height"
                >{{ item.width }} &times; {{ item.height }} px</span
              >
              <span
                v-if="item.usage_count > 0"
                class="badge text-xs bg-primary/20 text-primary border border-primary/20 hidden sm:inline-flex cursor-help px-2 py-0.5 rounded-md"
                @mouseenter="e => handleTooltipOpen(e, item)"
                @mouseleave="handleTooltipClose"
                >{{ item.usage_count }} Produk</span
              >
            </div>
          </div>

          <div class="flex gap-2 shrink-0">
            <MediaActionBar
              :image-url="item.status === 'COMPLETED' ? resolveUrl(item.main_path) : null"
              :filename="item.title"
              show-info
              show-delete
              :disable-delete="item.usage_count > 0"
              :class="viewMode === 'list' ? 'grid grid-cols-5' : 'grid grid-cols-3'"
              @info="openInfoModal(item)"
              @delete="deleteMedia(item.id, item.usage_count)"
            />
          </div>
        </template>

        <template v-else>
          <!-- Grid & Compact Mode Layout -->
          <div
            class="relative overflow-hidden cursor-pointer rounded-xl h-full flex flex-col"
            :class="[
              selectedMediaIds.has(item.id)
                ? 'bg-primary/10 border border-transparent'
                : 'bg-secondary/5 border border-transparent hover:border-secondary/30',
              viewMode === 'compact' ? 'p-0.5' : 'p-2'
            ]"
            @click="
              isSelectionMode
                ? toggleSelection(item)
                : item.status === 'COMPLETED'
                  ? ((isLightboxOpen = true), (lightboxIndex = index))
                  : null
            "
          >
            <MediaCard
              :image-url="resolveUrl(item.thumbnail_path || item.main_path)"
              :image-id="item.id"
              :display-name="item.title || 'Gambar'"
              :status="item.status"
              :selected="selectedMediaIds.has(item.id)"
              :selectable="isSelectionMode && item.status === 'COMPLETED'"
              :show-overlay="!isSelectionMode && viewMode !== 'compact'"
              class="w-full flex-1 !rounded-none !border-0 !shadow-none bg-transparent"
            >
              <template #actions>
                <MediaActionBar
                  :image-url="item.status === 'COMPLETED' ? resolveUrl(item.main_path) : null"
                  :filename="item.title"
                  show-info
                  show-delete
                  :disable-delete="item.usage_count > 0"
                  @info="openInfoModal(item)"
                  @delete="deleteMedia(item.id, item.usage_count)"
                />
              </template>

              <template #footer v-if="viewMode !== 'compact'">
                <div class="flex flex-wrap gap-1 justify-center px-1 max-h-[50px] overflow-hidden">
                  <span
                    v-for="tag in formatTags(item.tags).slice(0, 4)"
                    :key="tag"
                    class="border border-primary text-primary rounded-full px-2 py-0.5 text-[10px] font-semibold flex items-center justify-center h-5"
                  >
                    {{ tag }}
                  </span>
                  <span v-if="formatTags(item.tags).length > 4" class="text-[10px] opacity-70">...</span>
                </div>
              </template>

              <template #badges>
                <div class="absolute bottom-2 left-2 z-50">
                  <span
                    @mouseenter="e => handleTooltipOpen(e, item)"
                    @mouseleave="handleTooltipClose"
                    class="badge text-xs shadow-sm bg-background/80 px-2 py-1 rounded-lg border border-secondary cursor-help text-secondary font-bold transition-colors"
                    :class="
                      item.usage_count > 0
                        ? 'bg-primary/80 text-secondary hover:bg-primary'
                        : 'text-text hover:bg-secondary'
                    "
                    v-text="item.usage_count + ' Produk'"
                  >
                  </span>
                </div>
              </template>
            </MediaCard>
          </div>
        </template>
      </div>
    </div>

    <!-- Usage Tooltip -->
    <FloatingTooltip
      :show="isUsageTooltipVisible"
      :reference-el="usageTooltipTarget"
      placement="top"
      :show-arrow="true"
    >
      <template v-if="hoveredMediaItem?.linked_products">
        <ul class="list-disc list-inside text-xs space-y-1">
          <li
            v-for="prodName in hoveredMediaItem.linked_products.split('||').slice(0, 7)"
            :key="prodName"
            class="whitespace-normal break-words leading-tight"
          >
            {{ prodName }}
          </li>
        </ul>
        <div
          v-if="hoveredMediaItem.linked_products.split('||').length > 7"
          class="text-[10px] text-text/60 italic mt-2 pt-1 border-t border-secondary/30 text-center"
        >
          + {{ hoveredMediaItem.linked_products.split('||').length - 7 }} produk lainnya
        </div>
      </template>
      <p v-else class="text-xs">Memuat...</p>
    </FloatingTooltip>

    <!-- Loading State -->
    <div v-if="isLoading" class="flex justify-center py-10">
      <span class="loading loading-spinner text-primary"></span>
    </div>

    <!-- Empty State -->
    <div
      v-if="!isLoading && mediaList.length === 0"
      class="text-center py-12 bg-background rounded-xl border border-secondary border-dashed"
    >
      <div class="w-16 h-16 bg-secondary/50 shadow-inner rounded-full flex items-center justify-center mx-auto mb-4">
        <font-awesome-icon icon="fa-solid fa-images" class="text-2xl text-text/50" />
      </div>
      <h3 class="text-lg font-bold text-text">Belum ada aset</h3>
      <p class="text-text/60 text-sm mt-1 max-w-sm mx-auto">
        Upload gambar dari komputer Anda untuk mulai mengisi galeri media.
      </p>
    </div>
    <ImageCropperModal
      v-if="currentEditIndex !== -1 && currentEditFile"
      :show="isCropperOpen"
      :file="currentEditFile"
      @close="((isCropperOpen = false), (currentEditIndex = -1), (currentEditFile = null))"
      @save="handleCroppedSave"
    />
  </div>

  <!-- Pagination -->
  <div
    class="mt-4 border-secondary/50 border rounded-xl overflow-hidden bg-background"
    v-if="pagination.totalPages > 1"
  >
    <BasePagination
      :pagination="pagination"
      :show-limit-picker="true"
      @changePage="p => fetchMedia(p)"
      @update:limit="changePageSize"
    />
  </div>

  <!-- Bulk Upload Modal -->

  <Teleport to="body">
    <BaseModal
      :show="isBulkModalOpen"
      @close="isBulkModalOpen = false"
      maxWidth="max-w-4xl"
      height="h-[calc(80vh-100px)]"
      class="h-full"
    >
      <template #title>
        <div class="flex items-center justify-between w-full pr-4">
          <span class="font-bold text-xl font-display text-text">Unggah {{ selectedFiles.length }} Aset</span>
          <button
            @click="autoCropAll"
            :disabled="autoCropAllProcessing"
            title="Otomatis potong semua gambar menjadi rasio 1:1 di tengah"
            class="px-3 py-1 ml-4 text-sm rounded-lg bg-primary/10 text-primary hover:bg-primary/20 transition-colors flex items-center gap-2 font-medium"
          >
            <font-awesome-icon v-if="autoCropAllProcessing" icon="fa-solid fa-spinner" spin />
            <font-awesome-icon v-else icon="fa-solid fa-crop-simple" />
            <span class="hidden sm:inline">Auto 1:1 Semua</span>
          </button>
        </div>
      </template>

      <div
        class="mb-4 max-h-64 overflow-y-auto bg-secondary/10 rounded-lg p-3 border border-secondary custom-scrollbar"
      >
        <div class="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3">
          <div
            v-for="(file, index) in selectedFiles"
            :key="index"
            class="relative aspect-square rounded-lg overflow-hidden border border-secondary group bg-background shadow-sm"
          >
            <img :src="filePreviews[index]" class="w-full h-full object-cover" />

            <!-- Hover Overlay -->
            <div
              class="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-2 backdrop-blur-[2px]"
            >
              <button
                @click="openCropper(index)"
                class="w-8 h-8 rounded-full bg-primary text-background flex items-center justify-center hover:scale-110 transition-transform shadow-lg"
                title="Edit Gambar"
              >
                <font-awesome-icon icon="fa-solid fa-crop-simple" />
              </button>
              <button
                @click="removeSelectedFile(index)"
                class="w-8 h-8 rounded-full bg-danger text-white flex items-center justify-center hover:scale-110 transition-transform shadow-lg"
                title="Hapus"
              >
                <font-awesome-icon icon="fa-solid fa-trash-can" />
              </button>
            </div>

            <!-- Size indicator -->
            <div class="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-1">
              <p class="text-[10px] text-white text-center truncate px-1">{{ (file.size / 1024).toFixed(0) }} KB</p>
            </div>
          </div>
        </div>
      </div>

      <!-- Per-File Title Editing -->
      <div class="mb-4">
        <label class="block text-xs font-bold text-text/70 mb-2">
          <font-awesome-icon icon="fa-solid fa-pen" class="mr-1" />
          Nama File ({{ selectedFiles.length }})
        </label>
        <div class="max-h-40 overflow-y-auto space-y-2 custom-scrollbar">
          <div
            v-for="(file, index) in selectedFiles"
            :key="index"
            class="flex items-center gap-2 bg-secondary/10 rounded-lg p-1.5 border border-secondary/20"
          >
            <img :src="filePreviews[index]" class="w-8 h-8 rounded object-cover shrink-0 border border-secondary/30" />
            <input
              type="text"
              v-model="fileTitles[index]"
              class="flex-1 bg-background border border-secondary/30 rounded px-2 py-1 text-xs text-text focus:border-primary/50 focus:ring-1 focus:ring-primary/50 outline-none"
              :placeholder="file.name"
            />
          </div>
        </div>
      </div>

      <!-- Tautan Produk Otomatis (Autocomplete) -->
      <div class="form-control mb-4">
        <label class="label"><span class="label-text text-text font-semibold">Tautkan ke Produk</span></label>

        <!-- Selected Products Pills -->
        <div v-if="bulkSelectedProducts.length > 0" class="flex flex-wrap gap-2 mb-2">
          <div
            v-for="prod in bulkSelectedProducts"
            :key="prod.id"
            class="badge bg-primary/10 text-primary border-primary rounded-md gap-1 py-1 px-2"
          >
            <span class="max-w-[150px] truncate text-xs font-bold">{{ prod.sku }}</span>
            <button @click="removeBulkProduct(prod.id)" class="text-primary hover:text-danger ml-1 transition-colors">
              <font-awesome-icon icon="fa-solid fa-times" />
            </button>
          </div>
        </div>

        <!-- Search Input -->
        <div class="relative">
          <input
            type="text"
            v-model="bulkProductSearchQuery"
            class="input input-bordered border border-secondary bg-background rounded-md px-2 py-1 text-text w-full"
            placeholder="Ketik minimal 2 huruf untuk cari SKU / nama produk..."
          />
          <font-awesome-icon
            v-if="isBulkProductSearching"
            icon="fa-solid fa-spinner"
            spin
            class="absolute right-3 top-1/2 -translate-y-1/2 text-primary"
          />
          <font-awesome-icon
            v-else
            icon="fa-solid fa-search"
            class="absolute right-3 top-1/2 -translate-y-1/2 text-text/40"
          />

          <!-- Autocomplete Dropdown -->
          <div
            v-if="bulkProductSearchResults.length > 0 && bulkProductSearchQuery.length >= 2"
            class="absolute top-full left-0 w-full mt-1 bg-background border border-secondary rounded-lg shadow-2xl z-[60] max-h-[250px] overflow-y-auto custom-scrollbar"
          >
            <button
              v-for="prod in bulkProductSearchResults"
              :key="prod.id"
              @click="selectBulkProduct(prod)"
              class="w-full text-left p-3 hover:bg-primary/10 border-b border-secondary/20 last:border-b-0 flex flex-col transition-colors"
            >
              <div class="flex justify-between items-center w-full mb-1">
                <span class="font-bold text-sm text-text">{{ prod.sku }}</span>
                <span
                  v-if="prod.is_active === 0"
                  class="text-[10px] bg-danger/10 text-danger px-2 py-0.5 rounded font-bold"
                >
                  Arsip
                </span>
              </div>
              <span class="text-xs text-text/80">{{ prod.name }}</span>
            </button>
          </div>

          <div
            v-if="
              !isBulkProductSearching && bulkProductSearchQuery.length >= 2 && bulkProductSearchResults.length === 0
            "
            class="absolute top-full left-0 w-full mt-1 bg-background border border-secondary p-3 text-center text-xs text-text/60 rounded-lg shadow-xl z-[60]"
          >
            Produk tidak ditemukan.
          </div>
        </div>
      </div>

      <div class="form-control mb-4">
        <label class="label"><span class="label-text text-text">Global Tags</span></label>
        <input
          type="text"
          v-model="bulkTagsStr"
          class="input input-bordered border border-secondary bg-background rounded-md px-2 py-1 text-text w-full"
          placeholder="Ex: product, black, promo"
        />
        <label class="label">
          <span class="label-text-alt text-text/60"
            >Tag dipisahkan koma. Tag ini akan diaplikasikan merata ke seluruh berkas yang akan Anda unggah.</span
          >
        </label>
      </div>

      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <div v-if="isUploading" class="text-sm font-medium text-primary animate-pulse flex items-center mr-auto">
            <font-awesome-icon icon="fa-solid fa-spinner" spin class="mr-2" />
            {{ uploadProgress || 'Mempersiapkan unggahan...' }}
          </div>
          <button
            @click="isBulkModalOpen = false"
            class="px-4 py-2 rounded-lg bg-secondary text-text font-medium hover:brightness-95 transition-all text-center"
            :disabled="isUploading"
          >
            Batal
          </button>
          <button
            @click="executeBulkUpload"
            class="px-4 py-2 rounded-lg bg-primary text-background font-medium hover:bg-accent transition-colors min-w-[120px] text-center"
            :disabled="isUploading"
          >
            <font-awesome-icon v-if="isUploading" icon="fa-solid fa-spinner" spin />
            <span v-else> <font-awesome-icon icon="fa-solid fa-cloud-upload-alt" class="mr-2" /> Eksekusi </span>
          </button>
        </div>
      </template>
    </BaseModal>
  </Teleport>

  <MediaInfoModal
    :show="isInfoModalOpen"
    :mediaId="infoMediaId"
    @close="isInfoModalOpen = false"
    @refresh="fetchMedia(pagination.page, true)"
  />

  <MediaLightbox
    :show="isLightboxOpen"
    :images="mediaList"
    :initialIndex="lightboxIndex"
    @close="isLightboxOpen = false"
  />

  <LinkProductModal
    :show="isLinkProductModalOpen"
    :selectedMediaIds="Array.from(selectedMediaIds)"
    @close="isLinkProductModalOpen = false"
    @linked="(fetchMedia(pagination.page, true), toggleSelectionMode())"
  />

  <BulkLinkMediaModal
    :show="isBulkLinkMediaModalOpen"
    @close="isBulkLinkMediaModalOpen = false"
    @uploaded="fetchMedia(pagination.page, true)"
  />

  <BulkEditTagsModal
    :show="isBulkEditTagsModalOpen"
    :selectedMediaIds="Array.from(selectedMediaIds)"
    @close="isBulkEditTagsModalOpen = false"
    @updated="(fetchMedia(pagination.page, true), toggleSelectionMode())"
  />

  <ImageCropperModal
    :show="isCropperOpen"
    :file="currentEditFile"
    @close="isCropperOpen = false"
    @save="handleCroppedSave"
  />
</template>

<style scoped>
@keyframes fadeInUp {
  from {
    opacity: 0;
    transform: translate(-50%, 20px);
  }

  to {
    opacity: 1;
    transform: translate(-50%, 0);
  }
}

.animate-fade-in-up {
  animation: fadeInUp 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards;
}
</style>

