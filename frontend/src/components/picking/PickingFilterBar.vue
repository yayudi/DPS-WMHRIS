<script setup>
import { reactive, watch, computed } from 'vue'

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
    class="bg-background border border-secondary/20 p-1.5 rounded-xl shadow-sm transition-all duration-300 hover:shadow-md flex flex-col lg:flex-row gap-2"
  >
    <!-- Group 1: Search & Date (Flexible Grow) -->
    <div class="flex flex-col sm:flex-row gap-2 flex-grow">
      <!-- Search -->
      <div class="relative flex-grow group">
        <input
          :value="localValues.search"
          @input="onSearchInput"
          type="text"
          placeholder="Cari Invoice, SKU..."
          class="w-full pl-9 pr-8 py-2 rounded-lg bg-secondary/5 border border-transparent hover:border-secondary/20 focus:bg-background focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all text-sm font-medium h-[42px]"
          :class="{ '!bg-primary/5 !border-primary/30': localValues.search }"
        />
        <font-awesome-icon
          icon="fa-solid fa-search"
          class="absolute left-3 top-3 text-text/40 text-sm transition-colors group-focus-within:text-primary"
        />
        <button
          v-if="localValues.search"
          @click="((localValues.search = ''), emitChange())"
          class="absolute right-2 top-2 h-6 w-6 flex items-center justify-center rounded-full hover:bg-secondary/20 text-text/40 hover:text-danger transition-all mt-0.5"
          title="Hapus pencarian"
        >
          <font-awesome-icon icon="fa-solid fa-times" class="text-xs" />
        </button>
      </div>

      <!-- Date Range (Joined) -->
      <div
        class="flex items-center bg-secondary/5 rounded-lg border border-transparent hover:border-secondary/20 focus-within:border-primary focus-within:bg-background focus-within:ring-1 focus-within:ring-primary transition-all h-[42px] px-2 shrink-0 overflow-hidden"
        :class="{
          '!bg-primary/5 !border-primary/30': localValues.startDate || localValues.endDate,
        }"
      >
        <input
          type="date"
          v-model="localValues.startDate"
          @change="emitChange"
          class="bg-transparent border-none text-xs text-text/80 focus:ring-0 outline-none w-28 cursor-pointer p-0 font-medium"
        />
        <span class="text-text/30 px-2 text-xs">→</span>
        <input
          type="date"
          v-model="localValues.endDate"
          @change="emitChange"
          class="bg-transparent border-none text-xs text-text/80 focus:ring-0 outline-none w-28 cursor-pointer p-0 font-medium"
        />
      </div>
    </div>

    <!-- Group 2: Dropdowns & Actions (Shrink if needed) -->
    <div class="flex flex-wrap sm:flex-nowrap gap-2 items-center">
      <!-- Filter Source -->
      <div class="relative w-full sm:w-auto">
        <select
          v-model="localValues.source"
          @change="emitChange"
          class="appearance-none w-full sm:w-auto pl-9 pr-8 py-2 rounded-lg border text-xs font-bold outline-none focus:border-primary cursor-pointer h-[42px] transition-all"
          :class="
            localValues.source !== 'ALL'
              ? 'bg-primary/5 text-primary border-primary shadow-sm'
              : 'bg-secondary/5 border-transparent hover:border-secondary/20 text-text/60 hover:text-text'
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
          :class="localValues.source !== 'ALL' ? 'text-inherit' : 'text-text/40'"
        />
        <font-awesome-icon
          icon="fa-solid fa-chevron-down"
          class="absolute right-3 top-3.5 text-[10px] pointer-events-none opacity-50"
          :class="localValues.source !== 'ALL' ? 'text-inherit' : 'text-text/40'"
        />
      </div>

      <!-- Filter Stock Status -->
      <div class="relative w-full sm:w-auto">
        <select
          v-model="localValues.stockStatus"
          @change="emitChange"
          class="appearance-none w-full sm:w-auto pl-9 pr-8 py-2 rounded-lg border text-xs font-bold outline-none focus:border-primary cursor-pointer h-[42px] transition-all"
          :class="{
            'bg-secondary/5 border-transparent hover:border-secondary/20 text-text/60 hover:text-text':
              localValues.stockStatus === 'ALL',
            'bg-success/5 text-success border-success shadow-sm':
              localValues.stockStatus === 'READY',
            'bg-danger/5 text-danger border-danger shadow-sm': localValues.stockStatus === 'EMPTY',
            'bg-warning/5 text-warning border-warning shadow-sm':
              localValues.stockStatus === 'ISSUE',
          }"
        >
          <option value="ALL">Semua Status</option>
          <option value="READY">Siap Pick</option>
          <option value="ISSUE">Bermasalah</option>
          <option value="EMPTY">Stok Kosong</option>
        </select>
        <font-awesome-icon
          icon="fa-solid fa-cubes"
          class="absolute left-3 top-3 text-xs pointer-events-none"
          :class="localValues.stockStatus !== 'ALL' ? 'text-inherit' : 'text-text/40'"
        />
        <font-awesome-icon
          icon="fa-solid fa-chevron-down"
          class="absolute right-3 top-3.5 text-[10px] opacity-50 pointer-events-none"
          :class="localValues.stockStatus !== 'ALL' ? 'text-inherit' : 'text-text/40'"
        />
      </div>

      <!-- Separator -->
      <div class="hidden sm:block w-px h-6 bg-secondary/20 mx-1"></div>

      <!-- Sort -->
      <div class="relative w-1/2 sm:w-auto flex-grow sm:flex-grow-0">
        <select
          v-model="localValues.sortBy"
          @change="emitChange"
          class="appearance-none w-full pl-3 pr-8 py-2 rounded-lg bg-secondary/5 border border-transparent hover:border-secondary/20 text-xs font-medium outline-none focus:border-primary cursor-pointer h-[42px] text-text/70 transition-all"
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

      <!-- View Toggle (3 Modes: List, Grid, Compact) -->
      <div
        class="flex bg-secondary/10 rounded-lg p-1 shrink-0 h-[42px] w-auto flex-grow sm:flex-grow-0"
      >
        <button
          @click="((localValues.viewMode = 'list'), emitChange())"
          class="w-9 rounded-md transition-all text-xs flex items-center justify-center"
          :class="
            localValues.viewMode === 'list'
              ? 'bg-background text-primary shadow-sm font-bold'
              : 'text-text/40 hover:text-text'
          "
          title="Tampilan List"
        >
          <font-awesome-icon icon="fa-solid fa-list" />
        </button>
        <button
          @click="((localValues.viewMode = 'grid'), emitChange())"
          class="w-9 rounded-md transition-all text-xs flex items-center justify-center"
          :class="
            localValues.viewMode === 'grid'
              ? 'bg-background text-primary shadow-sm font-bold'
              : 'text-text/40 hover:text-text'
          "
          title="Tampilan Grid (Standard Card)"
        >
          <font-awesome-icon icon="fa-solid fa-border-all" />
        </button>
        <button
          @click="((localValues.viewMode = 'compact'), emitChange())"
          class="w-9 rounded-md transition-all text-xs flex items-center justify-center"
          :class="
            localValues.viewMode === 'compact'
              ? 'bg-background text-primary shadow-sm font-bold'
              : 'text-text/40 hover:text-text'
          "
          title="Tampilan Compact (Small Card)"
        >
          <font-awesome-icon icon="fa-solid fa-table-cells" />
        </button>
      </div>

      <!-- Reset Button -->
      <transition name="fade">
        <button
          v-if="hasActiveFilters"
          @click="clearFilters"
          class="h-[42px] px-3 rounded-lg text-danger hover:bg-danger/10 transition-colors flex items-center justify-center border border-transparent hover:border-danger/20"
          title="Reset Filter"
        >
          <font-awesome-icon icon="fa-solid fa-rotate-left" />
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
