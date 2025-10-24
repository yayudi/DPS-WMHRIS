<!-- frontend\src\components\WMSProductTable.vue -->
<script setup>
import { computed } from 'vue'
import { useAuthStore } from '@/stores/auth.js'
import WmsProductRow from './WmsProductRow.vue'

const props = defineProps({
  products: {
    type: Array,
    required: true,
  },
  activeView: {
    type: String,
    required: true,
  },
  sortBy: String,
  sortOrder: String,
  recentlyUpdatedProducts: {
    type: Set,
    required: true,
  },
})

const emit = defineEmits(['copy', 'openAdjust', 'openTransfer', 'sort', 'openHistory'])
const auth = useAuthStore()

const gridClass = computed(() => {
  return auth.canViewPrices ? 'grid-cols-8' : 'grid-cols-7'
})

function handleSort(column) {
  emit('sort', column)
}

function sortIcon(column) {
  if (props.sortBy !== column) return 'fa-solid fa-sort'
  if (props.sortOrder === 'asc') return 'fa-solid fa-sort-up'
  return 'fa-solid fa-sort-down'
}
</script>

<template>
  <div class="w-full text-left border-collapse">
    <!-- HEADER TABEL -->
    <div
      class="grid p-3 bg-secondary/10 border-b-2 border-primary/50 text-xs font-bold text-text/60 uppercase tracking-wider"
      :class="gridClass"
    >
      <div @click="handleSort('name')" class="col-span-3 cursor-pointer hover:text-primary">
        Produk <font-awesome-icon :icon="sortIcon('name')" />
      </div>
      <div
        @click="handleSort('sku')"
        class="col-span-1 text-center cursor-pointer hover:text-primary"
      >
        SKU <font-awesome-icon :icon="sortIcon('sku')" />
      </div>
      <div
        v-if="auth.canViewPrices"
        @click="handleSort('price')"
        class="col-span-1 text-right cursor-pointer hover:text-primary"
      >
        Harga <font-awesome-icon :icon="sortIcon('price')" />
      </div>
      <div class="col-span-1 text-center">Lokasi</div>
      <div class="col-span-1 text-center">Stok</div>
      <div class="col-span-1 text-center">Aksi</div>
    </div>

    <!-- BODY TABEL -->
    <div>
      <WmsProductRow
        v-for="product in products"
        :key="product.id"
        :product="product"
        :active-view="activeView"
        :is-updated="recentlyUpdatedProducts.has(product.id)"
        @copy="(payload) => emit('copy', payload)"
        @openAdjust="(product) => emit('openAdjust', product)"
        @openTransfer="(product) => emit('openTransfer', product)"
        @openHistory="(product) => emit('openHistory', product)"
      />
    </div>
  </div>
</template>
