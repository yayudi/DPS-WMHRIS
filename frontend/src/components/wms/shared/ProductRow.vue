<!-- frontend\src\components\wms\shared\ProductRow.vue -->
<script setup>
import { computed, ref, onMounted, onUnmounted } from 'vue'
import { useAuthStore } from '@/stores/auth.js'
import { formatCurrency } from '@/utils/formatters.js'

const props = defineProps({
  product: { type: Object, required: true },
  activeView: { type: String, required: true },
  isUpdated: { type: Boolean, default: false },
})

const emit = defineEmits([
  'copy',
  'openAdjust',
  'openTransfer',
  'openHistory',
  'openEdit',
  'delete',
])
const auth = useAuthStore()

// --- STATE ---
const tooltipContainer = ref(null)

// Tooltip State
const isTooltipVisible = ref(false)
const tooltipX = ref(0)
const tooltipY = ref(0)

// Menu State
const isMenuVisible = ref(false)
const menuX = ref(0)
const menuY = ref(0)

// --- TOOLTIP LOGIC ---
const locationsForTooltip = computed(() => {
  const allLocations = props.product.stock_locations || []
  let filtered = []
  if (props.activeView === 'all') {
    filtered = allLocations.filter((loc) => loc.quantity !== 0)
  } else if (props.activeView === 'gudang') {
    filtered = allLocations.filter((loc) => loc.purpose === 'WAREHOUSE' && loc.quantity !== 0)
  } else if (props.activeView === 'pajangan') {
    filtered = allLocations.filter((loc) => loc.purpose === 'DISPLAY' && loc.quantity !== 0)
  }
  return filtered
})

const showTooltip = computed(() => {
  return locationsForTooltip.value.length > 1
})

function handleToggleTooltip() {
  if (showTooltip.value) {
    isMenuVisible.value = false // Tutup menu

    if (isTooltipVisible.value) {
      isTooltipVisible.value = false
      return
    }
    const targetElement = tooltipContainer.value.querySelector('.location-cell')
    if (targetElement) {
      const rect = targetElement.getBoundingClientRect()
      tooltipX.value = rect.left + rect.width / 2
      tooltipY.value = rect.top
    }
    isTooltipVisible.value = true
  }
}

// --- MENU LOGIC ---
function handleToggleMenu(event) {
  isTooltipVisible.value = false // Tutup tooltip

  if (isMenuVisible.value) {
    isMenuVisible.value = false
    return
  }

  const rect = event.currentTarget.getBoundingClientRect()
  menuX.value = rect.left - 120
  menuY.value = rect.bottom + 5
  isMenuVisible.value = true
}

// Handle Klik Luar
function handleClickOutside(event) {
  if (
    tooltipContainer.value &&
    !tooltipContainer.value.contains(event.target) &&
    !event.target.closest('.tooltip-teleported')
  ) {
    isTooltipVisible.value = false
  }

  if (!event.target.closest('.action-btn') && !event.target.closest('.menu-teleported')) {
    isMenuVisible.value = false
  }
}

function handleMenuAction(action) {
  emit(action, props.product)
  isMenuVisible.value = false
}

onMounted(() => {
  document.addEventListener('mousedown', handleClickOutside)
})
onUnmounted(() => {
  document.removeEventListener('mousedown', handleClickOutside)
})

function copyToClipboard(text, fieldName) {
  emit('copy', { text, fieldName })
}

// --- COMPUTED DATA ---
const currentStock = computed(() => {
  if (props.activeView === 'all') return props.product.totalStock
  if (props.activeView === 'gudang') return props.product.stockGudang
  if (props.activeView === 'pajangan') return props.product.stockPajangan
  if (props.activeView === 'ltc') return props.product.stockLTC
  return 0
})

const currentLocation = computed(() => {
  if (props.activeView === 'all') return props.product.allLocationsCode || '-'
  if (props.activeView === 'gudang') return props.product.lokasiGudang || '-'
  if (props.activeView === 'pajangan') return props.product.lokasiPajangan || '-'
  if (props.activeView === 'ltc') return props.product.lokasiLTC
  return '-'
})
</script>

<template>
  <div
    ref="tooltipContainer"
    class="grid items-center py-1 px-3 transition-colors duration-500 grid-cols-12 gap-4"
    :class="[isUpdated ? 'bg-success/20' : 'hover:bg-primary/10']"
  >
    <div
      class="group relative flex flex-col justify-center"
      :class="[auth.canViewPrices ? 'col-span-4' : 'col-span-5']"
    >
      <div class="flex items-center gap-2">
        <span
          @click="copyToClipboard(product.name, 'Nama Produk')"
          class="font-semibold text-sm text-text cursor-pointer hover:text-primary transition-colors truncate"
          :title="product.name"
        >
          {{ product.name }}
        </span>
        <span
          v-if="product.is_package"
          class="shrink-0 inline-block px-1.5 py-0.5 rounded text-[9px] font-bold bg-accent/10 text-accent border border-accent/20 tracking-wide"
        >
          PAKET
        </span>
      </div>
    </div>

    <div class="col-span-2 text-left text-xs text-text/70 font-mono group relative truncate">
      <span
        @click="copyToClipboard(product.sku, 'SKU')"
        class="cursor-pointer hover:text-primary bg-secondary/5 px-1.5 py-0.5 rounded border border-secondary/10"
      >
        {{ product.sku }}
      </span>
    </div>

    <div
      v-if="auth.canViewPrices"
      class="col-span-2 text-right text-sm text-text/70 font-mono truncate"
    >
      <span
        @click="copyToClipboard(product.price, 'Harga')"
        class="cursor-pointer hover:text-primary"
      >
        {{ formatCurrency(product.price) }}
      </span>
    </div>

    <div
      class="location-cell text-center text-xs text-text/70 font-mono relative"
      :class="[
        auth.canViewPrices ? 'col-span-2' : 'col-span-3',
        { 'cursor-pointer hover:text-primary text-primary font-bold': showTooltip },
      ]"
      @click="handleToggleTooltip"
    >
      <span class="truncate block w-full" :title="currentLocation">{{ currentLocation }}</span>
    </div>

    <div
      class="col-span-1 text-center text-sm font-mono font-bold"
      :class="{
        'text-accent': currentStock < 0,
        'text-primary': currentStock > 0,
        'text-text/50': currentStock === 0 || currentStock === null,
      }"
    >
      {{ currentStock || 0 }}
    </div>

    <div class="col-span-1 flex justify-center items-center relative">
      <button
        @click="handleToggleMenu"
        class="action-btn w-8 h-8 flex items-center justify-center rounded-full hover:bg-secondary/20 text-text/60 hover:text-primary transition-colors"
      >
        <font-awesome-icon icon="fa-solid fa-ellipsis-vertical" />
      </button>
    </div>
  </div>

  <Teleport to="body">
    <div
      v-if="showTooltip && isTooltipVisible"
      class="tooltip-teleported fixed z-[99999] w-48 bg-background text-primary text-xs rounded-lg shadow-xl p-3 border border-primary backdrop-blur-sm"
      :style="{
        left: tooltipX + 'px',
        top: tooltipY + 'px',
        transform: 'translateX(-50%) translateY(-100%)',
        marginTop: '-8px',
      }"
    >
      <div
        class="font-bold text-primary mb-2 uppercase text-[10px] tracking-wider border-b border-primary pb-1"
      >
        Detail Lokasi
      </div>
      <ul class="space-y-1.5">
        <li
          v-for="loc in locationsForTooltip"
          :key="loc.location_code"
          class="flex justify-between items-center"
        >
          <span class="font-mono text-primary-light">{{ loc.location_code }}</span>
          <span class="font-bold bg-primary/10 text-primary px-1.5 rounded">{{
            loc.quantity
          }}</span>
        </li>
      </ul>
      <div
        class="absolute left-1/2 -translate-x-1/2 bottom-[-5px] w-0 h-0 border-l-[5px] border-l-transparent border-r-[5px] border-r-transparent border-t-[5px] border-t-gray-900"
      ></div>
    </div>
  </Teleport>

  <Teleport to="body">
    <div
      v-if="isMenuVisible"
      class="menu-teleported fixed z-[99999] text-text w-48 bg-background rounded-lg shadow-xl border border-secondary py-1 text-sm overflow-hidden animate-scale-in"
      :style="{ left: menuX + 'px', top: menuY + 'px' }"
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

      <div class="h-px bg-primary/10 my-1"></div>

      <button
        v-if="auth.hasPermission('manage-products')"
        @click="handleMenuAction('openEdit')"
        class="w-full text-left px-4 py-2.5 hover:bg-warning/10 hover:text-warning flex items-center gap-3 transition-colors"
      >
        <font-awesome-icon icon="fa-solid fa-pencil" class="w-4 text-center" /> Edit Produk
      </button>

      <button
        @click="handleMenuAction('openHistory')"
        class="w-full text-left px-4 py-2.5 hover:bg-info/10 hover:text-info flex items-center gap-3 transition-colors"
      >
        <font-awesome-icon icon="fa-solid fa-clock-rotate-left" class="w-4 text-center" /> Riwayat
      </button>

      <div v-if="auth.hasPermission('manage-products')" class="h-px bg-secondary/10 my-1"></div>

      <button
        v-if="auth.hasPermission('manage-products')"
        @click="handleMenuAction('delete')"
        class="w-full text-left px-4 py-2.5 text-danger hover:bg-danger/10 flex items-center gap-3 transition-colors"
      >
        <font-awesome-icon icon="fa-solid fa-trash" class="w-4 text-center" /> Hapus Produk
      </button>
    </div>
  </Teleport>
</template>

<style scoped>
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
