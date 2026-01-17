<script setup>
import { computed, ref } from 'vue'
import ProductRow from './ProductRow.vue'
import TableSkeleton from '@/components/ui/TableSkeleton.vue'

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

// --- COLLAPSIBLE ROW STATE ---
const expandedRows = ref(new Set())

const toggleExpand = (id) => {
  if (expandedRows.value.has(id)) {
    expandedRows.value.delete(id)
  } else {
    expandedRows.value.add(id)
  }
}

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

const formatComponents = (components) => {
  if (!components || components.length === 0) return '-'
  // Tampilkan 2 pertama, sisanya "+ X more"
  const firstTwo = components.slice(0, 2).map(c => `${c.name} (${c.quantity})`).join(', ')
  return components.length > 2 ? `${firstTwo}, +${components.length - 2}` : firstTwo
}
</script>

<template>
  <div
    class="flex-1 bg-background rounded-2xl shadow-sm border border-secondary/20 overflow-hidden flex flex-col relative h-full">
    <!-- Table Scroll Area -->
    <div class="flex-1 overflow-x-auto overflow-y-auto relative custom-scrollbar">
      <table class="w-full text-left border-collapse min-w-[1000px]">
        <!-- HEADER (Sticky) -->
        <thead class="sticky top-0 z-30 bg-background/95 backdrop-blur-md shadow-sm ring-1 ring-secondary/5">
          <tr class="text-text/60 text-xs font-bold uppercase tracking-wider">
            <!-- CHECKBOX ALL (Sticky Left) -->
            <th
              class="px-4 py-3 w-12 text-center sticky left-0 z-30 bg-background/95 backdrop-blur-md border-b border-secondary/10">
              <div class="flex items-center justify-center">
                <input type="checkbox"
                  class="w-4 h-4 rounded border-secondary/30 text-primary focus:ring-primary bg-background cursor-pointer transition-all"
                  :checked="isAllSelected" @change="emit('toggleSelectAll')" />
              </div>
            </th>

            <!-- NAMA PAKET (Sortable, Sticky Left) -->
            <th
              class="px-4 py-3 cursor-pointer hover:bg-secondary/5 transition-colors group select-none sticky left-12 z-30 bg-background/95 backdrop-blur-md border-b border-secondary/10 shadow-[4px_0_8px_-4px_rgba(0,0,0,0.05)]"
              @click="handleSort('name')">
              <div class="flex items-center gap-2">
                Nama Paket
                <font-awesome-icon :icon="getSortIcon('name')"
                  class="text-text/30 group-hover:text-primary transition-colors"
                  :class="{ 'text-primary': sortBy === 'name' }" />
              </div>
            </th>

            <!-- SKU (Sortable) -->
            <th class="px-4 py-3 cursor-pointer hover:bg-secondary/10 transition-colors group select-none"
              @click="handleSort('sku')">
              <div class="flex items-center gap-2">
                SKU Paket
                <font-awesome-icon :icon="getSortIcon('sku')"
                  class="text-text/30 group-hover:text-primary transition-colors"
                  :class="{ 'text-primary': sortBy === 'sku' }" />
              </div>
            </th>

            <!-- KOMPONEN (New Column) -->
            <th class="px-4 py-3 w-1/3">Komponen</th>

            <!-- HARGA (Sortable) -->
            <th class="px-4 py-3 text-right cursor-pointer hover:bg-secondary/10 transition-colors group select-none"
              @click="handleSort('price')">
              <div class="flex items-center justify-end gap-2">
                Harga Jual
                <font-awesome-icon :icon="getSortIcon('price')"
                  class="text-text/30 group-hover:text-primary transition-colors"
                  :class="{ 'text-primary': sortBy === 'price' }" />
              </div>
            </th>

            <th class="px-4 py-3 text-center">Status</th>
            <th
              class="px-4 py-3 text-center w-32 sticky right-0 z-30 bg-background/95 backdrop-blur-md border-b border-secondary/10 shadow-[-4px_0_8px_-4px_rgba(0,0,0,0.05)]">
              Aksi</th>
          </tr>
        </thead>

        <!-- BODY (Animated) -->
        <TransitionGroup tag="tbody" name="list" class="divide-y divide-secondary/5 relative">
          <!-- Loading State -->
          <template v-if="loading">
            <TableSkeleton v-for="n in 5" :key="`skeleton-${n}`" />
          </template>

          <!-- Empty State -->
          <tr v-else-if="!products || products.length === 0" key="empty">
            <td colspan="7" class="py-32 text-center">
              <div class="flex flex-col items-center gap-4">
                <div
                  class="w-16 h-16 bg-secondary/10 rounded-full flex items-center justify-center text-3xl text-text/30">
                  <font-awesome-icon icon="fa-solid fa-box-open" />
                </div>
                <div>
                  <h3 class="text-lg font-bold mb-1">Tidak ada paket ditemukan</h3>
                  <p class="text-sm text-text/50">
                    Coba ubah kata kunci pencarian atau filter Anda.
                  </p>
                </div>
              </div>
            </td>
          </tr>

          <!-- Data Rows -->
          <template v-else>
            <template v-for="product in products" :key="product.id">
              <!-- Main Row -->
              <tr class="hover:bg-secondary/5 transition-colors group border-b border-secondary/10 last:border-0"
                :class="{ 'bg-secondary/5': expandedRows.has(product.id) }">
                <!-- Checkbox (Sticky Left) -->
                <td
                  class="px-4 py-3 text-center sticky left-0 z-20 bg-background group-hover:bg-secondary/5 transition-colors border-b border-secondary/10">
                  <input type="checkbox"
                    class="w-4 h-4 rounded border-secondary/30 text-primary focus:ring-primary bg-background cursor-pointer"
                    :checked="selectedIds && selectedIds.has(product.id)"
                    @change="emit('toggleSelection', product.id)" />
                </td>

                <!-- Name (Sticky Left) -->
                <td
                  class="px-4 py-3 sticky left-12 z-20 bg-background group-hover:bg-secondary/5 transition-colors border-b border-secondary/10 shadow-[4px_0_8px_-4px_rgba(0,0,0,0.05)]">
                  <div class="font-bold text-sm text-text">{{ product.name }}</div>
                  <!-- Mobile SKU view if needed, but we have column -->
                </td>

                <!-- SKU -->
                <td class="px-4 py-3">
                  <span class="font-mono text-xs text-text/70 bg-secondary/10 px-2 py-1 rounded">{{ product.sku
                    }}</span>
                </td>

                <!-- Components Summary (Toggle) -->
                <td class="px-4 py-3">
                  <button @click="toggleExpand(product.id)"
                    class="flex items-center gap-2 text-xs font-medium px-2 py-1.5 rounded transition-colors hover:bg-secondary/10 w-full md:w-auto"
                    :class="product.components?.length ? 'text-primary' : 'text-text/40 italic cursor-default'"
                    :disabled="!product.components?.length">
                    <font-awesome-icon v-if="product.components?.length"
                      :icon="expandedRows.has(product.id) ? 'fa-solid fa-chevron-down' : 'fa-solid fa-chevron-right'"
                      class="text-[10px]" />
                    <span v-if="product.components?.length">
                      {{ product.components.length }} Komponen
                    </span>
                    <span v-else>Tanpa Komponen</span>
                  </button>
                </td>

                <!-- Price -->
                <td class="px-4 py-3 text-right font-mono text-sm">
                  {{ new Intl.NumberFormat('id-ID', {
                    style: 'currency', currency: 'IDR', minimumFractionDigits: 0,
                    maximumFractionDigits: 0
                  }).format(product.price) }}
                </td>

                <!-- Status -->
                <td class="px-4 py-3 text-center">
                  <span class="px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider border"
                    :class="product.is_active ? 'bg-success/10 text-success border-success/20' : 'bg-secondary/20 text-text/50 border-secondary/30'">
                    {{ product.is_active ? 'Aktif' : 'Arsip' }}
                  </span>
                </td>

                <!-- Actions (Sticky Right) -->
                <td
                  class="px-4 py-3 text-center sticky right-0 z-20 bg-background group-hover:bg-secondary/5 transition-colors border-b border-secondary/10 shadow-[-4px_0_8px_-4px_rgba(0,0,0,0.05)]">
                  <div
                    class="flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button @click="emit('edit', product)"
                      class="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-primary/10 text-primary transition-colors"
                      title="Edit Paket">
                      <font-awesome-icon icon="fa-solid fa-pen-to-square" />
                    </button>
                    <button v-if="product.is_active" @click="emit('delete', product)"
                      class="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-danger/10 text-danger transition-colors"
                      title="Arsipkan">
                      <font-awesome-icon icon="fa-solid fa-box-archive" />
                    </button>
                    <button v-else @click="emit('restore', product)"
                      class="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-success/10 text-success transition-colors"
                      title="Pulihkan">
                      <font-awesome-icon icon="fa-solid fa-rotate-left" />
                    </button>
                  </div>
                </td>
              </tr>

              <!-- Detail Row (Expanded) -->
              <tr v-if="expandedRows.has(product.id)" class="bg-secondary/5 border-b border-secondary/10">
                <td colspan="7" class="p-0">
                  <div class="px-12 py-4 flex flex-col md:flex-row gap-6">
                    <!-- Component List -->
                    <div class="flex-1 max-w-2xl">
                      <p class="text-xs font-bold text-text/50 uppercase mb-3 flex items-center gap-2">
                        <font-awesome-icon icon="fa-solid fa-layer-group" />
                        Rincian Komponen
                      </p>
                      <div class="bg-background border border-secondary/20 rounded-lg overflow-hidden shadow-sm">
                        <table class="w-full text-sm text-left">
                          <thead class="bg-secondary/10 text-xs font-semibold text-text/70">
                            <tr>
                              <th class="px-4 py-2">SKU</th>
                              <th class="px-4 py-2">Nama Barang</th>
                              <th class="px-4 py-2 text-center">Qty / Paket</th>
                            </tr>
                          </thead>
                          <tbody class="divide-y divide-secondary/10">
                            <tr v-for="comp in product.components" :key="comp.id" class="hover:bg-secondary/5">
                              <td class="px-4 py-2 font-mono text-xs">{{ comp.sku }}</td>
                              <td class="px-4 py-2">{{ comp.name }}</td>
                              <td class="px-4 py-2 text-center font-mono font-medium bg-primary/5 text-primary">
                                {{ comp.quantity }}
                              </td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                    </div>

                    <!-- Extra Info / Actions -->
                    <div class="w-64 shrink-0 flex flex-col gap-3 border-l border-secondary/10 pl-6 border-dashed">
                      <div>
                        <span class="text-xs text-text/50 block mb-1">Berat Total (Est.)</span>
                        <div class="font-mono text-sm font-medium">
                          {{ product.weight }} kg
                        </div>
                      </div>
                      <div>
                        <span class="text-xs text-text/50 block mb-1">Update Terakhir</span>
                        <div class="text-xs text-text/80">
                          <!-- Fallback if updated_at is missing -->
                          {{ new Date().toLocaleDateString('id-ID') }}
                        </div>
                      </div>
                    </div>
                  </div>
                </td>
              </tr>
            </template>
          </template>
        </TransitionGroup>
      </table>
    </div>

    <!-- PAGINATION FOOTER -->
    <div
      class="shrink-0 px-6 py-3 border-t border-secondary/10 bg-secondary/5 flex flex-col sm:flex-row items-center justify-between gap-4 select-none">
      <div class="flex items-center gap-4 text-xs text-text/70">
        <div class="flex items-center gap-2">
          <span>Limit:</span>
          <select :value="pagination ? pagination.limit : 20"
            @change="emit('update:limit', parseInt($event.target.value))"
            class="bg-background border border-secondary/20 rounded px-2 py-1 focus:outline-none focus:border-primary cursor-pointer hover:border-primary/50 transition-colors">
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
        <button @click="changePage(1)" :disabled="pagination.page === 1"
          class="w-8 h-8 flex items-center justify-center rounded-lg border border-secondary/20 hover:bg-secondary/10 hover:text-primary disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          title="Halaman Pertama">
          <font-awesome-icon icon="fa-solid fa-angles-left" />
        </button>
        <button @click="changePage(pagination.page - 1)" :disabled="pagination.page === 1"
          class="w-8 h-8 flex items-center justify-center rounded-lg border border-secondary/20 hover:bg-secondary/10 hover:text-primary disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          title="Halaman Sebelumnya">
          <font-awesome-icon icon="fa-solid fa-angle-left" />
        </button>

        <div class="flex items-center gap-1 mx-1">
          <template v-for="(p, i) in visiblePages" :key="i">
            <div v-if="p === '...'" class="relative w-8 h-8 group">
              <input type="number"
                class="w-full h-full text-center text-xs font-bold bg-transparent border border-secondary/20 rounded-lg focus:border-primary outline-none remove-arrow transition-all"
                placeholder="..." @keydown.enter="handleJumpPage" />
            </div>
            <button v-else @click="changePage(p)"
              class="w-8 h-8 flex items-center justify-center rounded-lg text-xs font-bold transition-all" :class="[
                p === pagination.page
                  ? 'bg-primary text-secondary shadow-md shadow-primary/20'
                  : 'border border-secondary/20 hover:bg-secondary/10 hover:text-primary text-text/70',
              ]">
              {{ p }}
            </button>
          </template>
        </div>

        <button @click="changePage(pagination.page + 1)" :disabled="pagination.page === pagination.totalPages"
          class="w-8 h-8 flex items-center justify-center rounded-lg border border-secondary/20 hover:bg-secondary/10 hover:text-primary disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          title="Halaman Selanjutnya">
          <font-awesome-icon icon="fa-solid fa-angle-right" />
        </button>
        <button @click="changePage(pagination.totalPages)" :disabled="pagination.page === pagination.totalPages"
          class="w-8 h-8 flex items-center justify-center rounded-lg border border-secondary/20 hover:bg-secondary/10 hover:text-primary disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          title="Halaman Terakhir">
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
