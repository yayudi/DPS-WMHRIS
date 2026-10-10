<script setup>
import { computed, ref, toRef } from 'vue'
import { FlexRender } from '@tanstack/vue-table'
import BaseSkeleton from '@/components/ui/BaseSkeleton.vue'
import { useMobile } from '@/composables/useMobile'
import { useSortIcon } from '@/composables/useSortIcon'
import { useSmartGrid } from '@/composables/useSmartGrid'
import BaseContextMenu from '@/components/ui/BaseContextMenu.vue'
import { useProductContextMenu } from '@/composables/useProductContextMenu'
import axios from '@/core/infrastructure/http.client'

const { isMobile } = useMobile()

const props = defineProps({
  products: { type: Array, required: true, default: () => [] },
  loading: Boolean,
  selectedIds: Set,
  sortBy: String,
  sortOrder: String,
  isFetchingNextPage: Boolean,
  hasNextPage: Boolean,
  dirtyProducts: Map,
  isSaving: Boolean
})

const emit = defineEmits([
  'sort',
  'fetch-more',
  'toggleSelection',
  'toggleSelectAll',
  'edit',
  'restore',
  'delete',
  'cell-edit',
  'duplicate',
  'view-history'
])

// --- COLLAPSIBLE ROW STATE + LAZY LOAD ---
const expandedRows = ref(new Set())
const componentCache = ref(new Map())
const loadingComponents = ref(new Set())

/**
 * Toggle expand row. Pada expand pertama, fetch komponen dari API lalu cache.
 * @param {number} id - Package product ID
 */
const toggleExpand = async id => {
  if (expandedRows.value.has(id)) {
    expandedRows.value.delete(id)
    return
  }

  // Expand row dulu (tampilkan skeleton jika belum ada cache)
  expandedRows.value.add(id)

  if (!componentCache.value.has(id)) {
    loadingComponents.value.add(id)
    try {
      const { data } = await axios.get(`/products/${id}`)
      componentCache.value.set(id, data.data?.components || [])
    } catch {
      componentCache.value.set(id, []) // fallback empty
    } finally {
      loadingComponents.value.delete(id)
    }
  }
}

/**
 * Clear cache untuk satu paket (dipanggil setelah modal save).
 * @param {number} [id] - Jika tidak diisi, clear seluruh cache.
 */
const clearComponentCache = id => {
  if (id) {
    componentCache.value.delete(id)
  } else {
    componentCache.value.clear()
  }
}

defineExpose({ clearComponentCache })

const isAllSelected = computed(() => {
  const productsList = props.products || []
  return productsList.length > 0 && productsList.every(p => props.selectedIds && props.selectedIds.has(p.id))
})

const { getSortIcon } = useSortIcon(toRef(props, 'sortBy'), toRef(props, 'sortOrder'))

// --- COLUMNS ---
const columns = [
  {
    id: 'select',
    header: () => null,
    cell: ({ row }) => row.original,
    meta: { width: '50px', sticky: 'left-0 z-30' }
  },
  {
    id: 'name',
    accessorKey: 'name',
    header: 'Nama Paket',
    meta: {
      width: '100%',
      sticky: 'left-12 z-20 shadow-[4px_0_8px_-4px_rgba(0,0,0,0.05)]',
      editable: true,
      type: 'string'
    }
  },
  {
    id: 'sku',
    accessorKey: 'sku',
    header: 'SKU Paket',
    meta: { width: '15%', editable: true, type: 'string' }
  },
  {
    id: 'components',
    header: 'Komponen',
    meta: { width: '15%', editable: false }
  },
  {
    id: 'price',
    accessorKey: 'price',
    header: 'Harga',
    meta: { width: '15%', editable: true, type: 'number', align: 'right' }
  },
  {
    id: 'status',
    header: 'Status',
    meta: { width: '12%', editable: false, align: 'center' }
  },
  {
    id: 'actions',
    header: 'Aksi',
    meta: { width: '50px', sticky: 'right-0 z-20 shadow-[-4px_0_8px_-4px_rgba(0,0,0,0.05)]', align: 'center' }
  }
]

// --- SMART GRID ---
const parentRef = ref(null)

const {
  table,
  rowVirtualizer,
  virtualRows,
  paddingTop,
  paddingBottom,
  handleCellBlur,
  handleCellFocus,
  formatCurrencyOrNumber,
  enforceNumberOnly
} = useSmartGrid({
  data: computed(() => props.products),
  columns,
  parentRef,
  estimateSize: 64, // Base height
  hasNextPage: toRef(props, 'hasNextPage'),
  isFetchingNextPage: toRef(props, 'isFetchingNextPage'),
  onFetchMore: () => emit('fetch-more'),
  onCellEdit: payload => emit('cell-edit', payload)
})

// Helper to safely get row data to avoid Vue proxy method loss issues
const getRow = index => {
  const row = table.getRowModel().rows[index]
  return row ? row.original : {}
}

// --- CONTEXT MENU ---
const { contextMenu, openContextMenu, handleContextMenuAction } = useProductContextMenu({
  props,
  emit
})

const onCellKeydown = (event, type) => {
  if (event.key === 'Enter') {
    event.preventDefault()
    event.target.blur()
    return
  }
  enforceNumberOnly(event, type)
}

const getReadinessScore = product => {
  const p = props.dirtyProducts?.has(product.id) ? { ...product, ...props.dirtyProducts.get(product.id) } : product

  let score = 0
  const total = 4

  const missing = []

  if (p.name && p.name.toString().trim() !== '') score++
  else missing.push('Nama Paket')
  if (p.sku && p.sku.toString().trim() !== '') score++
  else missing.push('SKU')
  if (Number(p.price) > 0) score++
  else missing.push('Harga')
  if (p.component_count > 0 || (p.components && p.components.length > 0)) score++
  else missing.push('Komponen')

  const percentage = Math.round((score / total) * 100)
  return {
    percentage,
    tooltip: missing.length ? `Data kurang: ${missing.join(', ')}` : 'Data sudah lengkap (100%)',
    color: percentage === 100 ? 'bg-success' : percentage >= 50 ? 'bg-warning' : 'bg-danger'
  }
}

const getValidationClass = product => {
  if (props.dirtyProducts && props.dirtyProducts.has(product.id)) {
    return 'bg-warning/10 hover:bg-warning/15 transition-colors'
  }
  return 'bg-background hover:bg-primary/5 transition-colors'
}
</script>

<template>
  <div
    class="bg-background rounded-2xl shadow-sm border border-secondary/20 overflow-hidden flex flex-col relative custom-scrollbar h-[calc(100vh-230px)] min-h-[500px]"
  >
    <!-- BLOCKING OVERLAY SAAT SIMPAN MASSAL -->
    <div v-if="isSaving" class="absolute inset-0 z-50 flex items-center justify-center bg-white/60 backdrop-blur-sm">
      <div class="flex flex-col items-center gap-2">
        <div class="w-8 h-8 border-4 border-primary/30 border-t-primary rounded-full animate-spin"></div>
        <span class="text-sm font-bold text-primary">Menyimpan data...</span>
      </div>
    </div>

    <!-- TABLE SCROLL AREA -->
    <div
      ref="parentRef"
      class="flex-1 overflow-auto relative custom-scrollbar"
      :class="isMobile ? 'rounded-b-none' : ''"
    >
      <table class="w-full text-left border-collapse" style="table-layout: fixed; min-width: 1100px">
        <colgroup>
          <col
            v-for="header in table.getFlatHeaders()"
            :key="header.id"
            :style="{ width: header.column.columnDef.meta?.width }"
          />
        </colgroup>

        <!-- HEADER -->
        <thead class="sticky top-0 z-40 bg-background/95 backdrop-blur-md shadow-sm ring-1 ring-secondary/5">
          <tr class="text-text/60 text-xs font-bold uppercase tracking-wider">
            <th
              v-for="header in table.getFlatHeaders()"
              :key="header.id"
              class="px-3 py-2 bg-secondary/5 border border-secondary/20"
              :class="[
                header.column.columnDef.meta?.sticky || '',
                header.column.columnDef.meta?.align === 'right'
                  ? 'text-right'
                  : header.column.columnDef.meta?.align === 'center'
                    ? 'text-center'
                    : 'text-left',
                header.column.id === 'name' || header.column.id === 'sku' || header.column.id === 'price'
                  ? 'cursor-pointer hover:bg-secondary/5 group select-none'
                  : ''
              ]"
              @click="
                header.column.id === 'name' || header.column.id === 'sku' || header.column.id === 'price'
                  ? emit('sort', header.column.id)
                  : null
              "
            >
              <div v-if="header.column.id === 'select'" class="flex items-center justify-center">
                <input
                  type="checkbox"
                  class="w-4 h-4 rounded border-secondary/30 text-primary focus:ring-primary cursor-pointer"
                  :checked="isAllSelected"
                  @change="emit('toggleSelectAll')"
                />
              </div>
              <div
                v-else
                class="flex items-center gap-2"
                :class="{
                  'justify-end': header.column.columnDef.meta?.align === 'right',
                  'justify-center': header.column.columnDef.meta?.align === 'center'
                }"
              >
                <FlexRender :render="header.column.columnDef.header" :props="header.getContext()" />
                <font-awesome-icon
                  v-if="header.column.id === 'name' || header.column.id === 'sku' || header.column.id === 'price'"
                  :icon="getSortIcon(header.column.id)"
                  class="text-text/30 group-hover:text-primary"
                  :class="{ 'text-primary': sortBy === header.column.id }"
                />
              </div>
            </th>
          </tr>
        </thead>

        <!-- BODY (Virtual) -->
        <!-- Loading Skeleton -->
        <tbody v-if="loading">
          <tr v-for="n in 10" :key="`skeleton-${n}`" class="animate-pulse">
            <td v-for="col in columns" :key="col.id" class="px-3 py-2 border border-secondary/20">
              <BaseSkeleton shape="text" class="w-full h-4" />
            </td>
          </tr>
        </tbody>

        <!-- Empty State -->
        <tbody v-else-if="products.length === 0">
          <tr>
            <td :colspan="columns.length" class="py-24 text-center">
              <div
                class="flex flex-col items-center justify-center p-8 border-2 border-dashed border-secondary/20 rounded-2xl max-w-md mx-auto bg-secondary/5"
              >
                <div
                  class="w-20 h-20 bg-background rounded-full flex items-center justify-center text-4xl text-primary/40 shadow-sm mb-4"
                >
                  <font-awesome-icon icon="fa-solid fa-box-open" />
                </div>
                <h3 class="text-lg font-bold text-text mb-2">Tidak ada paket ditemukan</h3>
                <p class="text-sm text-text/60 max-w-xs mx-auto">Coba sesuaikan kata kunci pencarian atau filter.</p>
              </div>
            </td>
          </tr>
        </tbody>

        <!-- Virtual Padding Top -->
        <tbody v-if="!loading && products.length > 0 && paddingTop > 0">
          <tr>
            <td :colspan="columns.length" :style="{ height: `${paddingTop}px` }"></td>
          </tr>
        </tbody>

        <!-- Data Rows (Individual tbodys for measuring) -->
        <template v-if="!loading && products.length > 0">
          <template v-for="virtualRow in virtualRows" :key="virtualRow.key">
            <tbody
              :ref="
                el => {
                  if (el) rowVirtualizer.measureElement(el)
                }
              "
              :data-index="virtualRow.index"
              class="group"
            >
              <tr class="border-b border-secondary/20" :class="getValidationClass(getRow(virtualRow.index))">
                <td
                  v-for="col in columns"
                  :key="col.id"
                  class="px-3 py-2 bg-inherit border border-secondary/20"
                  :class="[
                    col.meta?.sticky || '',
                    col.meta?.align === 'right'
                      ? 'text-right'
                      : col.meta?.align === 'center'
                        ? 'text-center'
                        : 'text-left'
                  ]"
                  @contextmenu.prevent.stop="openContextMenu($event, getRow(virtualRow.index), col.id)"
                >
                  <!-- SELECT -->
                  <div v-if="col.id === 'select'" class="flex items-center justify-center">
                    <input
                      type="checkbox"
                      class="w-4 h-4 rounded border-secondary/30 text-primary focus:ring-primary cursor-pointer"
                      :checked="selectedIds.has(getRow(virtualRow.index).id)"
                      @change="emit('toggleSelection', getRow(virtualRow.index).id)"
                    />
                  </div>

                  <!-- NAME -->
                  <div v-else-if="col.id === 'name'" class="flex items-center w-full min-w-0">
                    <div class="flex flex-col flex-1 min-w-0">
                      <div
                        class="font-bold text-text text-sm truncate focus:whitespace-normal focus:overflow-visible outline-none focus:ring-2 focus:ring-inset focus:ring-primary focus:bg-background/80 px-1 -mx-1 w-full"
                        :contenteditable="getRow(virtualRow.index).is_active && !isSaving"
                        :title="col.meta?.type === 'number' ? 'Hanya angka dan titik yang diperbolehkan' : ''"
                        @blur="handleCellBlur($event, getRow(virtualRow.index), 'name', 'string')"
                        @keydown="onCellKeydown($event, col.meta?.type)"
                      >
                        {{ getRow(virtualRow.index).name }}
                      </div>
                      <div
                        class="flex items-center gap-2 mt-1"
                        :title="getReadinessScore(getRow(virtualRow.index)).tooltip"
                      >
                        <div class="w-full h-1.5 bg-secondary/20 rounded-full overflow-hidden flex-1">
                          <div
                            class="h-full rounded-full transition-all duration-300"
                            :class="getReadinessScore(getRow(virtualRow.index)).color"
                            :style="{ width: `${getReadinessScore(getRow(virtualRow.index)).percentage}%` }"
                          ></div>
                        </div>
                        <span class="text-[9px] font-bold text-text/40 w-6 text-right">
                          {{ getReadinessScore(getRow(virtualRow.index)).percentage }}%
                        </span>
                      </div>
                    </div>
                  </div>

                  <!-- SKU -->
                  <div v-else-if="col.id === 'sku'">
                    <span
                      class="font-mono text-xs font-medium text-text/70 bg-secondary/10 px-2 py-1 rounded select-all"
                      :class="
                        col.meta?.editable && getRow(virtualRow.index).is_active && !isSaving
                          ? 'outline-none focus:ring-2 focus:ring-inset focus:ring-primary focus:bg-background/80 text-primary'
                          : ''
                      "
                      :contenteditable="col.meta?.editable && getRow(virtualRow.index).is_active && !isSaving"
                      @blur="handleCellBlur($event, getRow(virtualRow.index), col.id, col.meta?.type)"
                      @keydown="onCellKeydown($event, col.meta?.type)"
                    >
                      {{ getRow(virtualRow.index).sku }}
                    </span>
                  </div>

                  <!-- COMPONENTS TOGGLE -->
                  <div v-else-if="col.id === 'components'">
                    <button
                      @click="toggleExpand(getRow(virtualRow.index).id)"
                      class="flex items-center gap-2 text-xs font-medium px-2 py-1.5 rounded transition-colors hover:bg-secondary/10"
                      :class="
                        getRow(virtualRow.index).component_count > 0
                          ? 'text-primary'
                          : 'text-text/40 italic cursor-default'
                      "
                      :disabled="!getRow(virtualRow.index).component_count"
                    >
                      <font-awesome-icon
                        v-if="loadingComponents.has(getRow(virtualRow.index).id)"
                        icon="fa-solid fa-circle-notch"
                        spin
                        class="text-[10px]"
                      />
                      <font-awesome-icon
                        v-else-if="getRow(virtualRow.index).component_count > 0"
                        :icon="
                          expandedRows.has(getRow(virtualRow.index).id)
                            ? 'fa-solid fa-chevron-down'
                            : 'fa-solid fa-chevron-right'
                        "
                        class="text-[10px]"
                      />
                      <span v-if="getRow(virtualRow.index).component_count > 0">
                        {{ getRow(virtualRow.index).component_count }} Komponen
                      </span>
                      <span v-else>Tanpa Komponen</span>
                    </button>
                  </div>

                  <!-- STATUS -->
                  <div v-else-if="col.id === 'status'">
                    <span
                      class="px-2 py-1 text-[10px] font-bold uppercase tracking-wider rounded border mx-auto w-fit block"
                      :class="
                        getRow(virtualRow.index).is_active
                          ? 'bg-success/10 text-success border-success/20'
                          : 'bg-secondary/20 text-text/50 border-secondary/30'
                      "
                    >
                      {{ getRow(virtualRow.index).is_active ? 'Aktif' : 'Arsip' }}
                    </span>
                  </div>

                  <!-- ACTIONS -->
                  <div
                    v-else-if="col.id === 'actions'"
                    class="flex items-center justify-center opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity"
                  >
                    <button
                      @click.stop="openContextMenu($event, getRow(virtualRow.index), col.id)"
                      class="w-8 h-8 flex items-center justify-center rounded-full hover:bg-primary/10 text-text/40 hover:text-primary transition-colors"
                      title="Opsi Lanjutan"
                    >
                      <font-awesome-icon icon="fa-solid fa-ellipsis-vertical" />
                    </button>
                  </div>

                  <!-- DEFAULT EDITABLE (PRICE) -->
                  <div
                    v-else
                    class="text-sm font-medium text-text outline-none focus:ring-2 focus:ring-inset focus:ring-primary focus:bg-background/80 px-1 -mx-1"
                    :class="col.meta?.type === 'number' ? 'font-mono' : ''"
                    :contenteditable="col.meta?.editable && getRow(virtualRow.index).is_active && !isSaving"
                    :title="col.meta?.type === 'number' ? 'Hanya angka dan titik yang diperbolehkan' : ''"
                    @focus="handleCellFocus($event, getRow(virtualRow.index)[col.id], col.meta?.type)"
                    @blur="handleCellBlur($event, getRow(virtualRow.index), col.id, col.meta?.type)"
                    @keydown="onCellKeydown($event, col.meta?.type)"
                  >
                    {{ formatCurrencyOrNumber(getRow(virtualRow.index)[col.id], col.id) }}
                  </div>
                </td>
              </tr>

              <!-- EXPANDED DETAIL ROW -->
              <tr v-if="expandedRows.has(getRow(virtualRow.index).id)">
                <td :colspan="columns.length" class="p-0 border border-secondary/20 bg-secondary/5 shadow-inner">
                  <div class="py-4 px-12 flex flex-col md:flex-row gap-6">
                    <div class="flex-1 max-w-2xl">
                      <p class="text-xs font-bold text-text/50 uppercase mb-3 flex items-center gap-2">
                        <font-awesome-icon icon="fa-solid fa-layer-group" />
                        Rincian Komponen
                      </p>

                      <!-- Loading Skeleton -->
                      <div v-if="loadingComponents.has(getRow(virtualRow.index).id)" class="space-y-2">
                        <div
                          v-for="n in getRow(virtualRow.index).component_count || 2"
                          :key="n"
                          class="flex gap-4 animate-pulse"
                        >
                          <BaseSkeleton shape="text" class="w-24 h-4" />
                          <BaseSkeleton shape="text" class="flex-1 h-4" />
                          <BaseSkeleton shape="text" class="w-10 h-4" />
                        </div>
                      </div>

                      <!-- Loaded Data -->
                      <div v-else class="bg-background border border-secondary/20 rounded-lg overflow-hidden shadow-sm">
                        <table class="w-full text-sm text-left">
                          <thead class="bg-secondary/10 text-xs font-semibold text-text/70">
                            <tr>
                              <th class="px-4 py-2">SKU</th>
                              <th class="px-4 py-2">Nama Barang</th>
                              <th class="px-4 py-2 text-center">Qty / Paket</th>
                            </tr>
                          </thead>
                          <tbody class="divide-y divide-secondary/10">
                            <tr
                              v-for="comp in componentCache.get(getRow(virtualRow.index).id) || []"
                              :key="comp.id"
                              class="hover:bg-secondary/5"
                            >
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
                    <div class="w-64 shrink-0 flex flex-col gap-3 border-l border-secondary/10 pl-6 border-dashed">
                      <div>
                        <span class="text-xs text-text/50 block mb-1">Berat Total (Est.)</span>
                        <div class="font-mono text-sm font-medium">{{ getRow(virtualRow.index).weight }} kg</div>
                      </div>
                      <div>
                        <span class="text-xs text-text/50 block mb-1">Update Terakhir</span>
                        <div class="text-xs text-text/80">{{ new Date().toLocaleDateString('id-ID') }}</div>
                      </div>
                    </div>
                  </div>
                </td>
              </tr>
            </tbody>
          </template>
        </template>

        <!-- Virtual Padding Bottom -->
        <tbody v-if="!loading && products.length > 0 && paddingBottom > 0">
          <tr>
            <td :colspan="columns.length" :style="{ height: `${paddingBottom}px` }"></td>
          </tr>
        </tbody>

        <!-- Loading More Indicator -->
        <tbody v-if="isFetchingNextPage">
          <tr>
            <td :colspan="columns.length" class="py-6 text-center text-primary/70 font-bold text-sm">
              <div class="flex items-center justify-center gap-2">
                <font-awesome-icon icon="fa-solid fa-circle-notch" spin />
                <span>Memuat data selanjutnya...</span>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- CONTEXT MENU -->
    <BaseContextMenu
      :visible="contextMenu.visible"
      :x="contextMenu.x"
      :y="contextMenu.y"
      :options="contextMenu.options"
      @close="contextMenu.visible = false"
      @action="handleContextMenuAction"
    />
  </div>
</template>

<style scoped>
th.sticky,
td.sticky {
  background-clip: padding-box;
}

td.sticky {
  background-color: inherit;
}

.custom-scrollbar::-webkit-scrollbar {
  width: 8px;
  height: 8px;
}
.custom-scrollbar::-webkit-scrollbar-track {
  background: transparent;
}
.custom-scrollbar::-webkit-scrollbar-thumb {
  background: #cbd5e1;
  border-radius: 4px;
}
.custom-scrollbar::-webkit-scrollbar-thumb:hover {
  background: #94a3b8;
}
</style>
