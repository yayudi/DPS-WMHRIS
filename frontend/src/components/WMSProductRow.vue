<script setup>
// ✅ Import ref, onMounted, onUnmounted untuk logika klik
import { computed, ref, onMounted, onUnmounted } from 'vue'
import { useAuthStore } from '@/stores/auth.js'
import { formatCurrency } from '@/utils/formatters.js'

const props = defineProps({
  product: {
    type: Object,
    required: true,
  },
  activeView: {
    type: String,
    required: true,
  },
  isUpdated: {
    type: Boolean,
    default: false,
  },
})

const emit = defineEmits(['copy', 'openAdjust', 'openTransfer', 'openHistory'])

const auth = useAuthStore()

// --- ✅ LOGIKA UNTUK TOOLTIP (DIUBAH) ---
const isTooltipVisible = ref(false)
const tooltipContainer = ref(null) // Ref untuk elemen DOM (selnya)

// Refs baru untuk koordinat posisi absolute (fixed)
const tooltipX = ref(0)
const tooltipY = ref(0)

/**
 * Menghitung posisi tooltip dan menampilkannya saat diklik.
 */
function handleToggleTooltip() {
  if (showTooltip.value) {
    if (isTooltipVisible.value) {
      isTooltipVisible.value = false // Tutup jika sudah terbuka
      return
    }

    // Hitung posisi baru berdasarkan elemen yang diklik
    // Kita menargetkan sel Lokasi yang memiliki class col-span-3
    const targetElement = tooltipContainer.value.querySelector('.col-span-3')
    if (targetElement) {
      const rect = targetElement.getBoundingClientRect()

      // X: Posisikan di tengah sel lokasi
      tooltipX.value = rect.left + rect.width / 2

      // Y: Posisikan tepat di atas (bottom-full) sel lokasi
      // rect.top adalah koordinat Y dari bagian atas sel
      tooltipY.value = rect.top
    }

    isTooltipVisible.value = true // Buka
  }
}

/**
 * Closes the tooltip if a click occurs outside of its container element.
 */
function handleClickOutside(event) {
  if (
    tooltipContainer.value &&
    !tooltipContainer.value.contains(event.target) &&
    // Tambahkan pengecualian untuk elemen tooltip yang sudah di-teleport.
    !event.target.closest('.tooltip-teleported')
  ) {
    isTooltipVisible.value = false
  }
}

// Tambahkan listener saat komponen dipasang
onMounted(() => {
  document.addEventListener('mousedown', handleClickOutside)
})

// Hapus listener saat komponen dilepas untuk mencegah memory leak
onUnmounted(() => {
  document.removeEventListener('mousedown', handleClickOutside)
})
// --- AKHIR LOGIKA TOOLTIP ---

function copyToClipboard(text, fieldName) {
  emit('copy', { text, fieldName })
}

// Computed property untuk STOK berdasarkan tab aktif
const currentStock = computed(() => {
  if (props.activeView === 'all') return props.product.totalStock
  if (props.activeView === 'gudang') return props.product.stockGudang
  if (props.activeView === 'pajangan') return props.product.stockPajangan
  if (props.activeView === 'ltc') return props.product.stockLTC
  return 0
})

// Computed property untuk LOKASI berdasarkan tab aktif
const currentLocation = computed(() => {
  if (props.activeView === 'all') return props.product.allLocationsCode || '-'
  if (props.activeView === 'gudang') return props.product.lokasiGudang || '-'
  if (props.activeView === 'pajangan') return props.product.lokasiPajangan || '-'
  if (props.activeView === 'ltc') return props.product.lokasiLTC
  return '-'
})

// Computed property untuk data di dalam Tooltip
const locationsForTooltip = computed(() => {
  const allLocations = props.product.stock_locations || []
  let filtered = []

  // Filter lokasi berdasarkan tab yang aktif
  if (props.activeView === 'all') {
    filtered = allLocations.filter((loc) => loc.quantity !== 0) // Hanya tampilkan yang ada stok
  } else if (props.activeView === 'gudang') {
    filtered = allLocations.filter((loc) => loc.purpose === 'WAREHOUSE' && loc.quantity !== 0)
  } else if (props.activeView === 'pajangan') {
    filtered = allLocations.filter((loc) => loc.purpose === 'DISPLAY' && loc.quantity !== 0)
  }
  // Tidak perlu tooltip untuk LTC (hanya 1 lokasi)

  return filtered
})

const showTooltip = computed(() => {
  return locationsForTooltip.value.length > 1
})
</script>

<template>
  <div
    ref="tooltipContainer"
    class="grid items-center p-3 transition-colors duration-500 grid-cols-12 border-b border-secondary"
    :class="[isUpdated ? 'bg-success/20' : 'hover:bg-primary/10']"
  >
    <div class="group relative" :class="[auth.canViewPrices ? 'col-span-5' : 'col-span-6']">
      <span
        @click="copyToClipboard(product.name, 'Nama Produk')"
        class="font-semibold text-sm text-text cursor-pointer hover:text-primary transition-colors"
      >
        {{ product.name }}
      </span>
    </div>

    <div class="col-span-1 text-center text-sm text-text/70 font-mono group relative">
      <span @click="copyToClipboard(product.sku, 'SKU')" class="cursor-pointer">
        {{ product.sku }}
      </span>
    </div>

    <div v-if="auth.canViewPrices" class="col-span-1 text-right text-sm text-text/70 font-mono">
      <span @click="copyToClipboard(product.price, 'Harga')" class="cursor-pointer">
        {{ formatCurrency(product.price) }}
      </span>
    </div>

    <div
      class="col-span-3 text-center text-sm text-text/70 font-mono relative"
      :class="{ 'cursor-pointer hover:text-primary': showTooltip }"
      @click="handleToggleTooltip"
    >
      <span class="truncate">{{ currentLocation }}</span>
    </div>

    <div
      class="col-span-1 text-center text-lg font-mono font-bold"
      :class="{
        'text-accent': currentStock < 0,
        'text-primary': currentStock > 0,
        'text-text/50': currentStock === 0 || currentStock === null,
      }"
    >
      {{ currentStock || 0 }}
    </div>

    <div class="col-span-1 flex justify-center items-center gap-3 text-text/60">
      <button
        v-if="auth.hasPermission('manage-stock-adjustment')"
        @click="emit('openAdjust', product)"
        class="hover:text-primary transition-colors"
        title="Sesuaikan Stok"
      >
        <font-awesome-icon icon="fa-solid fa-pencil" />
      </button>
      <button
        @click="emit('openTransfer', product)"
        class="hover:text-primary transition-colors"
        title="Transfer Stok"
      >
        <font-awesome-icon icon="fa-solid fa-right-left" />
      </button>
      <button
        @click="emit('openHistory', product)"
        class="hover:text-primary transition-colors"
        title="Riwayat Stok"
      >
        <font-awesome-icon icon="fa-solid fa-history" />
      </button>
    </div>
  </div>

  <Teleport to="body">
    <div
      v-if="showTooltip && isTooltipVisible"
      class="tooltip-teleported fixed z-[99999] w-48 bg-gray-900 text-white text-xs rounded-lg shadow-2xl p-3"
      :style="{
        left: tooltipX + 'px',
        top: tooltipY + 'px',
        // Geser kembali 50% lebar agar berada di tengah posisi X
        // Geser 100% ke atas (bottom-full) agar bagian bawah tooltip berada di Y yang dihitung
        transform: 'translateX(-50%) translateY(-100%)',
      }"
      @click.stop="() => {}"
    >
      <ul class="space-y-1">
        <li
          v-for="loc in locationsForTooltip"
          :key="loc.location_code"
          class="flex justify-between"
        >
          <span>{{ loc.location_code }}:</span>
          <span class="font-bold">{{ loc.quantity }}</span>
        </li>
      </ul>
      <div
        class="absolute left-1/2 -translate-x-1/2 bottom-[-5px] w-0 h-0 border-l-[5px] border-l-transparent border-r-[5px] border-r-transparent border-t-[5px] border-t-gray-900"
      ></div>
    </div>
  </Teleport>
</template>
