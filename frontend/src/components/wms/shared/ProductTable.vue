<!-- frontend\src\components\ProductTable.vue -->
<script setup>
import { computed } from 'vue'
import { useAuthStore } from '@/stores/auth.js'
import WmsProductRow from './ProductRow.vue'

const props = defineProps({
  products: { type: Array, required: true },
  activeView: { type: String, required: true },
  sortBy: String,
  sortOrder: String,
  recentlyUpdatedProducts: {
    type: Set,
    required: false,
    default: () => new Set(),
  },
})

const emit = defineEmits([
  'copy',
  'openAdjust',
  'openTransfer',
  'sort',
  'openHistory',
  'openEdit',
  'delete',
])

const auth = useAuthStore()

const gridClass = computed(() => {
  return 'grid-cols-12 gap-4'
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
  <div class="w-full text-left border-collapse min-w-[800px]">
    <div
      class="grid p-3 bg-primary/5 border-b-2 border-primary/50 text-xs font-bold text-text/60 uppercase tracking-wider items-center"
      :class="gridClass"
    >
      <div
        @click="handleSort('name')"
        class="cursor-pointer hover:text-primary flex items-center gap-2"
        :class="[auth.canViewPrices ? 'col-span-4' : 'col-span-5']"
      >
        Produk <font-awesome-icon :icon="sortIcon('name')" />
      </div>

      <div
        @click="handleSort('sku')"
        class="col-span-2 cursor-pointer hover:text-primary flex items-center gap-2"
      >
        SKU <font-awesome-icon :icon="sortIcon('sku')" />
      </div>

      <div
        v-if="auth.canViewPrices"
        @click="handleSort('price')"
        class="col-span-2 text-right cursor-pointer hover:text-primary flex items-center justify-end gap-2"
      >
        Harga <font-awesome-icon :icon="sortIcon('price')" />
      </div>

      <div class="text-center" :class="[auth.canViewPrices ? 'col-span-2' : 'col-span-3']">
        Lokasi
      </div>

      <div class="col-span-1 text-center">Stok</div>

      <div class="col-span-1 text-center">Aksi</div>
    </div>

    <div class="divide-y divide-primary/20">
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
        @openEdit="(product) => emit('openEdit', product)"
        @delete="(product) => emit('delete', product)"
      />
    </div>
  </div>
</template>
