<script setup>
import { computed } from 'vue'
import Tabs from '@/components/Tabs.vue'
import SearchInput from './global/SearchInput.vue'

const props = defineProps({
  searchValue: { type: String, default: '' },
  searchPlaceholder: { type: String, default: 'Cari produk...' },
  searchTabs: { type: Array, default: () => [] },
  warehouseViews: { type: Array, default: () => [] },
  buildingFilterOptions: { type: Array, default: () => [] },
  floorFilterOptions: { type: Array, default: () => [] },
  searchBy: { type: String, default: 'name' },
  activeView: { type: String, default: 'gudang' },
  showMinusStockOnly: { type: Boolean, default: false },
  selectedBuilding: { type: String, default: 'all' },
  selectedFloor: { type: String, default: 'all' },
  isAutoRefetching: { type: Boolean, default: true },
  sseStatus: { type: String, default: 'disconnected' },
})

const emit = defineEmits([
  'update:searchValue',
  'update:searchBy',
  'update:activeView',
  'update:showMinusStockOnly',
  'update:selectedBuilding',
  'update:selectedFloor',
  'toggle-refetch',
  'search',
])

let debounceTimer = null
function handleSearchInput(value) {
  emit('update:searchValue', value)
  clearTimeout(debounceTimer)
  debounceTimer = setTimeout(() => {
    emit('search', value)
  }, 400)
}

const showBuildingFilter = computed(() => {
  return props.activeView === 'gudang'
})

const showFloorFilter = computed(() => {
  if (props.activeView === 'ltc') {
    return false
  }
  return props.activeView === 'gudang' || props.activeView === 'pajangan'
})

const syncButtonClass = computed(() => {
  if (props.sseStatus === 'connected') {
    return 'bg-success/15 border-success text-success'
  }
  if (props.sseStatus === 'connecting') {
    return 'bg-warning/15 border-warning text-warning'
  }
  if (props.isAutoRefetching) {
    return 'bg-danger/15 border-danger text-danger'
  }
  return 'bg-secondary/80 border-secondary text-text/80 hover:bg-secondary/50' // Semua mati
})

const syncButtonTitle = computed(() => {
  if (props.sseStatus === 'connected') {
    return 'Koneksi real-time aktif. Klik untuk mematikan semua pembaruan otomatis.'
  }
  if (props.sseStatus === 'connecting') {
    return 'Menyambungkan koneksi real-time...'
  }
  if (props.isAutoRefetching) {
    return 'Koneksi real-time gagal. Beralih ke pembaruan setiap 1 menit. Klik untuk mematikan.'
  }
  return 'Semua pembaruan otomatis mati. Klik untuk mengaktifkan pembaruan setiap 1 menit.'
})

const shouldIconSpin = computed(() => {
  return (
    props.sseStatus === 'connecting' ||
    (props.sseStatus === 'disconnected' && props.isAutoRefetching)
  )
})
</script>

<template>
  <div class="space-y-4 md:space-y-0 md:flex md:justify-between md:items-center md:gap-4">
    <div class="flex-grow w-full md:w-1/2 flex items-center gap-2">
      <SearchInput
        :model-value="searchValue"
        @update:modelValue="handleSearchInput"
        :placeholder="searchPlaceholder"
        class="flex-grow"
      />
      <Tabs
        :tabs="searchTabs"
        :model-value="searchBy"
        @update:modelValue="(value) => emit('update:searchBy', value)"
      />
    </div>

    <!-- KANAN: SEMUA FILTER GABUNGAN -->
    <div class="flex items-center justify-start md:justify-end gap-2 w-full md:w-auto flex-wrap">
      <Tabs
        :tabs="warehouseViews"
        :model-value="activeView"
        @update:modelValue="(value) => emit('update:activeView', value)"
      />
      <select
        v-if="showBuildingFilter"
        :value="selectedBuilding"
        @change="emit('update:selectedBuilding', $event.target.value)"
        class="bg-background border-2 border-primary/30 text-text text-sm rounded-lg focus:ring-primary/50 focus:border-primary block p-2"
      >
        <option v-for="option in buildingFilterOptions" :key="option.value" :value="option.value">
          {{ option.label }}
        </option>
      </select>
      <select
        v-if="showFloorFilter"
        :value="selectedFloor"
        @change="emit('update:selectedFloor', $event.target.value)"
        class="bg-background border-2 border-primary/30 text-text text-sm rounded-lg focus:ring-primary/50 focus:border-primary block p-2"
      >
        <option v-for="option in floorFilterOptions" :key="option.value" :value="option.value">
          {{ option.label }}
        </option>
      </select>
      <button
        @click="emit('update:showMinusStockOnly', !showMinusStockOnly)"
        :class="[
          'px-3 py-2 text-sm font-semibold rounded-lg transition-all flex items-center gap-2 border whitespace-nowrap',
          showMinusStockOnly
            ? 'bg-accent/15 border-accent text-accent shadow-sm'
            : 'bg-secondary/80 border-secondary text-text/80 hover:bg-secondary/50 hover:border-secondary/50 hover:text-text',
        ]"
      >
        <span>Stok Minus</span>
      </button>

      <button
        @click="emit('toggle-refetch')"
        :class="[
          'px-3 py-2 text-sm font-semibold rounded-lg transition-all flex items-center gap-2 border whitespace-nowrap',
          syncButtonClass,
        ]"
        :title="syncButtonTitle"
      >
        <font-awesome-icon icon="fa-solid fa-sync" :class="{ 'animate-spin': shouldIconSpin }" />
      </button>
    </div>
  </div>
</template>
