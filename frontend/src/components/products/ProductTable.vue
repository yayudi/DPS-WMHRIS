<script setup>
import { computed } from 'vue'
import ProductRow from './ProductRow.vue'

const props = defineProps({
  products: { type: Array, required: true, default: () => [] },
  loading: Boolean,
  pagination: Object,
  selectedIds: Set,
  sortBy: String,
  sortOrder: String,
})

const emit = defineEmits([
  'sort',
  'changePage',
  'update:limit',
  'toggleSelection',
  'toggleSelectAll',
  'edit',
  'restore',
  'delete',
])

const limitOptions = [10, 20, 50, 100]

// Logic Pagination Visible Pages
const visiblePages = computed(() => {
  if (!props.pagination) return []
  const { page, totalPages } = props.pagination
  const delta = 2
  const range = []
  const rangeWithDots = []
  let l

  for (let i = 1; i <= totalPages; i++) {
    if (i === 1 || i === totalPages || (i >= page - delta && i <= page + delta)) {
      range.push(i)
    }
  }

  range.forEach((i) => {
    if (l) {
      if (i - l === 2) rangeWithDots.push(l + 1)
      else if (i - l !== 1) rangeWithDots.push('...')
    }
    rangeWithDots.push(i)
    l = i
  })
  return rangeWithDots
})

const isAllSelected = computed(() => {
  const productsList = props.products || []
  return (
    productsList.length > 0 &&
    productsList.every((p) => props.selectedIds && props.selectedIds.has(p.id))
  )
})

// Handlers wrapper
const handleSort = (field) => emit('sort', field)
const changePage = (p) => {
  if (p !== '...' && p >= 1 && props.pagination && p <= props.pagination.totalPages)
    emit('changePage', p)
}
const handleJumpPage = (e) => {
  const val = parseInt(e.target.value)
  if (!isNaN(val)) changePage(val)
  e.target.value = ''
}

// Icon Helper untuk Header
function getSortIcon(field) {
  if (props.sortBy !== field) return 'fa-solid fa-sort'
  return props.sortOrder === 'asc' ? 'fa-solid fa-sort-up' : 'fa-solid fa-sort-down'
}
</script>

<template>
  <div
    class="flex-1 bg-background rounded-2xl shadow-sm border border-secondary/20 overflow-hidden flex flex-col relative h-full"
  >
    <!-- Table Scroll Area -->
    <div class="flex-1 overflow-auto relative custom-scrollbar">
      <table class="w-full min-w-[800px] text-left border-collapse">
        <!-- HEADER (Sticky) -->
        <thead class="sticky top-0 z-10 bg-background shadow-sm ring-1 ring-secondary/10">
          <tr class="bg-secondary/5 text-text/60 text-xs font-bold uppercase tracking-wider">
            <!-- CHECKBOX ALL -->
            <th class="px-4 py-3 w-12 text-center">
              <div class="flex items-center justify-center">
                <input
                  type="checkbox"
                  class="w-4 h-4 rounded border-secondary/30 text-primary focus:ring-primary bg-background cursor-pointer transition-all"
                  :checked="isAllSelected"
                  @change="emit('toggleSelectAll')"
                />
              </div>
            </th>

            <!-- NAMA PRODUK (Sortable) -->
            <th
              class="px-4 py-3 cursor-pointer hover:bg-secondary/10 transition-colors group select-none"
              @click="handleSort('name')"
            >
              <div class="flex items-center gap-2">
                Nama Produk
                <font-awesome-icon
                  :icon="getSortIcon('name')"
                  class="text-text/30 group-hover:text-primary transition-colors"
                  :class="{ 'text-primary': sortBy === 'name' }"
                />
              </div>
            </th>

            <!-- SKU (Sortable) -->
            <th
              class="px-4 py-3 cursor-pointer hover:bg-secondary/10 transition-colors group select-none"
              @click="handleSort('sku')"
            >
              <div class="flex items-center gap-2">
                SKU
                <font-awesome-icon
                  :icon="getSortIcon('sku')"
                  class="text-text/30 group-hover:text-primary transition-colors"
                  :class="{ 'text-primary': sortBy === 'sku' }"
                />
              </div>
            </th>

            <!-- BERAT -->
            <th class="px-4 py-3 text-right">Berat</th>

            <!-- HARGA (Sortable) -->
            <th
              class="px-4 py-3 text-right cursor-pointer hover:bg-secondary/10 transition-colors group select-none"
              @click="handleSort('price')"
            >
              <div class="flex items-center justify-end gap-2">
                Harga
                <font-awesome-icon
                  :icon="getSortIcon('price')"
                  class="text-text/30 group-hover:text-primary transition-colors"
                  :class="{ 'text-primary': sortBy === 'price' }"
                />
              </div>
            </th>

            <th class="px-4 py-3 text-center">Status</th>
            <th class="px-4 py-3 text-center w-32">Aksi</th>
          </tr>
        </thead>

        <!-- BODY -->
        <tbody class="divide-y divide-secondary/10">
          <!-- Loading State -->
          <tr v-if="loading">
            <td colspan="7" class="py-32 text-center">
              <div class="flex flex-col items-center gap-3">
                <font-awesome-icon
                  icon="fa-solid fa-circle-notch"
                  spin
                  class="text-4xl text-primary"
                />
                <p class="text-sm text-text/60 animate-pulse">Sedang memuat data...</p>
              </div>
            </td>
          </tr>

          <!-- Empty State -->
          <tr v-else-if="!products || products.length === 0">
            <td colspan="7" class="py-32 text-center">
              <div class="flex flex-col items-center gap-4">
                <div
                  class="w-16 h-16 bg-secondary/10 rounded-full flex items-center justify-center text-3xl text-text/30"
                >
                  <font-awesome-icon icon="fa-solid fa-box-open" />
                </div>
                <div>
                  <h3 class="text-lg font-bold mb-1">Tidak ada produk ditemukan</h3>
                  <p class="text-sm text-text/50">
                    Coba ubah kata kunci pencarian atau filter Anda.
                  </p>
                </div>
              </div>
            </td>
          </tr>

          <!-- Data Rows -->
          <template v-else>
            <ProductRow
              v-for="product in products"
              :key="product.id"
              :product="product"
              :is-selected="selectedIds && selectedIds.has(product.id)"
              @toggle-selection="(id) => emit('toggleSelection', id)"
              @edit="(p) => emit('edit', p)"
              @restore="(p) => emit('restore', p)"
              @delete="(p) => emit('delete', p)"
            />
          </template>
        </tbody>
      </table>
    </div>

    <!-- PAGINATION FOOTER -->
    <div
      class="shrink-0 px-6 py-3 border-t border-secondary/10 bg-secondary/5 flex flex-col sm:flex-row items-center justify-between gap-4 select-none"
    >
      <div class="flex items-center gap-4 text-xs text-text/70">
        <div class="flex items-center gap-2">
          <span>Limit:</span>
          <select
            :value="pagination ? pagination.limit : 20"
            @change="emit('update:limit', parseInt($event.target.value))"
            class="bg-background border border-secondary/20 rounded px-2 py-1 focus:outline-none focus:border-primary cursor-pointer hover:border-primary/50 transition-colors"
          >
            <option v-for="opt in limitOptions" :key="opt" :value="opt">{{ opt }}</option>
          </select>
        </div>
        <div class="h-4 w-px bg-secondary/20 hidden sm:block"></div>
        <span v-if="pagination">
          Menampilkan <b>{{ (pagination.page - 1) * pagination.limit + 1 }}</b> -
          <b>{{ Math.min(pagination.page * pagination.limit, pagination.total) }}</b> dari
          <b>{{ pagination.total }}</b> data
        </span>
      </div>

      <div class="flex items-center gap-1" v-if="pagination">
        <button
          @click="changePage(1)"
          :disabled="pagination.page === 1"
          class="w-8 h-8 flex items-center justify-center rounded-lg border border-secondary/20 hover:bg-secondary/10 hover:text-primary disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          title="Halaman Pertama"
        >
          <font-awesome-icon icon="fa-solid fa-angles-left" />
        </button>
        <button
          @click="changePage(pagination.page - 1)"
          :disabled="pagination.page === 1"
          class="w-8 h-8 flex items-center justify-center rounded-lg border border-secondary/20 hover:bg-secondary/10 hover:text-primary disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          title="Halaman Sebelumnya"
        >
          <font-awesome-icon icon="fa-solid fa-angle-left" />
        </button>

        <div class="flex items-center gap-1 mx-1">
          <template v-for="(p, i) in visiblePages" :key="i">
            <div v-if="p === '...'" class="relative w-8 h-8 group">
              <input
                type="number"
                class="w-full h-full text-center text-xs font-bold bg-transparent border border-secondary/20 rounded-lg focus:border-primary outline-none remove-arrow transition-all"
                placeholder="..."
                @keydown.enter="handleJumpPage"
              />
            </div>
            <button
              v-else
              @click="changePage(p)"
              class="w-8 h-8 flex items-center justify-center rounded-lg text-xs font-bold transition-all"
              :class="[
                p === pagination.page
                  ? 'bg-primary text-white shadow-md shadow-primary/20'
                  : 'border border-secondary/20 hover:bg-secondary/10 hover:text-primary text-text/70',
              ]"
            >
              {{ p }}
            </button>
          </template>
        </div>

        <button
          @click="changePage(pagination.page + 1)"
          :disabled="pagination.page === pagination.totalPages"
          class="w-8 h-8 flex items-center justify-center rounded-lg border border-secondary/20 hover:bg-secondary/10 hover:text-primary disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          title="Halaman Selanjutnya"
        >
          <font-awesome-icon icon="fa-solid fa-angle-right" />
        </button>
        <button
          @click="changePage(pagination.totalPages)"
          :disabled="pagination.page === pagination.totalPages"
          class="w-8 h-8 flex items-center justify-center rounded-lg border border-secondary/20 hover:bg-secondary/10 hover:text-primary disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          title="Halaman Terakhir"
        >
          <font-awesome-icon icon="fa-solid fa-angles-right" />
        </button>
      </div>
    </div>
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
.remove-arrow::-webkit-outer-spin-button,
.remove-arrow::-webkit-inner-spin-button {
  -webkit-appearance: none;
  margin: 0;
}
.remove-arrow {
  appearance: textfield;
  -moz-appearance: textfield;
}
</style>
