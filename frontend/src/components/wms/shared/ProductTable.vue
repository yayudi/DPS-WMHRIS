<!-- frontend/src/components/wms/shared/ProductTable.vue -->
<script setup>
import { computed, ref, onMounted, onUnmounted } from 'vue'
import { useAuthStore } from '@/stores/auth.js'
import BaseSkeleton from '@/components/ui/BaseSkeleton.vue'
import { fetchProductById } from '@/api/helpers/products.js'
import { formatNumber, formatCurrency } from '@/utils/formatters.js'
import FloatingTooltip from '@/components/ui/FloatingTooltip.vue'
import { useFloating, offset, flip, shift, autoUpdate } from '@floating-ui/vue'
import { resolveProductImageUrl } from '@/composables/useImageUrl'
import ProductThumbnail from '@/components/common/ProductThumbnail.vue'
import { useMobile } from '@/composables/useMobile'
import { useClipboard } from '@/composables/useClipboard'
import { watch } from 'vue'

const props = defineProps({
  products: { type: Array, required: true },
  activeView: { type: String, required: true },
  sortBy: String,
  sortOrder: String,
  recentlyUpdatedProducts: {
    type: Set,
    required: false,
    default: () => new Set()
  },
  loading: { type: Boolean, default: false },
  mobileLayout: { type: String, default: 'card' },
  visibleColumns: { type: Object, required: true }
})

const emit = defineEmits([
  'copy',
  'openAdjust',
  'openTransfer',
  'sort',
  'openHistory',
  'openEdit',
  'delete',
  'view-image',
  'openSticker'
])

const auth = useAuthStore()
const { isMobile } = useMobile()
const { copyToClipboard } = useClipboard()
const PPN_RATE = 0.11

watch(
  () => props.products,
  newVal => {
    console.log('[Table Render] Products:', newVal)
  },
  { immediate: true }
)

// --- SINGLETON STATE ---
const activeProduct = ref(null)
const localComponents = ref([])
const isLoadingComponents = ref(false)

// References
const locationTargetRef = ref(null)
const packageTargetRef = ref(null)
const priceTargetRef = ref(null)
const menuTargetRef = ref(null)

// Visibilities
const isLocationTooltipVisible = ref(false)
const isPackageTooltipVisible = ref(false)
const isPriceTooltipVisible = ref(false)
const isMenuVisible = ref(false)

const menuFloating = ref(null)
const { floatingStyles: menuFloatingStyles } = useFloating(menuTargetRef, menuFloating, {
  placement: 'bottom-end',
  strategy: 'fixed',
  middleware: [offset(4), flip(), shift({ padding: 8 })],
  whileElementsMounted: autoUpdate
})

// --- HELPERS ---
function handleSort(column) {
  emit('sort', column)
}

function sortIcon(column) {
  if (props.sortBy !== column) return 'fa-solid fa-sort'
  if (props.sortOrder === 'asc') return 'fa-solid fa-sort-up'
  return 'fa-solid fa-sort-down'
}

function getImageUrl(product) {
  return resolveProductImageUrl(product)
}

function getCurrentLocation(product) {
  if (props.activeView === 'all') return product.allLocationsCode || '-'
  if (props.activeView === 'gudang') return product.lokasiGudang || '-'
  if (props.activeView === 'pajangan') return product.lokasiPajangan || '-'
  if (props.activeView === 'ltc') return product.lokasiLTC || '-'
  return '-'
}

function getVirtualStock(product) {
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

function getCurrentStock(product) {
  let physicalStock = 0
  if (props.activeView === 'all') physicalStock = product.totalStock
  else if (props.activeView === 'gudang') physicalStock = product.stockGudang
  else if (props.activeView === 'pajangan') physicalStock = product.stockPajangan
  else if (props.activeView === 'ltc') physicalStock = product.stockLTC

  return physicalStock !== 0 && physicalStock !== null ? physicalStock : getVirtualStock(product)
}

function getDisplayWeight(product) {
  if (product.weight && product.weight > 0) return product.weight
  if (product.is_package && product.components && product.components.length > 0) {
    const hasUnweighedComponent = product.components.some(c => !c.weight || c.weight <= 0)
    if (hasUnweighedComponent) return 0
    return product.components.reduce((sum, c) => sum + (c.weight || 0) * (c.quantity || 1), 0)
  }
  return 0
}

function hasMultipleLocations(product) {
  const allLocations = product.stock_locations || []
  let count = 0
  if (props.activeView === 'all') count = allLocations.filter(loc => loc.quantity !== 0).length
  else if (props.activeView === 'gudang')
    count = allLocations.filter(loc => loc.purpose === 'WAREHOUSE' && loc.quantity !== 0).length
  else if (props.activeView === 'pajangan')
    count = allLocations.filter(loc => loc.purpose === 'DISPLAY' && loc.quantity !== 0).length
  return count > 1
}

// --- TOOLTIP & MENU HANDLERS ---
const locationsForTooltip = computed(() => {
  if (!activeProduct.value) return []
  const allLocations = activeProduct.value.stock_locations || []
  if (props.activeView === 'all') return allLocations.filter(loc => loc.quantity !== 0)
  if (props.activeView === 'gudang')
    return allLocations.filter(loc => loc.purpose === 'WAREHOUSE' && loc.quantity !== 0)
  if (props.activeView === 'pajangan')
    return allLocations.filter(loc => loc.purpose === 'DISPLAY' && loc.quantity !== 0)
  return []
})

function toggleLocationTooltip(event, product) {
  if (hasMultipleLocations(product)) {
    if (activeProduct.value?.id === product.id && isLocationTooltipVisible.value) {
      isLocationTooltipVisible.value = false
      return
    }
    activeProduct.value = product
    locationTargetRef.value = event.currentTarget
    isLocationTooltipVisible.value = true
    isPackageTooltipVisible.value = false
    isMenuVisible.value = false
  }
}

async function togglePackageTooltip(event, product) {
  if (activeProduct.value?.id === product.id && isPackageTooltipVisible.value) {
    isPackageTooltipVisible.value = false
    return
  }
  activeProduct.value = product
  packageTargetRef.value = event.currentTarget
  isPackageTooltipVisible.value = true
  isLocationTooltipVisible.value = false
  isMenuVisible.value = false

  if (product.components && product.components.length > 0) {
    localComponents.value = product.components
  } else {
    isLoadingComponents.value = true
    try {
      const data = await fetchProductById(product.id)
      localComponents.value = data?.components || []
      product.components = localComponents.value
    } catch {
      localComponents.value = []
    } finally {
      isLoadingComponents.value = false
    }
  }
}

function showPriceTooltip(event, product) {
  activeProduct.value = product
  priceTargetRef.value = event.currentTarget
  isPriceTooltipVisible.value = true
}

function hidePriceTooltip() {
  isPriceTooltipVisible.value = false
}

function toggleMenu(event, product) {
  if (activeProduct.value?.id === product.id && isMenuVisible.value) {
    isMenuVisible.value = false
    return
  }
  activeProduct.value = product
  menuTargetRef.value = event.currentTarget
  isMenuVisible.value = true
  isLocationTooltipVisible.value = false
  isPackageTooltipVisible.value = false
}

function handleMenuAction(action) {
  emit(action, activeProduct.value)
  isMenuVisible.value = false
}

function handleClickOutside(event) {
  if (!event.target.closest('.location-cell') && !event.target.closest('.tooltip-teleported')) {
    isLocationTooltipVisible.value = false
  }
  if (!event.target.closest('.package-badge-trigger') && !event.target.closest('.package-tooltip-teleported')) {
    isPackageTooltipVisible.value = false
  }
  if (!event.target.closest('.action-btn') && !event.target.closest('.menu-teleported')) {
    isMenuVisible.value = false
  }
}

onMounted(() => {
  document.addEventListener('mousedown', handleClickOutside)
})
onUnmounted(() => {
  document.removeEventListener('mousedown', handleClickOutside)
})
</script>

<template>
  <div
    class="bg-background rounded-lg overflow-x-auto overflow-y-auto relative custom-scrollbar h-[80vh] table-container"
  >
    <table class="min-w-full md:min-w-[1000px] w-full bg-background text-sm text-text border-collapse rounded-xl">
      <!-- STATIC HEADER -->
      <thead
        class="hidden md:table-header-group sticky top-0 z-50 bg-background shadow-sm uppercase text-xs font-bold text-text/60"
      >
        <tr>
          <th
            class="px-4 py-3 w-16 text-center md:sticky md:left-0 z-30 bg-background md:shadow-[4px_0_8px_-4px_rgba(0,0,0,0.05)]"
          >
            Foto
          </th>
          <th
            class="px-6 py-3 md:sticky md:left-16 md:border-r md:border-secondary/50 z-30 bg-background md:shadow-[4px_0_8px_-4px_rgba(0,0,0,0.05)] text-left cursor-pointer hover:text-primary transition-colors min-w-[250px] md:w-[350px]"
            @click="handleSort('name')"
          >
            <div class="flex items-center gap-2">Produk <font-awesome-icon :icon="sortIcon('name')" /></div>
          </th>
          <th
            v-if="visibleColumns.has('sku')"
            class="px-6 py-3 text-left md:border-r md:border-secondary/50 cursor-pointer hover:text-primary transition-colors"
            @click="handleSort('sku')"
          >
            <div class="flex items-center gap-2">SKU <font-awesome-icon :icon="sortIcon('sku')" /></div>
          </th>
          <th
            v-if="visibleColumns.has('category')"
            class="px-6 py-3 text-left md:border-r md:border-secondary/50 cursor-pointer hover:text-primary transition-colors"
            @click="handleSort('category_name')"
          >
            <div class="flex items-center gap-2">Kategori <font-awesome-icon :icon="sortIcon('category_name')" /></div>
          </th>
          <th
            v-if="visibleColumns.has('weight')"
            class="px-6 py-3 text-right md:border-r md:border-secondary/50 cursor-pointer hover:text-primary transition-colors"
            @click="handleSort('weight')"
          >
            <div class="flex items-center justify-end gap-2">
              Berat <font-awesome-icon :icon="sortIcon('weight')" />
            </div>
          </th>
          <th v-if="visibleColumns.has('dimension')" class="px-6 py-3 text-right md:border-r md:border-secondary/50">
            <div class="flex items-center justify-end gap-2">Dimensi (L x W x H)</div>
          </th>
          <th
            v-if="auth.canViewPrices && visibleColumns.has('price')"
            class="px-6 py-3 text-right md:border-r md:border-secondary/50 cursor-pointer hover:text-primary transition-colors"
            @click="handleSort('price')"
          >
            <div class="flex items-center justify-end gap-2">Harga <font-awesome-icon :icon="sortIcon('price')" /></div>
          </th>
          <th v-if="visibleColumns.has('location')" class="px-6 py-3 text-center md:border-r md:border-secondary/50">
            Lokasi
          </th>
          <th v-if="visibleColumns.has('stock')" class="px-6 py-3 text-center md:border-r md:border-secondary/50">
            Stok
          </th>
          <th
            class="p-3 md:sticky md:right-0 z-30 bg-background md:border-r md:border-secondary/50 md:shadow-[-4px_0_8px_-4px_rgba(0,0,0,0.05)] text-center w-[40px]"
          >
            Aksi
          </th>
        </tr>
      </thead>

      <!-- TABLE BODY -->
      <TransitionGroup
        tag="tbody"
        name="list"
        class="divide-y divide-secondary/5 relative custom-scrollbar h-auto"
        :class="isMobile ? 'bg-secondary/35' : 'bg-background'"
      >
        <template v-if="loading">
          <tr v-for="n in 10" :key="`skeleton-${n}`" class="border-b border-secondary/20 animate-pulse">
            <td v-for="i in 8" :key="i" class="px-6 py-4">
              <BaseSkeleton
                :shape="i === 8 ? 'rect' : 'text'"
                :className="i === 1 ? 'w-8 h-4 mx-auto' : i === 8 ? 'w-12 h-6 mx-auto rounded-md' : 'w-full h-4'"
              />
            </td>
          </tr>
        </template>

        <tr v-else-if="!products.length" key="empty">
          <td :colspan="auth.canViewPrices ? 9 : 8" class="py-12 text-center text-text/50 italic">
            Tidak ada produk yang ditemukan.
          </td>
        </tr>

        <!-- ROW COMPONENT MERGED -->
        <tr
          v-else
          v-for="product in products"
          :key="product.id"
          class="group relative transition-colors duration-500 md:table-row mb-2 bg-background md:bg-background border md:border-0 border-secondary/20 rounded-xl md:rounded-none shadow-sm md:shadow-none overflow-hidden cursor-pointer"
          :class="[
            recentlyUpdatedProducts.has(product.id) ? 'bg-success/20' : 'md:hover:bg-secondary/20',
            mobileLayout === 'compact'
              ? 'grid grid-cols-[1fr_auto] gap-x-2 p-2 items-start'
              : 'grid grid-cols-2 gap-x-4 gap-y-2 p-3'
          ]"
          @click="$emit('openEdit', product)"
        >
          <!-- IMAGE (Sticky Left) -->
          <td
            class="hidden md:table-cell p-0 md:px-3 md:py-2 text-center whitespace-nowrap md:border-b border-secondary/10 md:border-secondary/80 md:sticky md:left-0 z-20 group-hover:bg-gradient-to-r group-hover:from-secondary/10 group-hover:to-secondary/10 transition-colors md:shadow-[4px_0_8px_-4px_rgba(0,0,0,0.05)] bg-background w-16"
          >
            <div @click.stop>
              <ProductThumbnail :image-url="getImageUrl(product)" @click="$emit('view-image', product)" />
            </div>
          </td>

          <!-- NAME (Sticky Left next to Image) -->
          <td
            class="md:table-cell flex items-center justify-between p-0 md:px-3 md:py-2 whitespace-nowrap md:border-b border-secondary/10 md:border-secondary/80 md:sticky md:left-16 z-20 group-hover:bg-gradient-to-r group-hover:from-secondary/10 group-hover:to-secondary/10 transition-colors md:shadow-[4px_0_8px_-4px_rgba(0,0,0,0.05)] bg-background"
            :class="mobileLayout === 'compact' ? 'col-span-1' : 'col-span-2'"
          >
            <div class="flex items-center gap-3 w-full overflow-x-auto custom-scrollbar">
              <!-- Mobile Thumbnail -->
              <div @click.stop v-if="isMobile">
                <ProductThumbnail :image-url="getImageUrl(product)" @click="$emit('view-image', product)" />
              </div>
              <div class="flex flex-col w-full">
                <div class="flex items-center gap-2 w-full">
                  <span
                    @click.stop="copyToClipboard(product.name, 'Nama Produk')"
                    class="font-bold text-text cursor-pointer hover:text-primary transition-colors text-sm md:text-base w-full"
                    :title="product.name"
                  >
                    {{ product.name }}
                  </span>
                  <span
                    v-if="product.is_package"
                    @click.stop="togglePackageTooltip($event, product)"
                    class="package-badge-trigger shrink-0 inline-block px-1.5 py-0.5 rounded text-[9px] font-bold bg-accent/10 text-accent border border-accent/20 tracking-wide cursor-pointer hover:bg-accent/20 transition-colors"
                  >
                    PAKET
                  </span>
                </div>
                <!-- SKU Mobile Compact -->
                <span
                  v-if="mobileLayout === 'compact' && visibleColumns.has('sku')"
                  class="md:hidden text-[11px] text-text/50 font-mono mt-0.5 truncate block"
                >
                  {{ product.sku }}
                </span>
              </div>
            </div>
            <!-- Mobile Menu Button (Card Mode Only) -->
            <button
              v-if="mobileLayout === 'card'"
              @click.stop="toggleMenu($event, product)"
              class="md:hidden action-btn w-8 h-8 flex items-center justify-center rounded-full hover:bg-secondary/20 text-text/60 hover:text-primary transition-colors ml-auto shrink-0"
            >
              <font-awesome-icon icon="fa-solid fa-ellipsis-vertical" />
            </button>
          </td>

          <!-- SKU -->
          <td
            v-if="visibleColumns.has('sku')"
            class="md:table-cell flex justify-between items-center px-4 py-2 md:px-3 md:py-2 whitespace-nowrap border-b border-secondary/10 md:border-secondary/80"
            :class="{ 'hidden md:flex': mobileLayout === 'compact' }"
          >
            <span class="md:hidden text-[10px] font-bold text-text/50 uppercase tracking-wide">SKU</span>
            <div class="text-left text-xs text-text/70 font-mono">
              <span
                @click.stop="copyToClipboard(product.sku, 'SKU')"
                class="cursor-pointer hover:text-primary bg-secondary/5 px-2 py-1 z-50 rounded border border-secondary/80 transition-colors"
              >
                {{ product.sku }}
              </span>
            </div>
          </td>

          <!-- CATEGORY -->
          <td
            v-if="visibleColumns.has('category')"
            class="md:table-cell flex justify-between items-center px-4 py-2 md:px-3 md:py-2 whitespace-nowrap border-b border-secondary/10 md:border-secondary/80"
            :class="{ 'hidden md:flex': mobileLayout === 'compact' }"
          >
            <span class="md:hidden text-[10px] font-bold text-text/50 uppercase tracking-wide">Kategori</span>
            <span class="text-xs text-text/60 font-medium">{{ product.category_name || '-' }}</span>
          </td>

          <!-- WEIGHT -->
          <td
            v-if="visibleColumns.has('weight')"
            class="md:table-cell flex justify-between items-center px-4 py-2 md:px-3 md:py-2 text-right whitespace-nowrap text-xs text-text/70 font-mono border-b border-secondary/10 md:border-secondary/80"
            :class="{ 'hidden md:flex': mobileLayout === 'compact' }"
          >
            <span class="md:hidden text-[10px] font-bold text-text/50 uppercase tracking-wide">Berat</span>
            <span>{{ formatNumber(getDisplayWeight(product)) }} gr</span>
          </td>

          <!-- DIMENSION -->
          <td
            v-if="visibleColumns.has('dimension')"
            class="md:table-cell flex justify-between items-center px-4 py-2 md:px-3 md:py-2 text-right whitespace-nowrap text-xs text-text/70 font-mono border-b border-secondary/10 md:border-secondary/80"
            :class="{ 'hidden md:flex': mobileLayout === 'compact' }"
          >
            <span class="md:hidden text-[10px] font-bold text-text/50 uppercase tracking-wide">Dimensi</span>
            <span>{{ product.length || 0 }} x {{ product.width || 0 }} x {{ product.height || 0 }} cm</span>
          </td>

          <!-- PRICE -->
          <td
            v-if="auth.canViewPrices && visibleColumns.has('price')"
            class="md:table-cell flex justify-between items-center px-4 py-2 md:px-3 md:py-2 text-right whitespace-nowrap text-sm text-text/70 font-mono border-b border-secondary/10 md:border-secondary/80"
            :class="{ 'hidden md:flex': mobileLayout === 'compact' }"
          >
            <span class="md:hidden text-[10px] font-bold text-text/50 uppercase tracking-wide">Harga</span>
            <span
              @click.stop="copyToClipboard(product.price, 'Harga')"
              @mouseenter="showPriceTooltip($event, product)"
              @mouseleave="hidePriceTooltip"
              class="cursor-pointer hover:text-primary transition-colors"
            >
              {{ formatCurrency(product.price) }}
            </span>
          </td>

          <!-- LOCATION -->
          <td
            v-if="visibleColumns.has('location')"
            class="md:table-cell flex justify-between items-center px-4 py-2 md:px-3 md:py-2 text-center whitespace-nowrap location-cell relative border-b border-secondary/10 md:border-secondary/80"
            :class="[
              {
                'cursor-pointer hover:text-primary text-primary font-bold': hasMultipleLocations(product)
              },
              { 'hidden md:flex': mobileLayout === 'compact' }
            ]"
            @click.stop="toggleLocationTooltip($event, product)"
          >
            <span class="md:hidden text-[10px] font-bold text-text/50 uppercase tracking-wide">Lokasi</span>
            <span
              class="text-xs text-text/70 font-mono truncate block max-w-[150px] mx-auto"
              :title="getCurrentLocation(product)"
            >
              {{ getCurrentLocation(product) }}
            </span>
          </td>

          <!-- STOCK -->
          <td
            v-if="visibleColumns.has('stock')"
            class="md:table-cell flex flex-col justify-start items-end md:justify-center md:items-center p-0 md:px-3 md:py-2 text-center whitespace-nowrap border-b-0 md:border-b border-secondary/80"
            :class="mobileLayout === 'compact' ? 'col-span-1' : ''"
          >
            <div class="md:hidden flex flex-col items-end gap-0.5">
              <span v-if="mobileLayout === 'card'" class="text-[10px] font-bold text-text/50 uppercase tracking-wide"
                >Stok Total</span
              >
              <span
                class="text-sm font-mono font-bold"
                :class="{
                  'text-accent': getCurrentStock(product) < 0,
                  'text-primary': getCurrentStock(product) > 0,
                  'text-text/50': getCurrentStock(product) === 0 || getCurrentStock(product) === null
                }"
              >
                {{ getCurrentStock(product) || 0 }}
                <!-- Virtual Stock Info -->
                <div v-if="product.is_package" class="text-[10px] text-text/50 font-normal leading-tight">
                  (Virtual: {{ getVirtualStock(product) }}
                  <span class="text-[9px] cursor-help" title="Stok Virtual (Kalkulasi dari Komponen)">[V]</span>)
                </div>
              </span>
              <!-- Price for Compact Mode -->
              <span
                v-if="mobileLayout === 'compact' && auth.canViewPrices && visibleColumns.has('price')"
                class="text-[10px] font-mono text-text/60"
              >
                {{ formatCurrency(product.price) }}
              </span>
            </div>

            <!-- Desktop View -->
            <span
              class="hidden md:inline text-sm font-mono font-bold"
              :class="{
                'text-accent': getCurrentStock(product) < 0,
                'text-primary': getCurrentStock(product) > 0,
                'text-text/50': getCurrentStock(product) === 0 || getCurrentStock(product) === null
              }"
            >
              {{ getCurrentStock(product) || 0 }}
              <!-- Virtual Stock Info -->
              <span v-if="product.is_package" class="text-[10px] text-text/50 font-normal ml-1">
                (Virtual: {{ getVirtualStock(product) }}
                <span class="text-[9px] cursor-help" title="Stok Virtual (Kalkulasi dari Komponen)">[V]</span>)
              </span>
            </span>
          </td>

          <!-- ACTIONS (Sticky Right) -->
          <td
            class="hidden md:table-cell p-3 w-[80px] text-center md:sticky md:right-0 z-20 bg-background group-hover:bg-gradient-to-r group-hover:from-secondary/10 group-hover:to-secondary/10 transition-colors shadow-[-4px_0_8px_-4px_rgba(0,0,0,0.05)] border-b border-secondary/80"
          >
            <div class="flex justify-center items-center relative">
              <button
                @click.stop="toggleMenu($event, product)"
                class="action-btn w-8 h-8 flex items-center justify-center rounded-full hover:bg-secondary/20 text-text/60 hover:text-primary transition-colors"
              >
                <font-awesome-icon icon="fa-solid fa-ellipsis-vertical" />
              </button>
            </div>
          </td>
        </tr>
      </TransitionGroup>
    </table>

    <!-- SINGLETON FLOATING ELEMENTS -->
    <!-- Location Tooltip -->
    <FloatingTooltip
      class="tooltip-teleported"
      :show="isLocationTooltipVisible"
      :reference-el="locationTargetRef"
      title="Detail Lokasi"
      interactive
    >
      <ul class="space-y-1.5">
        <li v-for="loc in locationsForTooltip" :key="loc.location_code" class="flex justify-between items-center gap-4">
          <span class="font-mono text-primary-light">{{ loc.location_code }}</span>
          <span class="font-bold bg-primary/10 text-primary px-1.5 rounded">
            {{ loc.quantity }}
          </span>
        </li>
      </ul>
    </FloatingTooltip>

    <!-- Package Components Tooltip -->
    <FloatingTooltip
      class="package-tooltip-teleported"
      :show="isPackageTooltipVisible"
      :reference-el="packageTargetRef"
      title="Komponen Paket"
      :loading="isLoadingComponents"
      interactive
    >
      <div v-if="localComponents && localComponents.length > 0">
        <ul class="space-y-2">
          <li
            v-for="comp in localComponents"
            :key="comp.id || comp.component_product_id"
            class="flex items-start gap-2"
          >
            <div class="font-bold bg-accent/10 text-accent px-1.5 py-0.5 rounded text-[10px] shrink-0 font-mono">
              {{ comp.quantity || comp.quantity_per_package }}x
            </div>
            <div class="flex flex-col min-w-0">
              <span
                @click.stop="copyToClipboard(comp.name, 'Nama Produk')"
                class="font-semibold text-text truncate leading-tight hover:text-primary cursor-pointer"
                >{{ comp.name }}</span
              >
              <span class="text-[10px] text-text/60 font-mono truncate">{{ comp.sku }}</span>
            </div>
          </li>
        </ul>
      </div>
      <div v-else class="text-center py-2 text-text/50 italic">Tidak ada data komponen</div>
    </FloatingTooltip>

    <!-- Price Tooltip -->
    <FloatingTooltip
      v-if="activeProduct"
      :show="isPriceTooltipVisible"
      :reference-el="priceTargetRef"
      title="Harga + PPN"
    >
      <div class="flex justify-between gap-4 min-w-[120px]">
        <span class="text-text/70">DPP:</span>
        <span class="font-mono">{{ formatCurrency(activeProduct.price) }}</span>
      </div>
      <div class="flex justify-between gap-4 font-bold text-primary mt-1 pt-1 border-t border-secondary/20">
        <span>Final (11%):</span>
        <span class="font-mono">{{ formatCurrency(activeProduct.price * (1 + PPN_RATE)) }}</span>
      </div>
    </FloatingTooltip>

    <!-- Action Menu -->
    <Teleport to="body">
      <Transition name="fade">
        <div
          v-if="isMenuVisible"
          ref="menuFloating"
          class="menu-teleported fixed z-[9999] bg-background text-text w-48 rounded-lg shadow-xl border border-secondary py-1 text-sm overflow-hidden"
          :style="menuFloatingStyles"
        >
          <button
            v-if="auth.hasPermission('manage-stock-adjustment')"
            @click="handleMenuAction('openAdjust')"
            class="w-full text-left px-4 py-2.5 hover:bg-primary/10 hover:text-primary flex items-center gap-3 transition-colors"
          >
            <font-awesome-icon icon="fa-solid fa-calculator" class="w-4 text-center" /> Sesuaikan Stok
          </button>

          <button
            @click="handleMenuAction('openTransfer')"
            class="w-full text-left px-4 py-2.5 hover:bg-primary/10 hover:text-primary flex items-center gap-3 transition-colors"
          >
            <font-awesome-icon icon="fa-solid fa-right-left" class="w-4 text-center" /> Transfer Stok
          </button>

          <button
            @click="handleMenuAction('openSticker')"
            class="w-full text-left px-4 py-2.5 hover:bg-primary/10 hover:text-primary flex items-center gap-3 transition-colors"
          >
            <font-awesome-icon icon="fa-solid fa-print" class="w-4 text-center" /> Cetak Sticker
          </button>

          <div class="h-px bg-primary/10 my-1"></div>

          <button
            v-if="auth.hasPermission('product.image.view')"
            @click="handleMenuAction('openEdit')"
            class="w-full text-left px-4 py-2.5 hover:bg-warning/10 hover:text-warning flex items-center gap-3 transition-colors"
          >
            <font-awesome-icon icon="fa-solid fa-pencil" class="w-4 text-center" /> Edit Produk
          </button>

          <button
            @click="handleMenuAction('openHistory')"
            class="w-full text-left px-4 py-2.5 hover:bg-accent/10 hover:text-accent flex items-center gap-3 transition-colors"
          >
            <font-awesome-icon icon="fa-solid fa-clock-rotate-left" class="w-4 text-center" />
            Riwayat
          </button>

          <div v-if="auth.hasPermission('product.image.delete')" class="h-px bg-secondary/10 my-1"></div>

          <button
            v-if="auth.hasPermission('product.image.delete')"
            @click="handleMenuAction('delete')"
            class="w-full text-left px-4 py-2.5 text-danger hover:bg-danger/10 flex items-center gap-3 transition-colors"
          >
            <font-awesome-icon icon="fa-solid fa-trash" class="w-4 text-center" /> Hapus Produk
          </button>
        </div>
      </Transition>
    </Teleport>

    <slot name="footer" />
  </div>
</template>

<style scoped>
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
  transition: all 0.3s ease;
}

.animate-scale-in {
  animation: scaleIn 0.1s ease-out forwards;
  transform-origin: top right;
}

@keyframes scaleIn {
  from {
    opacity: 0;
    transform: scale(0.95);
  }

  to {
    opacity: 1;
    transform: scale(1);
  }
}
</style>
