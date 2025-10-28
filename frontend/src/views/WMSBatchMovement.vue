<!-- frontend\src\views\WMSBatchMovement.vue -->
<script setup>
import { ref, onMounted, computed } from 'vue'
import { useToast } from '@/composables/UseToast.js'
import { fetchAllLocations } from '@/api/helpers/stock.js'
import { fetchMyLocations } from '@/api/helpers/user.js'
import { processBatchMovement } from '@/api/helpers/stock.js'

// Impor komponen anak
import BatchMovementHeader from '@/components/batch/BatchMovementHeader.vue'
import ProductSearchAddForm from '@/components/batch/ProductSearchAddForm.vue'
import BatchItemList from '@/components/batch/BatchItemList.vue'
import MultiLocationTransferTab from '@/components/batch/MultiLocationTransferTab.vue'

const { show } = useToast()

// --- STATE UTAMA ---
const myLocations = ref([])
const allLocations = ref([])
const isLoading = ref(false)
const activeTab = ref('TRANSFER') // Tab default
const batchList = ref([])

// --- STATE FORM BATCH (untuk header) ---
const fromLocation = ref(null)
const toLocation = ref(null)
const adjustmentLocation = ref(null)
const notes = ref('')

// Ambil data lokasi (diperlukan oleh KEDUA mode, Batch & Detailed)
onMounted(async () => {
  isLoading.value = true
  try {
    // Kita butuh `allLocations` untuk 'Detailed Transfer'
    // Kita butuh `myLocations` & `allLocations` untuk 'Batch'
    const [myLocs, allLocs] = await Promise.all([fetchMyLocations(), fetchAllLocations()])
    myLocations.value = myLocs
    allLocations.value = allLocs
  } catch (error) {
    show('Gagal memuat data lokasi.', 'error')
  } finally {
    isLoading.value = false
  }
})

// --- Computed & Handler untuk Mode BATCH ---
const isBatchLocationSelected = computed(() => {
  switch (activeTab.value) {
    case 'TRANSFER':
      return fromLocation.value && toLocation.value
    case 'INBOUND':
    case 'SALE_RETURN':
      return toLocation.value
    case 'ADJUSTMENT':
      return adjustmentLocation.value
    default:
      return false
  }
})

const batchSearchLocationId = computed(() => {
  if (activeTab.value === 'TRANSFER') return fromLocation.value?.id
  if (activeTab.value === 'ADJUSTMENT') return adjustmentLocation.value?.id
  return null
})

function handleAddProduct({ product, quantity }) {
  if (!product || !quantity) {
    show('Pilih produk dan masukkan kuantitas yang valid.', 'warning')
    return
  }
  if (activeTab.value === 'ADJUSTMENT' && quantity === 0) {
    show('Kuantitas penyesuaian tidak boleh nol.', 'warning')
    return
  }

  const existing = batchList.value.find((item) => item.sku === product.sku)
  if (existing) {
    existing.quantity += quantity
  } else {
    batchList.value.push({
      sku: product.sku,
      name: product.name,
      current_stock: product.current_stock,
      quantity: quantity,
    })
  }
}

function removeFromBatch(sku) {
  batchList.value = batchList.value.filter((item) => item.sku !== sku)
}

async function submitBatch() {
  if (!isBatchLocationSelected.value || batchList.value.length === 0) {
    show('Harap lengkapi semua field dan tambahkan setidaknya satu item.', 'error')
    return
  }
  if (activeTab.value === 'ADJUSTMENT' && !notes.value.trim()) {
    show('Catatan/alasan wajib diisi untuk penyesuaian stok.', 'error')
    return
  }

  isLoading.value = true
  try {
    const payload = {
      type: activeTab.value,
      fromLocationId: fromLocation.value?.id || null,
      toLocationId:
        activeTab.value === 'ADJUSTMENT'
          ? adjustmentLocation.value?.id
          : toLocation.value?.id || null,
      notes: notes.value,
      movements: batchList.value.map(({ sku, quantity }) => ({ sku, quantity })),
    }

    const response = await processBatchMovement(payload)

    if (response.success) {
      show(response.message, 'success')
      // Reset form
      batchList.value = []
      fromLocation.value = null
      toLocation.value = null
      adjustmentLocation.value = null
      notes.value = ''
    }
  } catch (error) {
    show(error.message || 'Terjadi kesalahan saat submit batch.', 'error')
  } finally {
    isLoading.value = false
  }
}
</script>

<template>
  <div class="p-6">
    <div class="flex justify-between items-center mb-4">
      <h2 class="text-2xl font-bold text-text">Stock Movement Actions</h2>
    </div>

    <div class="bg-background rounded-xl shadow-md border border-secondary/20 p-6 space-y-6">
      <!-- 1. Komponen Header (Tabs + Form Lokasi Batch) -->
      <!-- Ini akan secara internal HANYA menampilkan form lokasi jika tab BUKAN 'DETAILED_TRANSFER' -->
      <BatchMovementHeader
        v-model:activeTab="activeTab"
        v-model:fromLocation="fromLocation"
        v-model:toLocation="toLocation"
        v-model:adjustmentLocation="adjustmentLocation"
        v-model:notes="notes"
        :my-locations="myLocations"
        :all-locations="allLocations"
        :is-loading="isLoading"
      />

      <!-- 2. Panel Konten -->

      <!-- Panel untuk 'DETAILED_TRANSFER' -->
      <MultiLocationTransferTab
        v-if="activeTab === 'DETAILED_TRANSFER'"
        :all-locations="allLocations"
        :is-loading-locations="isLoading"
      />

      <!-- Panel untuk semua mode 'BATCH' ('TRANSFER', 'INBOUND', 'ADJUSTMENT') -->
      <template v-else>
        <!-- Form Penambahan Item Batch -->
        <ProductSearchAddForm
          :active-tab="activeTab"
          :search-location-id="batchSearchLocationId"
          :disabled="!isBatchLocationSelected || isLoading"
          @add-product="handleAddProduct"
        />

        <!-- Tabel Daftar Batch -->
        <BatchItemList :items="batchList" :active-tab="activeTab" @remove-item="removeFromBatch" />

        <!-- Tombol Aksi Final Batch -->
        <div class="flex justify-end pt-6 border-t border-secondary/20">
          <button
            @click="submitBatch"
            :disabled="!isBatchLocationSelected || batchList.length === 0 || isLoading"
            class="px-6 py-3 bg-accent text-white rounded-lg font-bold disabled:opacity-50 flex items-center gap-2"
          >
            <font-awesome-icon v-if="isLoading" icon="fa-solid fa-spinner" class="animate-spin" />
            <span>{{ isLoading ? 'Memproses...' : 'Submit Batch' }}</span>
          </button>
        </div>
      </template>
    </div>
  </div>
</template>
