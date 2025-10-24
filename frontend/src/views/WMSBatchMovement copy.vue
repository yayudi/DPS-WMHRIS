<!-- frontend\src\views\WMSBatchMovement.vue -->
<script setup>
import { ref, onMounted, computed } from 'vue'
import { useToast } from '@/composables/UseToast.js'
import Multiselect from 'vue-multiselect'
import { fetchAllLocations } from '@/api/helpers/stock.js'
import { fetchMyLocations } from '@/api/helpers/user.js'
import { searchProducts } from '@/api/helpers/products.js'
import { processBatchMovement } from '@/api/helpers/stock.js'
import Tabs from '@/components/Tabs.vue'

const { show } = useToast()

// --- STATE UTAMA ---
const myLocations = ref([])
const allLocations = ref([])
const isLoading = ref(false)
const activeTab = ref('TRANSFER') // Tab default

// --- STATE FORM ---
const fromLocation = ref(null)
const toLocation = ref(null)
const adjustmentLocation = ref(null)
const notes = ref('')
const searchResults = ref([])
const isSearching = ref(false)
const selectedProduct = ref(null)
const quantityToAdd = ref(1)
const batchList = ref([])

let searchDebounceTimer = null

// Ambil data lokasi saat komponen dimuat
onMounted(async () => {
  isLoading.value = true
  try {
    const [myLocs, allLocs] = await Promise.all([fetchMyLocations(), fetchAllLocations()])
    myLocations.value = myLocs
    allLocations.value = allLocs
  } catch (error) {
    show('Gagal memuat data lokasi.', 'error')
  } finally {
    isLoading.value = false
  }
})

// Computed property untuk menentukan apakah form lokasi valid
const isLocationSelected = computed(() => {
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

function onSearchChange(query) {
  clearTimeout(searchDebounceTimer)
  if (query.length < 2) {
    searchResults.value = []
    return
  }
  isSearching.value = true
  searchDebounceTimer = setTimeout(async () => {
    try {
      const locationId =
        activeTab.value === 'TRANSFER' || activeTab.value === 'ADJUSTMENT'
          ? fromLocation.value?.id || adjustmentLocation.value?.id
          : null
      searchResults.value = await searchProducts(query, locationId)
    } catch (error) {
      show('Gagal mencari produk.', 'error')
    } finally {
      isSearching.value = false
    }
  }, 500)
}

function addProductToBatch() {
  if (!selectedProduct.value || !quantityToAdd.value) {
    show('Pilih produk dan masukkan kuantitas yang valid.', 'warning')
    return
  }
  if (activeTab.value === 'ADJUSTMENT' && quantityToAdd.value === 0) {
    show('Kuantitas penyesuaian tidak boleh nol.', 'warning')
    return
  }

  const existing = batchList.value.find((item) => item.sku === selectedProduct.value.sku)
  if (existing) {
    existing.quantity += quantityToAdd.value
  } else {
    batchList.value.push({
      sku: selectedProduct.value.sku,
      name: selectedProduct.value.name,
      current_stock: selectedProduct.value.current_stock,
      quantity: quantityToAdd.value,
    })
  }
  selectedProduct.value = null
  searchResults.value = []
  quantityToAdd.value = 1
}

function removeFromBatch(sku) {
  batchList.value = batchList.value.filter((item) => item.sku !== sku)
}

async function submitBatch() {
  if (!isLocationSelected.value || batchList.value.length === 0) {
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
      toLocationId: toLocation.value?.id || adjustmentLocation.value?.id || null,
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
      <h2 class="text-2xl font-bold text-text">Batch Stock Movement</h2>
      <router-link to="/wms" class="text-sm text-primary hover:underline"
        >&larr; Kembali ke WMS</router-link
      >
    </div>

    <div class="bg-background rounded-xl shadow-md border border-secondary/20 p-6 space-y-6">
      <Tabs
        :tabs="[
          { label: 'Transfer', value: 'TRANSFER' },
          { label: 'Inbound / Return', value: 'INBOUND' },
          { label: 'Adjustment', value: 'ADJUSTMENT' },
        ]"
        v-model:model-value="activeTab"
      />

      <!-- Header Kontekstual Berdasarkan Tab -->
      <div class="grid grid-cols-1 md:grid-cols-2 gap-6 border-b border-secondary/20 pb-6">
        <!-- TRANSFER -->
        <template v-if="activeTab === 'TRANSFER'">
          <div>
            <label class="block text-sm font-medium text-text/90 mb-2"
              >Pindahkan Dari (Lokasi Anda)</label
            >
            <Multiselect
              v-model="fromLocation"
              :options="myLocations"
              placeholder="Pilih lokasi asal"
              label="code"
              track-by="id"
              :disabled="isLoading"
            ></Multiselect>
          </div>
          <div>
            <label class="block text-sm font-medium text-text/90 mb-2">Ke Lokasi</label>
            <Multiselect
              v-model="toLocation"
              :options="allLocations"
              placeholder="Pilih lokasi tujuan"
              label="code"
              track-by="id"
              :disabled="isLoading"
            ></Multiselect>
          </div>

          <div class="flex-grow">
            <label class="block text-sm font-medium text-text/90 mb-2"
              >Catatan / Alasan (Wajib)</label
            >
            <input
              v-model="notes"
              type="text"
              placeholder="e.g., Stok opname mingguan, Barang rusak"
              class="w-full p-2 border border-secondary/50 rounded-lg bg-background"
            />
          </div>
        </template>
        <!-- INBOUND / RETURN -->
        <template v-if="activeTab === 'INBOUND' || activeTab === 'SALE_RETURN'">
          <div>
            <label class="block text-sm font-medium text-text/90 mb-2">Masukkan Ke Lokasi</label>
            <Multiselect
              v-model="toLocation"
              :options="allLocations"
              placeholder="Pilih lokasi tujuan"
              label="code"
              track-by="id"
              :disabled="isLoading"
            ></Multiselect>
          </div>
          <div class="flex-grow">
            <label class="block text-sm font-medium text-text/90 mb-2"
              >Catatan / Alasan (Wajib)</label
            >
            <input
              v-model="notes"
              type="text"
              placeholder="e.g., Stok opname mingguan, Barang rusak"
              class="w-full p-2 border border-secondary/50 rounded-lg bg-background"
            />
          </div>
        </template>
        <!-- ADJUSTMENT -->
        <template v-if="activeTab === 'ADJUSTMENT'">
          <div>
            <label class="block text-sm font-medium text-text/90 mb-2"
              >Lokasi Penyesuaian (Lokasi Anda)</label
            >
            <Multiselect
              v-model="adjustmentLocation"
              :options="myLocations"
              placeholder="Pilih lokasi"
              label="code"
              track-by="id"
              :disabled="isLoading"
            ></Multiselect>
          </div>
          <div class="flex-grow">
            <label class="block text-sm font-medium text-text/90 mb-2"
              >Catatan / Alasan (Wajib)</label
            >
            <input
              v-model="notes"
              type="text"
              placeholder="e.g., Stok opname mingguan, Barang rusak"
              class="w-full p-2 border border-secondary/50 rounded-lg bg-background"
            />
          </div>
        </template>
      </div>

      <!-- Form Penambahan Item -->
      <div class="flex items-end gap-4">
        <div class="flex-grow">
          <label class="block text-sm font-medium text-text/90 mb-2"
            >Cari Produk (SKU atau Nama)</label
          >
          <Multiselect
            v-model="selectedProduct"
            :options="searchResults"
            :loading="isSearching"
            :internal-search="false"
            @search-change="onSearchChange"
            placeholder="Ketik min. 2 karakter..."
            label="name"
            track-by="sku"
          >
            <template #option="{ option }">
              <div class="flex justify-between">
                <span
                  >{{ option.name }}
                  <span class="text-xs text-text/60">({{ option.sku }})</span></span
                >
                <span v-if="option.current_stock !== undefined" class="text-xs font-semibold"
                  >Stok: {{ option.current_stock }}</span
                >
              </div>
            </template>
          </Multiselect>
        </div>
        <div class="w-28">
          <label class="block text-sm font-medium text-text/90 mb-2">Jumlah</label>
          <input
            v-model.number="quantityToAdd"
            type="number"
            :placeholder="activeTab === 'ADJUSTMENT' ? 'e.g., -5' : 'e.g., 5'"
            class="w-full p-2 border border-secondary/50 rounded-lg bg-background"
          />
        </div>
        <button
          @click="addProductToBatch"
          class="px-4 py-2 bg-primary text-white rounded-lg font-semibold"
        >
          Tambah
        </button>
      </div>

      <!-- Tabel Daftar Batch -->
      <div class="border-t border-secondary/20 pt-6">
        <h3 class="text-lg font-semibold text-text mb-4">Daftar Item ({{ batchList.length }})</h3>
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
                <th
                  class="p-2 text-center"
                  v-if="activeTab === 'TRANSFER' || activeTab === 'ADJUSTMENT'"
                >
                  Stok Saat Ini
                </th>
                <th class="p-2 text-center">Jumlah</th>
                <th class="p-2 text-center">Aksi</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-secondary/20">
              <tr v-for="item in batchList" :key="item.sku" class="hover:bg-primary/5">
                <td class="p-2 font-mono">{{ item.sku }}</td>
                <td class="p-2">{{ item.name }}</td>
                <td
                  class="p-2 text-center"
                  v-if="activeTab === 'TRANSFER' || activeTab === 'ADJUSTMENT'"
                >
                  {{ item.current_stock }}
                </td>
                <td
                  class="p-2 text-center font-bold"
                  :class="{ 'text-success': item.quantity > 0, 'text-accent': item.quantity < 0 }"
                >
                  {{ item.quantity }}
                </td>
                <td class="p-2 text-center">
                  <button
                    @click="removeFromBatch(item.sku)"
                    class="text-accent hover:text-accent/80"
                  >
                    <font-awesome-icon icon="fa-solid fa-trash" />
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- Tombol Aksi Final -->
      <div class="flex justify-end pt-6 border-t border-secondary/20">
        <button
          @click="submitBatch"
          :disabled="!isLocationSelected || batchList.length === 0 || isLoading"
          class="px-6 py-3 bg-accent text-white rounded-lg font-bold disabled:opacity-50 flex items-center gap-2"
        >
          <font-awesome-icon v-if="isLoading" icon="fa-solid fa-spinner" class="animate-spin" />
          <span>{{ isLoading ? 'Memproses...' : 'Submit Batch' }}</span>
        </button>
      </div>
    </div>
  </div>
</template>
