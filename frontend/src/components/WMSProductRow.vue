<!-- frontend\src\components\WMSProductRow.vue -->
<script setup>
import { computed } from 'vue'
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

function copyToClipboard(text, fieldName) {
  emit('copy', { text, fieldName })
}

// Menentukan stok dan lokasi berdasarkan view yang aktif
const currentStock = computed(() => {
  if (props.activeView === 'gudang') return props.product.stockGudang
  if (props.activeView === 'pajangan') return props.product.stockPajangan
  if (props.activeView === 'ltc') return props.product.stockLTC
  return 0
})

const currentLocation = computed(() => {
  if (props.activeView === 'gudang') return props.product.lokasiGudang || '-'
  if (props.activeView === 'pajangan') return props.product.lokasiPajangan || '-'
  if (props.activeView === 'ltc') return props.product.lokasiLTC
  return '-'
})
</script>

<template>
  <div
    class="grid items-center p-3 transition-colors duration-500"
    :class="[
      auth.canViewPrices ? 'grid-cols-8' : 'grid-cols-7',
      isUpdated ? 'bg-success/20' : 'hover:bg-primary/10', // Logika kelas baru untuk efek flash
    ]"
  >
    <!-- Kolom Produk -->
    <div class="col-span-3 group relative">
      <span
        @click="copyToClipboard(product.name, 'Nama Produk')"
        class="font-semibold text-sm text-text cursor-pointer hover:text-primary transition-colors"
      >
        {{ product.name }}
      </span>
    </div>

    <!-- Kolom SKU -->
    <div class="col-span-1 text-center text-sm text-text/70 font-mono group relative">
      <span @click="copyToClipboard(product.sku, 'SKU')" class="cursor-pointer">
        {{ product.sku }}
      </span>
    </div>

    <!-- Kolom Harga -->
    <div v-if="auth.canViewPrices" class="col-span-1 text-right text-sm text-text/70 font-mono">
      <span @click="copyToClipboard(product.price, 'Harga')" class="cursor-pointer">
        {{ formatCurrency(product.price) }}
      </span>
    </div>

    <!-- Kolom Lokasi -->
    <div class="col-span-1 text-center text-sm text-text/70 font-mono">
      {{ currentLocation }}
    </div>

    <!-- Kolom Stok -->
    <div
      class="col-span-1 text-center text-lg font-mono font-bold"
      :class="{
        'text-accent': currentStock < 0,
        'text-primary': currentStock > 0,
        'text-text/50': currentStock === 0,
      }"
    >
      {{ currentStock }}
    </div>

    <!-- Kolom Aksi -->
    <div class="col-span-1 flex justify-center items-center gap-3 text-text/60">
      <button
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
</template>
