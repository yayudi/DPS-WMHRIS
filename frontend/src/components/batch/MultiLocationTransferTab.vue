<!-- frontend\src\components\batch\MultiLocationTransferTab.vue -->
<script setup>
import { ref, computed } from 'vue'
import { useToast } from '@/composables/UseToast.js'
import { fetchProductStockDetails, searchProducts } from '@/api/helpers/products.js'
import { processBatchMovement } from '@/api/helpers/stock.js'
import Multiselect from 'vue-multiselect'

const props = defineProps({
  allLocations: { type: Array, required: true },
  isLoadingLocations: { type: Boolean, default: false },
})

const { show } = useToast()

// --- STATE DAFTAR BATCH ---
const batchList = ref([])
const notes = ref('')
const isSubmitting = ref(false)

// --- STATE FORM PENAMBAHAN ---
const searchResults = ref([])
const isSearching = ref(false)
const selectedProduct = ref(null)

const stockDetails = ref([]) // Stok untuk produk yang dipilih
const isLoadingDetails = ref(false)

const fromLocation = ref(null)
const toLocation = ref(null)
const quantity = ref(1)

let searchDebounceTimer = null

// --- FUNGSI FORM PENAMBAHAN ---

function onSearchChange(query) {
  clearTimeout(searchDebounceTimer)
  stockDetails.value = [] // Kosongkan detail stok saat mencari produk baru
  fromLocation.value = null
  if (query.length < 2) {
    searchResults.value = []
    return
  }
  isSearching.value = true
  searchDebounceTimer = setTimeout(async () => {
    try {
      searchResults.value = await searchProducts(query, null)
    } catch (error) {
      show('Gagal mencari produk.', 'error')
    } finally {
      isSearching.value = false
    }
  }, 500)
}

async function onProductSelect(product) {
  if (!product) {
    stockDetails.value = []
    return
  }
  selectedProduct.value = product
  isLoadingDetails.value = true
  try {
    stockDetails.value = await fetchProductStockDetails(product.id)
  } catch (error) {
    show('Gagal memuat detail stok produk.', 'error')
  } finally {
    isLoadingDetails.value = false
  }
}

function validateQuantity() {
  if (!fromLocation.value) return
  const maxQty = fromLocation.value.quantity
  if (quantity.value > maxQty) {
    quantity.value = maxQty
    show(`Kuantitas tidak boleh melebihi stok di lokasi asal (${maxQty}).`, 'warning')
  }
  if (quantity.value < 1) {
    quantity.value = 1
  }
}

// --- FUNGSI BATCH ---

function addItemToBatch() {
  if (!selectedProduct.value || !fromLocation.value || !toLocation.value || quantity.value < 1) {
    show('Harap lengkapi Produk, Lokasi Asal, Lokasi Tujuan, dan Kuantitas.', 'warning')
    return
  }
  if (fromLocation.value.location_id === toLocation.value.id) {
    show('Lokasi asal dan tujuan tidak boleh sama.', 'error')
    return
  }
  if (quantity.value > fromLocation.value.quantity) {
    show('Kuantitas melebihi stok yang tersedia.', 'error')
    return
  }

  // Cek duplikat (SKU, Dari, Ke)
  const existing = batchList.value.find(
    (item) =>
      item.sku === selectedProduct.value.sku &&
      item.fromLocationId === fromLocation.value.location_id &&
      item.toLocationId === toLocation.value.id,
  )

  if (existing) {
    existing.quantity += quantity.value
  } else {
    batchList.value.push({
      id: crypto.randomUUID(), // ID unik untuk key v-for
      sku: selectedProduct.value.sku,
      name: selectedProduct.value.name,
      fromLocationId: fromLocation.value.location_id,
      fromLocationCode: fromLocation.value.location_code,
      toLocationId: toLocation.value.id,
      toLocationCode: toLocation.value.code,
      quantity: quantity.value,
    })
  }

  // Reset form penambahan
  selectedProduct.value = null
  searchResults.value = []
  stockDetails.value = []
  fromLocation.value = null
  toLocation.value = null
  quantity.value = 1
}

function removeFromBatch(id) {
  batchList.value = batchList.value.filter((item) => item.id !== id)
}

async function submitDetailedBatch() {
  if (batchList.value.length === 0) {
    show('Tambahkan setidaknya satu item ke daftar transfer.', 'error')
    return
  }

  isSubmitting.value = true
  try {
    const payload = {
      // Kita set type 'TRANSFER', karena ini adalah batch transfer
      type: 'TRANSFER_MULTI',
      notes: notes.value,
      // API /batch-process universal akan menerima ID lokasi di dalam movements
      movements: batchList.value.map((item) => ({
        sku: item.sku,
        quantity: item.quantity,
        fromLocationId: item.fromLocationId,
        toLocationId: item.toLocationId,
      })),
    }

    const response = await processBatchMovement(payload)
    show(response.message, 'success')

    // Reset total
    batchList.value = []
    notes.value = ''
  } catch (error) {
    show(error.message || 'Gagal memproses batch transfer.', 'error')
  } finally {
    isSubmitting.value = false
  }
}
</script>

<template>
  <div class="space-y-6">
    <!-- Form Penambahan Item Baru -->
    <div
      class="grid grid-cols-1 md:grid-cols-5 gap-4 items-end p-4 border border-secondary/20 rounded-lg"
    >
      <!-- 1. Cari Produk -->
      <div class="md:col-span-2">
        <label class="block text-sm font-medium text-text/90 mb-2">1. Cari Produk</label>
        <Multiselect
          v-model="selectedProduct"
          :options="searchResults"
          :loading="isSearching"
          :internal-search="false"
          @search-change="onSearchChange"
          @select="onProductSelect"
          placeholder="Ketik SKU atau Nama..."
          label="name"
          track-by="id"
        >
          <template #option="{ option }">
            <div>
              {{ option.name }} <span class="text-xs text-text/60">({{ option.sku }})</span>
            </div>
          </template>
        </Multiselect>
      </div>

      <!-- 2. Pindahkan Dari -->
      <div>
        <label class="block text-sm font-medium text-text/90 mb-2">2. Pindahkan Dari</label>
        <Multiselect
          v-model="fromLocation"
          :options="stockDetails"
          :loading="isLoadingDetails"
          :disabled="!selectedProduct || isLoadingDetails"
          label="location_code"
          track-by="location_id"
          placeholder="Pilih asal"
        >
          <template #option="{ option }">
            <div class="flex justify-between">
              <span>{{ option.location_code }}</span>
              <span class="font-bold">Stok: {{ option.quantity }}</span>
            </div>
          </template>
          <template #noResult>Stok tidak ditemukan.</template>
        </Multiselect>
      </div>

      <!-- 3. Ke Lokasi -->
      <div>
        <label class="block text-sm font-medium text-text/90 mb-2">3. Ke Lokasi</label>
        <Multiselect
          v-model="toLocation"
          :options="allLocations"
          :disabled="isLoadingLocations"
          label="code"
          track-by="id"
          placeholder="Pilih tujuan"
        ></Multiselect>
      </div>

      <!-- 4. Jumlah & Tombol Tambah -->
      <div class="flex items-end gap-2">
        <div class="flex-grow">
          <label class="block text-sm font-medium text-text/90 mb-2">4. Jumlah</label>
          <input
            v-model.number="quantity"
            @blur="validateQuantity"
            type="number"
            min="1"
            :max="fromLocation ? fromLocation.quantity : undefined"
            class="w-full p-2 border border-secondary/50 rounded-lg bg-background"
            :disabled="!fromLocation"
          />
        </div>
        <button
          @click="addItemToBatch"
          class="px-4 py-2 bg-primary text-white rounded-lg font-semibold h-[42px] disabled:opacity-50"
          :disabled="!selectedProduct || !fromLocation || !toLocation || quantity < 1"
        >
          <font-awesome-icon icon="fa-solid fa-plus" />
        </button>
      </div>
    </div>

    <!-- Tabel Daftar Batch (Item yang akan ditransfer) -->
    <div class="border-t border-secondary/20 pt-6">
      <h3 class="text-lg font-semibold text-text mb-4">
        Daftar Transfer Rinci ({{ batchList.length }})
      </h3>
      <div
        v-if="batchList.length === 0"
        class="text-center text-text/60 py-8 border-2 border-dashed border-secondary/20 rounded-lg"
      >
        Belum ada item yang ditambahkan.
      </div>
      <div v-else class="max-h-96 overflow-y-auto">
        <table class="min-w-full text-sm">
          <thead class="bg-secondary/10">
            <tr>
              <th class="p-2 text-left">SKU</th>
              <th class="p-2 text-left">Nama Produk</th>
              <th class="p-2 text-left">Dari</th>
              <th class="p-2 text-left">Ke</th>
              <th class="p-2 text-center">Jumlah</th>
              <th class="p-2 text-center">Aksi</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-secondary/20">
            <tr v-for="item in batchList" :key="item.id" class="hover:bg-primary/5">
              <td class="p-2 font-mono">{{ item.sku }}</td>
              <td class="p-2">{{ item.name }}</td>
              <td class="p-2 font-mono">{{ item.fromLocationCode }}</td>
              <td class="p-2 font-mono">{{ item.toLocationCode }}</td>
              <td class="p-2 text-center font-bold">{{ item.quantity }}</td>
              <td class="p-2 text-center">
                <button @click="removeFromBatch(item.id)" class="text-accent hover:text-accent/80">
                  <font-awesome-icon icon="fa-solid fa-trash" />
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Catatan & Tombol Aksi Final -->
    <div class="flex justify-between items-end pt-6 border-t border-secondary/20 gap-4">
      <!-- Input Catatan -->
      <div class="flex-grow">
        <label class="block text-sm font-medium text-text/90 mb-2">Catatan (Opsional)</label>
        <input
          v-model="notes"
          type="text"
          placeholder="e.g., Transfer batch multi-lokasi"
          class="w-full p-2 border border-secondary/50 rounded-lg bg-background"
        />
      </div>

      <!-- Tombol Aksi -->
      <div class="flex gap-4">
        <button
          @click="batchList = []"
          :disabled="isSubmitting || batchList.length === 0"
          class="px-6 py-3 bg-secondary/20 text-text/80 rounded-lg font-bold disabled:opacity-50"
        >
          Batal
        </button>
        <button
          @click="submitDetailedBatch"
          :disabled="isSubmitting || batchList.length === 0"
          class="px-6 py-3 bg-accent text-white rounded-lg font-bold disabled:opacity-50 flex items-center gap-2"
        >
          <font-awesome-icon
            vid-if="isSubmitting"
            icon="fa-solid fa-spinner"
            class="animate-spin"
          />
          <span>{{ isSubmitting ? 'Memproses...' : 'Submit Batch Transfer' }}</span>
        </button>
      </div>
    </div>
  </div>
</template>
