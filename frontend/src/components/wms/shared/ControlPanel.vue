<!-- frontend/src/components/wms/shared/ControlPanel.vue -->
<script setup>
import { computed } from 'vue'

const props = defineProps({
  // Data
  searchPlaceholder: { type: String, default: 'Cari...' },
  searchTabs: { type: Array, default: () => [] },
  warehouseViews: { type: Array, default: () => [] },
  buildingFilterOptions: { type: Array, default: () => [] },
  floorFilterOptions: { type: Array, default: () => [] },

  // Status
  isAutoRefetching: Boolean,

  // v-models
  searchBy: String,
  searchValue: String,
  activeView: String,
  showMinusStockOnly: Boolean,
  showPackageOnly: Boolean,
  selectedBuilding: String,
  selectedFloor: String,
})

const emit = defineEmits([
  'update:searchBy',
  'update:searchValue',
  'update:activeView',
  'update:showMinusStockOnly',
  'update:showPackageOnly',
  'update:selectedBuilding',
  'update:selectedFloor',
  'search',
  'toggle-refetch',
])

function onSearchInput(e) {
  emit('update:searchValue', e.target.value)
  emit('search', e.target.value)
}

// Fungsi untuk membersihkan search
function clearSearch() {
  emit('update:searchValue', '')
  emit('search', '')
}
</script>

<template>
  <div class="flex flex-col xl:flex-row gap-3 xl:items-center">
    <div class="relative flex-grow group w-full xl:w-auto">
      <span
        class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-text/40 group-focus-within:text-primary transition-colors">
        <font-awesome-icon icon="fa-solid fa-search" />
      </span>

      <input :value="searchValue" @input="onSearchInput" type="text" :placeholder="searchPlaceholder"
        class="w-full pl-10 pr-10 py-2 bg-background border border-primary/20 rounded-lg focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/50 text-text transition-all placeholder-text/30 h-[42px]" />

      <button v-if="searchValue" @click="clearSearch"
        class="absolute inset-y-0 right-0 pr-3 flex items-center text-text/40 hover:text-danger cursor-pointer transition-colors"
        title="Bersihkan pencarian">
        <font-awesome-icon icon="fa-solid fa-times-circle" />
      </button>
    </div>

    <div class="flex flex-col md:flex-row gap-3 items-stretch md:items-center shrink-0">
      <div class="flex bg-background p-1 rounded-lg h-[42px] shrink-0">
        <button v-for="tab in searchTabs" :key="tab.value" @click="emit('update:searchBy', tab.value)"
          class="flex-1 md:flex-none px-4 py-1 rounded text-xs font-bold transition-all duration-200 flex items-center justify-center"
          :class="[
            searchBy === tab.value
              ? 'bg-primary text-secondary shadow-sm'
              : 'text-text/60 hover:text-text',
          ]">
          {{ tab.label }}
        </button>
      </div>

      <div class="flex bg-background p-1 rounded-lg h-[42px] overflow-x-auto no-scrollbar shrink-0">
        <button v-for="view in warehouseViews" :key="view.value" @click="emit('update:activeView', view.value)"
          class="flex-1 px-4 py-1 rounded text-xs font-bold whitespace-nowrap transition-all flex items-center justify-center"
          :class="[
            activeView === view.value
              ? 'bg-primary text-secondary shadow-sm font-bold'
              : 'text-text/60 hover:text-text hover:bg-secondary/10',
          ]">
          {{ view.label }}
        </button>
      </div>

      <div v-if="activeView === 'gudang'" class="flex gap-2 w-full lg:w-auto animate-fade-in shrink-0">
        <select :value="selectedBuilding" @change="emit('update:selectedBuilding', $event.target.value)"
          class="flex-1 lg:w-32 px-3 py-1.5 bg-background border border-secondary/20 rounded-lg text-sm text-text focus:border-primary focus:outline-none">
          <option v-for="opt in buildingFilterOptions" :key="opt.value" :value="opt.value">
            {{ opt.label }}
          </option>
        </select>

        <select :value="selectedFloor" @change="emit('update:selectedFloor', $event.target.value)"
          class="flex-1 lg:w-24 px-3 py-1.5 bg-background border border-secondary/20 rounded-lg text-sm text-text focus:border-primary focus:outline-none">
          <option v-for="opt in floorFilterOptions" :key="opt.value" :value="opt.value">
            {{ opt.label }}
          </option>
        </select>
      </div>

      <div class="flex gap-2 shrink-0">
        <!-- Tombol Filter Paket -->
        <button @click="emit('update:showPackageOnly', !showPackageOnly)"
          class="px-4 rounded-lg text-xs font-bold border transition-all flex items-center gap-2 h-[42px] whitespace-nowrap"
          :class="[
            showPackageOnly
              ? 'bg-accent/10 border-accent text-accent'
              : 'bg-accent/5 border-accent/30 text-accent hover:bg-accent/10',
          ]" title="Tampilkan hanya produk paket">
          <font-awesome-icon icon="fa-solid fa-box-open" />
          <span>Paket</span>
        </button>

        <button @click="emit('update:showMinusStockOnly', !showMinusStockOnly)"
          class="px-4 rounded-lg text-xs font-bold border transition-all flex items-center gap-2 h-[42px] whitespace-nowrap"
          :class="[
            showMinusStockOnly
              ? 'bg-danger/10 border-danger text-danger'
              : 'bg-danger/5 border-danger/30 text-danger hover:bg-danger/10',
          ]">
          <font-awesome-icon icon="fa-solid fa-arrow-trend-down" />
          <span>Stok Minus</span>
        </button>

        <button @click="emit('toggle-refetch')"
          class="w-[42px] h-[42px] flex items-center justify-center rounded-lg border transition-all" :class="[
            isAutoRefetching
              ? 'bg-success/10 border-success/50 text-success'
              : 'bg-success/5 border-success/30 text-success/70 hover:text-success',
          ]" :title="isAutoRefetching ? 'Auto-sync Aktif' : 'Auto-sync Mati'">
          <font-awesome-icon icon="fa-solid fa-sync" :class="{ 'animate-spin': isAutoRefetching }" />
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.no-scrollbar::-webkit-scrollbar {
  display: none;
}

.no-scrollbar {
  -ms-overflow-style: none;
  scrollbar-width: none;
}

.animate-fade-in {
  animation: fadeIn 0.3s ease-out;
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateX(-5px);
  }

  to {
    opacity: 1;
    transform: translateX(0);
  }
}
</style>
