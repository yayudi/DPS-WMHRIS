<!-- frontend\src\components\picking\PickingFilterBar.vue -->
<script setup>
import { reactive, watch, computed, ref } from 'vue'

const props = defineProps({
  modelValue: {
    type: Object,
    default() {
      return {
        search: '',
        source: 'ALL',
        stockStatus: 'ALL',
        sortBy: 'newest',
        viewMode: 'grid',
        startDate: '',
        endDate: '',
      }
    },
  },
})

const emit = defineEmits(['update:modelValue'])

// Local reactive state synced with props
const localValues = reactive({ ...props.modelValue })
let debounceTimer = null

// Sync from parent to local
watch(
  () => props.modelValue,
  (val) => {
    Object.assign(localValues, val)
  },
  { deep: true },
)

// Sync from local to parent (Immediate)
function emitChange() {
  emit('update:modelValue', { ...localValues })
}

// Debounced Search Input Handler
// Mencegah re-render masif saat mengetik cepat
function onSearchInput(event) {
  const val = event.target.value
  localValues.search = val

  clearTimeout(debounceTimer)
  debounceTimer = setTimeout(() => {
    emitChange()
  }, 300) // Delay 300ms
}

// Helper to detect if any filter is active
const hasActiveFilters = computed(() => {
  return (
    localValues.source !== 'ALL' ||
    localValues.stockStatus !== 'ALL' ||
    localValues.search !== '' ||
    localValues.startDate !== '' ||
    localValues.endDate !== ''
  )
})

function clearFilters() {
  localValues.search = ''
  localValues.source = 'ALL'
  localValues.stockStatus = 'ALL'
  localValues.startDate = ''
  localValues.endDate = ''
  emitChange()
}
</script>

<template>
  <div
    class="bg-background border border-secondary/20 p-4 rounded-xl mb-6 shadow-sm transition-all duration-300 hover:shadow-md"
  >
    <!-- Baris 1: Pencarian & Tanggal -->
    <div class="flex flex-col lg:flex-row gap-3 mb-3">
      <!-- 1. Global Search -->
      <div class="relative flex-1 min-w-[200px] group">
        <input
          :value="localValues.search"
          @input="onSearchInput"
          type="text"
          placeholder="Cari Invoice, SKU, atau Nama..."
          class="w-full pl-10 pr-8 py-2.5 rounded-lg bg-secondary/5 border border-secondary/30 focus:bg-background focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all text-sm font-medium"
          :class="{ 'border-primary/50 bg-primary/5': localValues.search }"
        />
        <font-awesome-icon
          icon="fa-solid fa-search"
          class="absolute left-3.5 top-3 text-text/40 text-sm transition-colors group-focus-within:text-primary"
        />

        <button
          v-if="localValues.search"
          @click="((localValues.search = ''), emitChange())"
          class="absolute right-2 top-2 h-7 w-7 flex items-center justify-center rounded-full hover:bg-secondary/20 text-text/40 hover:text-danger transition-all"
          title="Hapus pencarian"
        >
          <font-awesome-icon icon="fa-solid fa-times" class="text-xs" />
        </button>
      </div>

      <!-- 2. Date Range Picker -->
      <div class="flex gap-2 shrink-0">
        <div class="relative">
          <input
            type="date"
            v-model="localValues.startDate"
            @change="emitChange"
            class="pl-8 pr-3 py-2.5 rounded-lg bg-secondary/5 border border-secondary/30 text-sm text-text/80 focus:border-primary outline-none cursor-pointer"
            :class="{ 'border-primary/50 bg-primary/5': localValues.startDate }"
          />
          <font-awesome-icon
            icon="fa-solid fa-calendar"
            class="absolute left-3 top-3 text-xs text-text/40 pointer-events-none"
          />
        </div>
        <span class="self-center text-text/40">-</span>
        <div class="relative">
          <input
            type="date"
            v-model="localValues.endDate"
            @change="emitChange"
            class="pl-8 pr-3 py-2.5 rounded-lg bg-secondary/5 border border-secondary/30 text-sm text-text/80 focus:border-primary outline-none cursor-pointer"
            :class="{ 'border-primary/50 bg-primary/5': localValues.endDate }"
          />
          <font-awesome-icon
            icon="fa-solid fa-calendar"
            class="absolute left-3 top-3 text-xs text-text/40 pointer-events-none"
          />
        </div>
      </div>
    </div>

    <!-- Baris 2: Filter Dropdowns -->
    <div class="flex flex-wrap lg:flex-nowrap gap-3 items-center">
      <!-- Filter Source -->
      <div class="relative w-full sm:w-auto">
        <select
          v-model="localValues.source"
          @change="emitChange"
          class="appearance-none w-full sm:w-auto pl-9 pr-8 py-2.5 rounded-lg bg-secondary border text-sm outline-none focus:border-primary cursor-pointer font-medium min-w-[150px] transition-colors"
          :class="
            localValues.source !== 'ALL'
              ? 'border-primary/50 text-primary bg-primary/5'
              : 'border-secondary/30 text-text/70'
          "
        >
          <option value="ALL">Semua Sumber</option>
          <option value="Tokopedia">Tokopedia</option>
          <option value="Shopee">Shopee</option>
          <option value="Offline">Offline</option>
        </select>
        <font-awesome-icon
          icon="fa-solid fa-shop"
          class="absolute left-3 top-3 text-xs pointer-events-none"
          :class="localValues.source !== 'ALL' ? 'text-primary' : 'text-text/40'"
        />
        <font-awesome-icon
          icon="fa-solid fa-chevron-down"
          class="absolute right-3 top-3.5 text-[10px] opacity-50 pointer-events-none"
        />
      </div>

      <!-- Filter Stock Status -->
      <div class="relative w-full sm:w-auto">
        <select
          v-model="localValues.stockStatus"
          @change="emitChange"
          class="appearance-none w-full sm:w-auto pl-9 pr-8 py-2.5 rounded-lg bg-secondary border text-sm outline-none focus:border-primary cursor-pointer font-medium min-w-[150px] transition-colors"
          :class="{
            'border-secondary/30 text-text/70': localValues.stockStatus === 'ALL',
            'border-success/50 text-success bg-success/5': localValues.stockStatus === 'READY',
            'border-danger/50 text-danger bg-danger/5': localValues.stockStatus === 'EMPTY',
            'border-warning/50 text-warning bg-warning/5': localValues.stockStatus === 'ISSUE',
          }"
        >
          <option value="ALL">Semua Status</option>
          <option value="READY">✅ Siap Pick</option>
          <option value="ISSUE">⚠️ Bermasalah</option>
          <option value="EMPTY">❌ Stok Kosong</option>
        </select>
        <font-awesome-icon
          icon="fa-solid fa-cubes"
          class="absolute left-3 top-3 text-xs pointer-events-none"
          :class="localValues.stockStatus !== 'ALL' ? 'opacity-100' : 'text-text/40'"
        />
        <font-awesome-icon
          icon="fa-solid fa-chevron-down"
          class="absolute right-3 top-3.5 text-[10px] opacity-50 pointer-events-none"
        />
      </div>

      <!-- Sort -->
      <div class="relative w-full sm:w-auto">
        <select
          v-model="localValues.sortBy"
          @change="emitChange"
          class="appearance-none w-full sm:w-auto pl-9 pr-8 py-2.5 rounded-lg bg-secondary border text-sm outline-none focus:border-primary cursor-pointer font-medium min-w-[150px] transition-colors"
        >
          <option value="newest">Terbaru</option>
          <option value="oldest">Terlama</option>
          <option value="invoice_asc">A-Z</option>
          <option value="invoice_desc">Z-A</option>
        </select>
        <font-awesome-icon
          icon="fa-solid fa-sort"
          class="absolute right-3 top-3 text-text/40 text-xs pointer-events-none"
        />
      </div>

      <!-- View Toggle -->
      <div class="flex bg-secondary/10 rounded-lg border border-secondary/20 p-1 shrink-0">
        <button
          @click="((localValues.viewMode = 'list'), emitChange())"
          class="p-1.5 rounded-md transition-all text-xs w-8 flex justify-center"
          :class="
            localValues.viewMode === 'list'
              ? 'bg-secondary text-primary shadow-sm'
              : 'text-text/50 hover:text-text'
          "
          title="Tampilan List"
        >
          <font-awesome-icon icon="fa-solid fa-list" />
        </button>
        <button
          @click="((localValues.viewMode = 'grid'), emitChange())"
          class="p-1.5 rounded-md transition-all text-xs w-8 flex justify-center"
          :class="
            localValues.viewMode === 'grid'
              ? 'bg-secondary text-primary shadow-sm'
              : 'text-text/50 hover:text-text'
          "
          title="Tampilan Grid"
        >
          <font-awesome-icon icon="fa-solid fa-border-all" />
        </button>
      </div>

      <!-- Reset Button -->
      <transition name="fade">
        <button
          v-if="hasActiveFilters"
          @click="clearFilters"
          class="text-xs font-bold text-text/60 hover:text-danger hover:bg-danger/10 px-3 py-2 rounded-lg transition-all flex items-center gap-1 whitespace-nowrap border border-transparent hover:border-danger/20 ml-auto lg:ml-0"
          title="Reset semua filter"
        >
          <font-awesome-icon icon="fa-solid fa-rotate-left" />
          Reset
        </button>
      </transition>
    </div>
  </div>
</template>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition:
    opacity 0.2s ease,
    transform 0.2s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
  transform: translateX(10px);
}
</style>
