<!-- frontend\src\views\WMSBatchMovement.vue -->
<script setup>
import { ref, onMounted, computed, watch, defineAsyncComponent } from 'vue'
import { useMagicKeys, useLocalStorage } from '@vueuse/core'
import { useToast } from '@/composables/useToast.js'
import { fetchMyLocations } from '@/api/helpers/user.js'
import { useMasterDataStore } from '@/stores/masterData'
import { swalConfirm } from '@/composables/useSweetAlert'
import { useBatchClipboard } from '@/composables/useBatchClipboard'
import { processBatchMovement } from '@/api/helpers/stock.js'
import BatchMovementHeader from '@/components/wms/transfer/BatchMovementHeader.vue'
import ProductSearchAddForm from '@/components/wms/transfer/ProductSearchAddForm.vue'
import BatchItemList from '@/components/wms/transfer/BatchItemList.vue'
import MultiLocationTransferTab from '@/components/wms/transfer/MultiLocationTransferTab.vue'
import BatchInboundModal from '@/components/stock/BatchInboundModal.vue'

const masterData = useMasterDataStore()
const { copyBatchToClipboard } = useBatchClipboard()
const StickerGeneratorModal = defineAsyncComponent(() => import('@/components/utilities/StickerGeneratorModal.vue'))

const { toast } = useToast()

// --- STATE UTAMA ---
const myLocations = ref([])
const allLocations = ref([])
const isLoading = ref(false)
const activeTab = useLocalStorage('draft-bm-tab', 'TRANSFER') // Tab default
const batchList = useLocalStorage('draft-bm-batch', [])
const isBatchInboundModalOpen = ref(false)
const isStickerModalOpen = ref(false)
const detailedTransferTabRef = ref(null)

const { Alt_S } = useMagicKeys()

watch(Alt_S, pressed => {
  if (pressed) {
    if (isBatchInboundModalOpen.value || isStickerModalOpen.value) return

    if (activeTab.value === 'DETAILED_TRANSFER') {
      if (detailedTransferTabRef.value) {
        detailedTransferTabRef.value.submitDetailedBatch()
      }
    } else {
      if (isBatchLocationSelected.value && batchList.value.length > 0 && !isLoading.value) {
        submitBatch()
      }
    }
  }
})

// --- STATE FORM BATCH (untuk header) ---
const objectSerializer = {
  read: v => {
    try {
      return v === 'null' || !v ? null : JSON.parse(v)
    } catch {
      return null
    }
  },
  write: v => JSON.stringify(v)
}

const fromLocation = useLocalStorage('draft-bm-from', null, { serializer: objectSerializer })
const toLocation = useLocalStorage('draft-bm-to', null, { serializer: objectSerializer })
const notes = useLocalStorage('draft-bm-notes', '')

// Ambil data lokasi
onMounted(async () => {
  isLoading.value = true
  try {
    const [myLocs, allLocs] = await Promise.all([fetchMyLocations(), masterData.getLocations(true)])
    myLocations.value = myLocs
    allLocations.value = allLocs
  } catch (e) {
    console.error(e)
  } finally {
    isLoading.value = false
  }
})

let isRevertingTab = false
watch(activeTab, async (newVal, oldVal) => {
  if (isRevertingTab) {
    isRevertingTab = false
    return
  }

  let hasData = false
  if (oldVal === 'DETAILED_TRANSFER') {
    hasData = detailedTransferTabRef.value?.hasData() || false
  } else {
    hasData = batchList.value.length > 0
  }

  if (hasData && newVal && oldVal && newVal !== oldVal) {
    const isConfirmed = await swalConfirm(
      'Pindah Tab?',
      'Mengubah tab akan mereset seluruh data yang sudah di-input. Yakin?',
      'Ya, Pindah',
      'Batal'
    )
    if (isConfirmed) {
      if (oldVal === 'DETAILED_TRANSFER' && detailedTransferTabRef.value) {
        detailedTransferTabRef.value.resetData()
      } else {
        batchList.value = []
      }
    } else {
      isRevertingTab = true
      activeTab.value = oldVal
    }
  }
})

let isRevertingFromLocation = false
watch(fromLocation, async (newVal, oldVal) => {
  if (isRevertingFromLocation) {
    isRevertingFromLocation = false
    return
  }
  if (batchList.value.length > 0 && newVal && oldVal && newVal.id !== oldVal.id) {
    const isConfirmed = await swalConfirm(
      'Reset Daftar Produk?',
      'Mengubah lokasi asal akan mereset seluruh daftar produk yang sudah dipilih. Yakin?',
      'Ya, Reset',
      'Batal'
    )
    if (isConfirmed) {
      batchList.value = []
    } else {
      isRevertingFromLocation = true
      fromLocation.value = oldVal
    }
  }
})

let isRevertingToLocation = false
watch(toLocation, async (newVal, oldVal) => {
  if (isRevertingToLocation) {
    isRevertingToLocation = false
    return
  }
  if (batchList.value.length > 0 && newVal && oldVal && newVal.id !== oldVal.id) {
    const isConfirmed = await swalConfirm(
      'Reset Daftar Produk?',
      'Mengubah lokasi tujuan akan mereset seluruh daftar produk yang sudah dipilih. Yakin?',
      'Ya, Reset',
      'Batal'
    )
    if (isConfirmed) {
      batchList.value = []
    } else {
      isRevertingToLocation = true
      toLocation.value = oldVal
    }
  }
})

// --- Computed & Handler ---
const isBatchLocationSelected = computed(() => {
  switch (activeTab.value) {
    case 'TRANSFER':
      return fromLocation.value && toLocation.value
    case 'INBOUND':
    case 'RETURN':
      return toLocation.value
    default:
      return false
  }
})

const batchSearchLocationId = computed(() => {
  if (activeTab.value === 'TRANSFER') return fromLocation.value?.id
  return null
})

function handleAddProduct({ product, quantity }) {
  if (!product || !quantity) {
    toast('Pilih produk dan masukkan kuantitas yang valid.', 'warning')
    return
  }

  const existing = batchList.value.find(item => item.sku === product.sku)
  if (existing) {
    existing.quantity += quantity
  } else {
    batchList.value.push({
      _id: Date.now() + Math.random(),
      sku: product.sku,
      name: product.name,
      current_stock: product.current_stock ?? 0,
      price: product.price,
      quantity: quantity
    })
  }
}

async function copyFromSku() {
  await copyBatchToClipboard(
    batchList.value,
    item =>
      `${item.sku}\t${item.name}\t${fromLocation.value?.code || ''}\t${toLocation.value?.code || ''}\t${item.quantity}`,
    'Daftar transfer berhasil disalin ke clipboard.'
  )
}

function removeFromBatch(index) {
  batchList.value.splice(index, 1)
}

function duplicateFromBatch(index) {
  const item = batchList.value[index]
  if (item) {
    batchList.value.splice(index + 1, 0, { ...item, _id: Date.now() + Math.random() })
  }
}

async function submitBatch() {
  if (!isBatchLocationSelected.value || batchList.value.length === 0) {
    return
  }

  isLoading.value = true
  try {
    const payload = {
      type: activeTab.value,
      fromLocationId: fromLocation.value?.id || null,
      toLocationId: toLocation.value?.id || null,
      notes: notes.value,
      movements: batchList.value.map(({ sku, quantity }) => ({ sku, quantity }))
    }

    const response = await processBatchMovement(payload)

    if (response.success) {
      toast(response.message, 'success')
      // Reset form
      batchList.value = []
      fromLocation.value = null
      toLocation.value = null
      notes.value = ''
    }
  } catch (error) {
    console.error(error)
  } finally {
    isLoading.value = false
  }
}
</script>

<template>
  <div class="animate-fade-in text-text">
    <!-- Komponen Header (Tabs + Form Lokasi Batch) -->
    <BatchMovementHeader
      v-model:activeTab="activeTab"
      v-model:fromLocation="fromLocation"
      v-model:toLocation="toLocation"
      v-model:notes="notes"
      :my-locations="myLocations"
      :all-locations="allLocations"
      :is-loading="isLoading"
      :allow-adjustment="false"
    />

    <!-- Panel Konten -->
    <MultiLocationTransferTab
      v-if="activeTab === 'DETAILED_TRANSFER'"
      ref="detailedTransferTabRef"
      :all-locations="allLocations"
      :is-loading-locations="isLoading"
    />

    <!-- Panel untuk semua mode 'BATCH' ('TRANSFER', 'INBOUND') -->
    <template v-else>
      <!-- Form Penambahan Item Batch -->
      <ProductSearchAddForm
        :active-tab="activeTab"
        :search-location-id="batchSearchLocationId"
        :disabled="!isBatchLocationSelected || isLoading"
        @add-product="handleAddProduct"
      />

      <!-- Tabel Daftar Batch -->
      <BatchItemList
        :items="batchList"
        :active-tab="activeTab"
        @remove-item="removeFromBatch"
        @duplicate-item="duplicateFromBatch"
      />

      <!-- Tombol Aksi Final Batch -->
      <div class="flex justify-end pt-6 border-t border-secondary/20 gap-2">
        <button
          v-if="activeTab === 'INBOUND'"
          @click="isBatchInboundModalOpen = true"
          class="bg-success/5 text-success border border-success/30 px-4 py-2 rounded-lg font-semibold text-sm hover:bg-success hover:text-background flex items-center gap-2 transition-all"
        >
          <font-awesome-icon icon="fa-solid fa-file-import" />
          <span>Import Massal</span>
        </button>
        <button
          v-if="activeTab === 'INBOUND'"
          @click="isStickerModalOpen = true"
          :disabled="batchList.length === 0"
          class="px-6 py-3 bg-secondary text-text rounded-lg font-bold disabled:opacity-50 border border-primary/20 hover:border-primary flex items-center gap-2"
        >
          <font-awesome-icon icon="fa-solid fa-print" />
          <span>Cetak Label Barang Masuk</span>
        </button>
        <button
          @click="copyFromSku()"
          :disabled="isLoading || batchList.length === 0"
          class="px-6 py-3 bg-accent text-secondary rounded-lg font-bold disabled:opacity-50"
        >
          <font-awesome-icon icon="fa-solid fa-copy" />
          <span>Salin Daftar</span>
        </button>
        <button
          @click="submitBatch"
          :disabled="!isBatchLocationSelected || batchList.length === 0 || isLoading"
          class="px-6 py-3 bg-primary text-secondary rounded-lg font-bold disabled:opacity-50 flex items-center gap-2 group"
        >
          <font-awesome-icon v-if="isLoading" icon="fa-solid fa-spinner" class="animate-spin" />
          <span>{{ isLoading ? 'Memproses...' : 'Submit Batch' }}</span>
          <kbd
            v-if="!isLoading"
            class="hidden md:inline-block ml-1 px-1.5 py-0.5 text-[10px] bg-secondary/20 text-secondary border border-secondary/30 rounded font-mono shadow-sm group-hover:bg-secondary/30 transition-colors"
            >Alt+S</kbd
          >
        </button>
      </div>
    </template>
  </div>

  <BatchInboundModal
    :isOpen="isBatchInboundModalOpen"
    @close="isBatchInboundModalOpen = false"
    @success="() => toast('Batch Inbound diproses!', 'success')"
  />

  <StickerGeneratorModal :show="isStickerModalOpen" @close="isStickerModalOpen = false" :initial-batch="batchList" />
</template>
