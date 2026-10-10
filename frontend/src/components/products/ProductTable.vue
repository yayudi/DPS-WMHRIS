<script setup>
import { computed, ref, toRef } from 'vue'
import { FlexRender, stockFeatures } from '@tanstack/vue-table'
import { useSortIcon } from '@/composables/useSortIcon'
import { resolveProductImageUrl } from '@/composables/useImageUrl'
import ProductThumbnail from '@/components/common/ProductThumbnail.vue'
import BaseSkeleton from '@/components/ui/BaseSkeleton.vue'
import BaseSelect from '@/components/ui/BaseSelect.vue'
import BaseContextMenu from '@/components/ui/BaseContextMenu.vue'
import { useSmartGrid } from '@/composables/useSmartGrid'
import { useProductContextMenu } from '@/composables/useProductContextMenu'
import { useMobile } from '@/composables/useMobile'

const props = defineProps({
  products: { type: Array, required: true, default: () => [] },
  loading: Boolean,
  selectedIds: Set,
  sortBy: String,
  sortOrder: String,
  dirtyProducts: Map,
  isSaving: Boolean,
  isFetchingNextPage: Boolean,
  hasNextPage: Boolean,
  categoryOptions: {
    type: Array,
    default: () => []
  }
})

const emit = defineEmits([
  'sort',
  'fetch-more',
  'toggleSelection',
  'toggleSelectAll',
  'edit',
  'restore',
  'delete',
  'view-image',
  'open-sticker',
  'cell-edit',
  'view-history',
  'duplicate'
])

const { isMobile } = useMobile()
const activeEditCell = ref(null)

const startEditing = (rowId, colId) => {
  activeEditCell.value = `${rowId}-${colId}`
}

const stopEditing = () => {
  activeEditCell.value = null
}

const { contextMenu, openContextMenu, handleContextMenuAction } = useProductContextMenu({
  props,
  emit,
  features: ['sticker']
})

const isAllSelected = computed(() => {
  const productsList = props.products || []
  return productsList.length > 0 && productsList.every(p => props.selectedIds && props.selectedIds.has(p.id))
})

const { getSortIcon } = useSortIcon(toRef(props, 'sortBy'), toRef(props, 'sortOrder'))

// --- HELPER LOGIC ---
const getImageUrl = product => resolveProductImageUrl(product)

const getVirtualStock = product => {
  if (product.is_package && product.components && product.components.length > 0) {
    const possiblePackages = product.components.map(c => {
      const stockAvail = c.stock_available || 0
      const needed = c.quantity || 1
      return Math.floor(stockAvail / needed)
    })
    return Math.min(...possiblePackages)
  }
  return 0
}

const getCurrentStock = product => {
  const physicalStock = product.total_stock !== undefined ? product.total_stock : product.stock || 0
  if (product.is_package) {
    return physicalStock !== 0 ? physicalStock : getVirtualStock(product)
  }
  return physicalStock
}

const isArchived = product => product.is_active === 0 || product.deleted_at

// --- COLUMN DEFINITIONS ---
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
    header: 'Nama Produk',
    meta: {
      width: '32%',
      sticky: 'left-12 z-20 shadow-[4px_0_8px_-4px_rgba(0,0,0,0.05)]',
      editable: true,
      type: 'string'
    }
  },
  {
    id: 'sku',
    accessorKey: 'sku',
    header: 'SKU',
    meta: { width: '10%', editable: true, type: 'string' }
  },
  {
    id: 'category',
    accessorKey: 'category_name',
    header: 'Kategori',
    meta: { width: '17%', editable: true, type: 'select' }
  },
  {
    id: 'weight',
    accessorKey: 'weight',
    header: 'Berat (gr)',
    meta: { width: '9%', editable: true, type: 'number', align: 'right' }
  },
  {
    id: 'price',
    accessorKey: 'price',
    header: 'Harga',
    meta: { width: '12%', editable: true, type: 'number', align: 'right' }
  },
  {
    id: 'stock',
    header: 'Stok',
    meta: { width: '8%', editable: false, align: 'center' }
  },
  {
    id: 'status',
    header: 'Status',
    meta: { width: '8%', editable: false, align: 'center' }
  },
  {
    id: 'actions',
    header: 'Aksi',
    meta: { width: '50px', sticky: 'right-0 z-20 shadow-[-4px_0_8px_-4px_rgba(0,0,0,0.05)]', align: 'center' }
  }
]

const parentRef = ref(null)

const {
  table,
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
  estimateSize: 64,
  hasNextPage: toRef(props, 'hasNextPage'),
  isFetchingNextPage: toRef(props, 'isFetchingNextPage'),
  onFetchMore: () => emit('fetch-more'),
  onCellEdit: payload => emit('cell-edit', payload),
  tableFeatures: stockFeatures
})

const onCellBlur = (event, product, columnId) => {
  const metaType = table.getColumn(columnId).columnDef.meta?.type
  handleCellBlur(event, product, columnId, metaType)
}

const getRow = index => {
  const row = table.getRowModel().rows[index]
  return row ? row.original : {}
}

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
  const total = 5

  const missing = []

  if (p.name && p.name.toString().trim() !== '') score++
  else missing.push('Nama')
  if (p.sku && p.sku.toString().trim() !== '') score++
  else missing.push('SKU')
  if (p.category_id) score++
  else missing.push('Kategori')
  if (Number(p.weight) > 0) score++
  else missing.push('Berat')
  if (Number(p.price) > 0) score++
  else missing.push('Harga')

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
  return 'hover:bg-primary/5 transition-colors'
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
        <tbody>
          <!-- Loading Skeleton -->
          <template v-if="loading">
            <tr v-for="n in 10" :key="`skeleton-${n}`" class="animate-pulse">
              <td v-for="col in columns" :key="col.id" class="px-3 py-2 border border-secondary/20">
                <BaseSkeleton shape="text" class="w-full h-4" />
              </td>
            </tr>
          </template>

          <!-- Empty State -->
          <tr v-else-if="products.length === 0">
            <td :colspan="columns.length" class="py-24 text-center">
              <div
                class="flex flex-col items-center justify-center p-8 border-2 border-dashed border-secondary/20 rounded-2xl max-w-md mx-auto bg-secondary/5"
              >
                <div
                  class="w-20 h-20 bg-background rounded-full flex items-center justify-center text-4xl text-primary/40 shadow-sm mb-4"
                >
                  <font-awesome-icon icon="fa-solid fa-box-open" />
                </div>
                <h3 class="text-lg font-bold text-text mb-2">Tidak ada produk ditemukan</h3>
                <p class="text-sm text-text/60 max-w-xs mx-auto">Coba sesuaikan kata kunci pencarian atau filter.</p>
              </div>
            </td>
          </tr>

          <!-- Virtual Padding Top -->
          <tr v-if="!loading && products.length > 0 && paddingTop > 0">
            <td :colspan="columns.length" :style="{ height: `${paddingTop}px` }"></td>
          </tr>

          <!-- Data Rows -->
          <template v-if="!loading && products.length > 0">
            <tr
              v-for="virtualRow in virtualRows"
              :key="virtualRow.key"
              class="group"
              :class="[
                getValidationClass(getRow(virtualRow.index)),
                isArchived(getRow(virtualRow.index)) ? 'opacity-60 grayscale-[50%]' : ''
              ]"
            >
              <td
                v-for="col in columns"
                :key="col.id"
                class="bg-inherit border border-secondary/20 px-3 py-2"
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
                    class="w-4 h-4 bg-secondary rounded border-secondary/30 text-primary focus:ring-primary cursor-pointer"
                    :checked="selectedIds.has(getRow(virtualRow.index).id)"
                    @change="emit('toggleSelection', getRow(virtualRow.index).id)"
                  />
                </div>

                <!-- NAME & THUMBNAIL -->
                <div v-else-if="col.id === 'name'" class="flex items-center gap-3 w-full">
                  <div @click.stop>
                    <ProductThumbnail
                      :image-url="getImageUrl(getRow(virtualRow.index))"
                      @click="emit('view-image', getRow(virtualRow.index))"
                    />
                  </div>
                  <div class="flex flex-col flex-1 min-w-0">
                    <div class="flex items-center gap-2 mb-0.5">
                      <div
                        class="font-bold text-text text-sm truncate focus:whitespace-normal focus:overflow-visible outline-none focus:ring-2 focus:ring-inset focus:ring-primary focus:bg-background/80 px-1 -mx-1 w-full"
                        :contenteditable="!isArchived(getRow(virtualRow.index)) && !isSaving"
                        :title="col.meta?.type === 'number' ? 'Hanya angka dan titik yang diperbolehkan' : ''"
                        @blur="onCellBlur($event, getRow(virtualRow.index), 'name')"
                        @keydown="onCellKeydown($event, col.meta?.type)"
                      >
                        {{ getRow(virtualRow.index).name }}
                      </div>
                    </div>
                    <div
                      class="flex items-center gap-2 mt-1"
                      :title="getReadinessScore(getRow(virtualRow.index)).tooltip"
                    >
                      <span
                        v-if="getRow(virtualRow.index).is_package"
                        class="text-[9px] w-max bg-accent/10 text-accent px-1.5 py-0.5 rounded border border-accent/20 font-bold uppercase tracking-wider mr-1"
                      >
                        Paket
                      </span>
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
                    class="font-mono text-xs font-medium text-primary bg-primary/10 px-2 py-1 rounded border border-primary/20 select-all"
                    :class="
                      col.meta?.editable && !isArchived(getRow(virtualRow.index)) && !isSaving
                        ? 'outline-none focus:ring-2 focus:ring-inset focus:ring-primary focus:bg-background'
                        : ''
                    "
                    :contenteditable="col.meta?.editable && !isArchived(getRow(virtualRow.index)) && !isSaving"
                    @blur="onCellBlur($event, getRow(virtualRow.index), col.id)"
                    @keydown="onCellKeydown($event, col.meta?.type)"
                  >
                    {{ getRow(virtualRow.index).sku }}
                  </span>
                </div>

                <!-- CATEGORY -->
                <div
                  v-else-if="col.id === 'category'"
                  class="text-sm text-text/80 relative w-full h-full flex items-center"
                >
                  <!-- EDIT MODE -->
                  <template
                    v-if="
                      col.meta?.editable &&
                      !isArchived(getRow(virtualRow.index)) &&
                      !isSaving &&
                      activeEditCell === `${getRow(virtualRow.index).id}-category`
                    "
                  >
                    <BaseSelect
                      :options="categoryOptions"
                      track-by="id"
                      label="label"
                      :emit-value="true"
                      :auto-open="true"
                      :model-value="
                        dirtyProducts?.get(getRow(virtualRow.index).id)?.category_id ||
                        getRow(virtualRow.index).category_id ||
                        ''
                      "
                      class="w-full min-w-[150px]"
                      @update:modelValue="
                        $event => {
                          emit('cell-edit', {
                            id: getRow(virtualRow.index).id,
                            field: 'category_id',
                            value: Number($event) || null
                          })
                          stopEditing()
                        }
                      "
                      @click:outside="stopEditing()"
                    />
                  </template>

                  <!-- DISPLAY MODE -->
                  <template v-else>
                    <div
                      class="w-full h-full px-1 -mx-1 py-1 rounded border border-transparent flex items-center justify-between group"
                      :class="[
                        col.meta?.editable && !isArchived(getRow(virtualRow.index)) && !isSaving
                          ? 'cursor-pointer hover:border-secondary/20 hover:bg-secondary/5'
                          : '',
                        dirtyProducts?.has(getRow(virtualRow.index).id) &&
                        dirtyProducts.get(getRow(virtualRow.index).id).category_id
                          ? 'text-primary font-medium'
                          : 'text-text'
                      ]"
                      @click="
                        col.meta?.editable &&
                        !isArchived(getRow(virtualRow.index)) &&
                        !isSaving &&
                        startEditing(getRow(virtualRow.index).id, 'category')
                      "
                    >
                      <span class="truncate">
                        {{
                          categoryOptions.find(
                            c =>
                              c.id ===
                              (dirtyProducts?.get(getRow(virtualRow.index).id)?.category_id ||
                                getRow(virtualRow.index).category_id)
                          )?.label ||
                          getRow(virtualRow.index).category_name ||
                          '-'
                        }}
                      </span>
                      <font-awesome-icon
                        v-if="col.meta?.editable && !isArchived(getRow(virtualRow.index)) && !isSaving"
                        icon="fa-solid fa-chevron-down"
                        class="text-[10px] text-text/30 opacity-0 group-hover:opacity-100 transition-opacity"
                      />
                    </div>
                  </template>
                </div>

                <!-- STATUS -->
                <div v-else-if="col.id === 'status'">
                  <span
                    v-if="isArchived(getRow(virtualRow.index))"
                    class="px-2 py-1 text-[10px] font-bold rounded-full bg-secondary/20 text-text/50 border border-secondary/30 flex items-center justify-center gap-1 mx-auto w-fit"
                  >
                    <font-awesome-icon icon="fa-solid fa-box-archive" />
                    DIARSIPKAN
                  </span>
                  <span
                    v-else
                    class="px-2 py-1 text-[10px] font-bold rounded-full bg-success/10 text-success border border-success/20 flex items-center justify-center gap-1 mx-auto w-fit"
                  >
                    <font-awesome-icon icon="fa-solid fa-check" />
                    AKTIF
                  </span>
                </div>

                <!-- STOCK -->
                <div v-else-if="col.id === 'stock'" class="flex flex-col items-center">
                  <span
                    class="text-sm font-mono font-bold"
                    :class="{
                      'text-accent': getCurrentStock(getRow(virtualRow.index)) < 0,
                      'text-primary': getCurrentStock(getRow(virtualRow.index)) > 0,
                      'text-text/50': getCurrentStock(getRow(virtualRow.index)) === 0
                    }"
                  >
                    {{ getCurrentStock(getRow(virtualRow.index)) }}
                  </span>
                  <div
                    v-if="getRow(virtualRow.index).is_package"
                    class="text-[9px] text-text/50 font-normal leading-tight mt-0.5"
                  >
                    (Virtual: {{ getVirtualStock(getRow(virtualRow.index)) }})
                  </div>
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

                <!-- DEFAULT & EDITABLE CELLS (Weight, Price) -->
                <div
                  v-else
                  class="text-sm font-medium text-text outline-none focus:ring-2 focus:ring-inset focus:ring-primary focus:bg-background/80 px-1 -mx-1"
                  :class="col.meta?.type === 'number' ? 'font-mono' : ''"
                  :contenteditable="col.meta?.editable && !isArchived(getRow(virtualRow.index)) && !isSaving"
                  :title="col.meta?.type === 'number' ? 'Hanya angka dan titik yang diperbolehkan' : ''"
                  @focus="handleCellFocus($event, getRow(virtualRow.index)[col.id], col.meta?.type)"
                  @blur="onCellBlur($event, getRow(virtualRow.index), col.id)"
                  @keydown="onCellKeydown($event, col.meta?.type)"
                >
                  {{ formatCurrencyOrNumber(getRow(virtualRow.index)[col.id], col.id) }}
                </div>
              </td>
            </tr>
          </template>

          <!-- Virtual Padding Bottom -->
          <tr v-if="!loading && products.length > 0 && paddingBottom > 0">
            <td :colspan="columns.length" :style="{ height: `${paddingBottom}px` }"></td>
          </tr>

          <!-- Loading More Indicator -->
          <tr v-if="isFetchingNextPage">
            <td :colspan="columns.length" class="py-6 text-center text-primary/70 font-bold text-sm">
              <div v-if="isFetchingNextPage" class="flex items-center justify-center gap-2">
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
/* Untuk mencegah background transparan pada sticky columns */
th.sticky,
td.sticky {
  background-clip: padding-box;
}

td.sticky {
  background-color: inherit; /* will inherit from tr */
}

/* Kustomisasi scrollbar dalam tabel */
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
