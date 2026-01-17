<!-- frontend\src\components\ProductTable.vue -->
<script setup>
import { computed } from 'vue'
import { useAuthStore } from '@/stores/auth.js'
import WmsProductRow from './ProductRow.vue'
import TableSkeleton from '@/components/ui/TableSkeleton.vue'

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
  loading: { type: Boolean, default: false },
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
  <div
    class="bg-background rounded-xl shadow-md border border-secondary/20 overflow-x-auto overflow-y-auto relative custom-scrollbar h-[65vh] table-container">
    <table class="min-w-[1000px] w-full bg-background text-sm text-text border-collapse">
      <!-- STATIC HEADER -->
      <thead class="sticky top-0 z-30 bg-background/95 backdrop-blur-md shadow-sm ring-1 ring-secondary/5">
        <tr>
          <!-- Name Column (Sticky) -->
          <th
            class="px-6 py-3 border-b border-secondary/10 sticky left-0 z-30 bg-background/95 backdrop-blur-md shadow-[4px_0_8px_-4px_rgba(0,0,0,0.05)] text-left uppercase text-xs font-bold text-text/60 cursor-pointer hover:text-primary transition-colors w-[350px]"
            @click="handleSort('name')">
            <div class="flex items-center gap-2">
              Produk <font-awesome-icon :icon="sortIcon('name')" />
            </div>
          </th>

          <!-- SKU -->
          <th
            class="px-6 py-3 border-b border-secondary/10 text-left uppercase text-xs font-bold text-text/60 cursor-pointer hover:text-primary transition-colors"
            @click="handleSort('sku')">
            <div class="flex items-center gap-2">
              SKU <font-awesome-icon :icon="sortIcon('sku')" />
            </div>
          </th>

          <!-- WEIGHT -->
          <th
            class="px-6 py-3 border-b border-secondary/10 text-right uppercase text-xs font-bold text-text/60 cursor-pointer hover:text-primary transition-colors"
            @click="handleSort('weight')">
            <div class="flex items-center justify-end gap-2">
              Berat <font-awesome-icon :icon="sortIcon('weight')" />
            </div>
          </th>

          <!-- PRICE (Conditional) -->
          <th v-if="auth.canViewPrices"
            class="px-6 py-3 border-b border-secondary/10 text-right uppercase text-xs font-bold text-text/60 cursor-pointer hover:text-primary transition-colors"
            @click="handleSort('price')">
            <div class="flex items-center justify-end gap-2">
              Harga <font-awesome-icon :icon="sortIcon('price')" />
            </div>
          </th>

          <!-- LOCATION -->
          <th class="px-6 py-3 border-b border-secondary/10 text-center uppercase text-xs font-bold text-text/60">
            Lokasi
          </th>

          <!-- STOCK -->
          <th class="px-6 py-3 border-b border-secondary/10 text-center uppercase text-xs font-bold text-text/60">
            Stok
          </th>

          <!-- ACTIONS (Sticky Right) -->
          <th
            class="px-6 py-3 border-b border-secondary/10 sticky right-0 z-30 bg-background/95 backdrop-blur-md shadow-[-4px_0_8px_-4px_rgba(0,0,0,0.05)] text-center uppercase text-xs font-bold text-text/60 w-[80px]">
            Aksi
          </th>
        </tr>
      </thead>

      <!-- TABLE BODY -->
      <TransitionGroup tag="tbody" name="list" class="divide-y divide-secondary/5 relative">
        <template v-if="loading">
          <TableSkeleton v-for="n in 10" :key="`skeleton-${n}`" />
        </template>

        <tr v-else-if="!products.length" key="empty">
          <td :colspan="auth.canViewPrices ? 7 : 6" class="py-12 text-center text-text/50 italic">
            Tidak ada produk yang ditemukan.
          </td>
        </tr>

        <!-- ROW COMPONENT (Now must be TR) -->
        <WmsProductRow v-else v-for="product in products" :key="product.id" :product="product" :active-view="activeView"
          :is-updated="recentlyUpdatedProducts.has(product.id)" @copy="(payload) => emit('copy', payload)"
          @openAdjust="(product) => emit('openAdjust', product)"
          @openTransfer="(product) => emit('openTransfer', product)"
          @openHistory="(product) => emit('openHistory', product)" @openEdit="(product) => emit('openEdit', product)"
          @delete="(product) => emit('delete', product)" />
      </TransitionGroup>
    </table>
    <slot name="footer" />
  </div>
</template>

<style scoped>
.custom-scrollbar::-webkit-scrollbar {
  width: 6px;
  height: 6px;
}

.custom-scrollbar::-webkit-scrollbar-track {
  background: transparent;
}

.custom-scrollbar::-webkit-scrollbar-thumb {
  background-color: hsl(var(--color-secondary) / 0.3);
  border-radius: 4px;
}

.custom-scrollbar::-webkit-scrollbar-thumb:hover {
  background-color: hsl(var(--color-secondary) / 0.5);
}

/* List Transitions */
.list-enter-active,
.list-leave-active {
  transition: all 0.3s ease;
}

.list-enter-from,
.list-leave-to {
  opacity: 0;
  transform: translateX(-10px);
}

.list-leave-active {
  position: absolute;
  width: 100%;
}
</style>
