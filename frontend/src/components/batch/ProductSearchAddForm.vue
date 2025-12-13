<!-- frontend\src\components\batch\ProductSearchAddForm.vue -->
<script setup>
import { ref } from 'vue'
import { useToast } from '@/composables/useToast.js'
import { searchProducts, fetchStockSampleForLocation } from '@/api/helpers/products.js'
import Multiselect from 'vue-multiselect'

const props = defineProps({
  activeTab: { type: String, required: true },
  searchLocationId: { type: [Number, String], default: null },
  disabled: { type: Boolean, default: false },
})

const emit = defineEmits(['add-product'])
const { show } = useToast()

// State internal untuk form ini
const searchResults = ref([])
const isSearching = ref(false)
const selectedProduct = ref(null)
const quantityToAdd = ref(1)

let searchDebounceTimer = null

function onSearchChange(query) {
  clearTimeout(searchDebounceTimer)
  if (query.length < 2) {
    searchResults.value = []
    return
  }
  isSearching.value = true
  searchDebounceTimer = setTimeout(async () => {
    try {
      // Jalankan pencarian Anda (yang kita tahu akan mengembalikan [])
      const results = await searchProducts(query, props.searchLocationId)
      searchResults.value = results

      // Jika hasil pencarian kosong, mari kita lihat apa yang SEBENARNYA ada di lokasi itu
      // Pastikan blok 'if' ini ada di kode Anda
      if (results.length === 0 && props.searchLocationId) {
        // Panggil helper baru kita
        const stockSample = await fetchStockSampleForLocation(props.searchLocationId)
      }
      // --- AKHIR LOG INVESTIGASI BARU ---
    } catch (error) {
      show('Gagal mencari produk.', 'error')
    } finally {
      isSearching.value = false
    }
  }, 500)
}

function onAddClick() {
  if (!selectedProduct.value) {
    show('Harap pilih produk.', 'warning')
    return
  }

  // Emit data ke induk
  emit('add-product', {
    product: selectedProduct.value,
    quantity: quantityToAdd.value,
  })

  // Reset form lokal
  selectedProduct.value = null
  searchResults.value = []
  quantityToAdd.value = 1
}
</script>

<template>
  <div class="flex items-end gap-4">
    <div class="flex-grow">
      <label class="block text-sm font-medium text-text/90 mb-2">Cari Produk (SKU atau Nama)</label>
      <Multiselect
        v-model="selectedProduct"
        :options="searchResults"
        :loading="isSearching"
        :internal-search="false"
        @search-change="onSearchChange"
        placeholder="Ketik min. 2 karakter..."
        label="name"
        track-by="sku"
        :disabled="disabled"
      >
        <template #option="{ option }">
          <div class="flex justify-between">
            <span
              >{{ option.name }} <span class="text-xs text-text/60">({{ option.sku }})</span></span
            >
            <!-- Tampilkan stok hanya jika relevan (bukan inbound/return) -->
            <span
              v-if="option.current_stock !== undefined"
              class="text-xs font-semibold"
              :class="{
                'text-accent': option.current_stock < 0,
                'text-text/80': option.current_stock >= 0,
              }"
            >
              Stok: {{ option.current_stock }}
            </span>
          </div>
        </template>
        <template #noResult>Produk tidak ditemukan.</template>
        <template #noOptions>Ketik untuk mencari produk...</template>
      </Multiselect>
    </div>
    <div class="w-28">
      <label class="block text-sm font-medium text-text/90 mb-2">Jumlah</label>
      <input
        v-model.number="quantityToAdd"
        type="number"
        :placeholder="activeTab === 'ADJUSTMENT' ? 'e.g., -5' : 'e.g., 5'"
        class="w-full p-2 border border-secondary/50 rounded-lg bg-background"
        :disabled="disabled || !selectedProduct"
      />
    </div>

    <!-- STOK AKTUAL DITAMBAHKAN DI SINI -->
    <div
      v-if="activeTab === 'TRANSFER' || activeTab === 'ADJUSTMENT'"
      class="h-[42px] flex flex-col justify-center items-center px-3 bg-secondary/10 rounded-lg"
    >
      <span class="text-xs text-text/70">Stok</span>
      <span
        class="font-bold"
        :class="{
          'text-accent': selectedProduct && selectedProduct.current_stock < 0,
          'text-text': !selectedProduct || selectedProduct.current_stock >= 0,
        }"
      >
        {{ selectedProduct ? selectedProduct.current_stock : '-' }}
      </span>
    </div>
    <!-- AKHIR BLOK BARU -->

    <button
      @click="onAddClick"
      class="px-4 py-2 bg-primary text-white rounded-lg font-semibold h-[42px] disabled:opacity-50"
      :disabled="disabled || !selectedProduct"
    >
      Tambah
    </button>
  </div>
</template>
