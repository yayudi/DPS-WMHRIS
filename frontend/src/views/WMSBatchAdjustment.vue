<script setup>
import { ref, onMounted, computed } from 'vue'
import { useToast } from '@/composables/UseToast.js'
import { fetchMyLocations } from '@/api/helpers/user.js'
import { processBatchMovement } from '@/api/helpers/stock.js'
import { useAuthStore } from '@/stores/auth.js' // Import auth store

// Impor komponen anak
// ✅ 1. UBAH: Pastikan Anda mengimpor header yang BENAR
import BatchAdjustmentHeader from '@/components/batch/BatchAdjustmentHeader.vue'
import ProductSearchAddForm from '@/components/batch/ProductSearchAddForm.vue'
import BatchItemList from '@/components/batch/BatchItemList.vue'

const { show } = useToast()
const auth = useAuthStore() // Inisialisasi auth store

// --- STATE UTAMA ---
const myLocations = ref([])
const isLoading = ref(false)
const batchList = ref([])

// --- STATE FORM BATCH (untuk header) ---
const adjustmentLocation = ref(null)
const notes = ref('')

// Ambil data lokasi
onMounted(async () => {
  isLoading.value = true
  try {
    // Untuk adjustment, kita HANYA perlu 'myLocations'
    myLocations.value = await fetchMyLocations()
  } catch (error) {
    show('Gagal memuat data lokasi.', 'error')
  } finally {
    isLoading.value = false
  }
})

// --- Computed & Handler ---
const isBatchLocationSelected = computed(() => {
  return adjustmentLocation.value
})

const batchSearchLocationId = computed(() => {
  return adjustmentLocation.value?.id
})

function handleAddProduct({ product, quantity }) {
  if (!product || !quantity) {
    show('Pilih produk dan masukkan kuantitas yang valid.', 'warning')
    return
  }
  if (quantity === 0) {
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
    show('Harap lengkapi lokasi dan tambahkan setidaknya satu item.', 'error')
    return
  }
  if (!notes.value.trim()) {
    show('Catatan/alasan wajib diisi untuk penyesuaian stok.', 'error')
    return
  }

  isLoading.value = true
  try {
    const payload = {
      type: 'ADJUSTMENT', // Tipe di-hardcode
      fromLocationId: null,
      toLocationId: adjustmentLocation.value?.id || null,
      notes: notes.value,
      movements: batchList.value.map(({ sku, quantity }) => ({ sku, quantity })),
    }

    const response = await processBatchMovement(payload)

    if (response.success) {
      show(response.message, 'success')
      // Reset form
      batchList.value = []
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
      <h2 class="text-2xl font-bold text-text">Stock Adjustment (Batch)</h2>
      <!-- ✅ 2. Tambahkan Link "Kembali" -->
      <router-link to="/wms" class="text-sm font-medium text-primary hover:underline">
        &larr; Kembali ke Dasbor WMS
      </router-link>
    </div>

    <div class="bg-background rounded-xl shadow-md border border-secondary/20 p-6 space-y-6">
      <!-- ✅ 3. Panggil Komponen Header yang BENAR -->
      <BatchAdjustmentHeader
        v-model:adjustmentLocation="adjustmentLocation"
        v-model:notes="notes"
        :my-locations="myLocations"
        :is-loading="isLoading"
      />

      <!-- ✅ 4. Tampilkan sisa UI (sudah benar) -->
      <!-- HAPUS <template> yang tidak perlu di sini -->
      <!-- Form Penambahan Item Batch -->
      <ProductSearchAddForm
        active-tab="ADJUSTMENT"
        :search-location-id="batchSearchLocationId"
        :disabled="!isBatchLocationSelected || isLoading"
        @add-product="handleAddProduct"
      />

      <!-- Tabel Daftar Batch -->
      <BatchItemList :items="batchList" active-tab="ADJUSTMENT" @remove-item="removeFromBatch" />

      <!-- Tombol Aksi Final Batch -->
      <div class="flex justify-end pt-6 border-t border-secondary/20">
        <button
          @click="submitBatch"
          :disabled="!isBatchLocationSelected || batchList.length === 0 || isLoading"
          class="px-6 py-3 bg-accent text-white rounded-lg font-bold disabled:opacity-50 flex items-center gap-2"
        >
          <font-awesome-icon v-if="isLoading" icon="fa-solid fa-spinner" class="animate-spin" />
          <span>{{ isLoading ? 'Memproses...' : 'Submit Batch Adjustment' }}</span>
        </button>
      </div>
      <!-- HAPUS </template> yang tidak perlu di sini -->
    </div>
  </div>
</template>
