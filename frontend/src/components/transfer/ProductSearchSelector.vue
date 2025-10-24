<!-- frontend\src\components\transfer\ProductSearchSelector.vue -->
<script setup>
import { ref } from 'vue'
import { useToast } from '@/composables/UseToast.js'
import { searchProducts } from '@/api/helpers/products.js'
import Multiselect from 'vue-multiselect'

defineProps({
  disabled: { type: Boolean, default: false },
})

const emit = defineEmits(['product-selected'])
const { show } = useToast()

// State Internal
const searchResults = ref([])
const isSearching = ref(false)
const selectedProduct = ref(null)
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
      // Panggil API search. Kita tidak perlu locationId untuk pencarian general.
      searchResults.value = await searchProducts(query, null)
    } catch (error) {
      show('Gagal mencari produk.', 'error')
    } finally {
      isSearching.value = false
    }
  }, 500)
}

function onProductSelect(product) {
  if (product) {
    emit('product-selected', product)
  }
}

// Digunakan jika user menghapus pilihan di multiselect
function onRemove() {
  selectedProduct.value = null
  // Anda mungkin ingin emit event 'product-deselected' jika perlu
}
</script>

<template>
  <div>
    <label class="block text-sm font-medium text-text/90 mb-2">1. Cari Produk</label>
    <Multiselect
      v-model="selectedProduct"
      :options="searchResults"
      :loading="isSearching"
      :internal-search="false"
      @search-change="onSearchChange"
      @select="onProductSelect"
      @remove="onRemove"
      placeholder="Ketik untuk mencari SKU atau Nama Produk..."
      label="name"
      track-by="id"
      :disabled="disabled"
    >
      <template #option="{ option }">
        <div>
          {{ option.name }} <span class="text-xs text-text/60">({{ option.sku }})</span>
        </div>
      </template>
      <template #noResult>Produk tidak ditemukan.</template>
      <template #noOptions>Ketik min. 2 karakter...</template>
    </Multiselect>
  </div>
</template>
