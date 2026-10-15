<!-- frontend\src\components\picking\PickingFilterBar.vue -->
<script setup>
import { computed, watch } from 'vue'
import BaseFilterPanel from '@/components/ui/BaseFilterPanel.vue'
import DateRangeFilter from '@/components/ui/DateRangeFilter.vue'
import SegmentedControl from '@/components/ui/SegmentedControl.vue'
import TriStateSelect from '@/components/ui/TriStateSelect.vue'
import { usePickingFilters } from '@/composables/usePickingFilters.js'

const sourceOptions = [
  { id: 'Tokopedia', label: 'Tokopedia' },
  { id: 'Shopee', label: 'Shopee' },
  { id: 'Offline', label: 'Offline' }
]

const purposeOptions = [
  { id: 'DISPLAY', label: 'DISPLAY' },
  { id: 'BRANCH', label: 'BRANCH' }
]

const stockStatusOptions = [
  { id: 'READY', label: 'Siap Pick' },
  { id: 'ISSUE', label: 'Bermasalah' },
  { id: 'EMPTY', label: 'Stok Kosong' }
]

const historyStatusOptions = [
  { id: 'VALIDATED', label: 'Selesai' },
  { id: 'VOID', label: 'Batal' },
  { id: 'RETURNED', label: 'Retur' }
]

const sortOptions = [
  { label: 'Terbaru', value: 'newest', icon: 'fa-solid fa-arrow-down-wide-short' },
  { label: 'Terlama', value: 'oldest', icon: 'fa-solid fa-arrow-up-wide-short' }
]

const viewModeOptions = [
  { value: 'grid', label: 'Grid', icon: 'fa-solid fa-border-all' },
  { value: 'compact', label: 'Compact', icon: 'fa-solid fa-table-cells' },
  { value: 'list', label: 'List', icon: 'fa-solid fa-list' }
]

const props = defineProps({
  modelValue: {
    type: Object,
    default() {
      return {}
    }
  },
  shopOptions: {
    type: Array,
    default: () => []
  },
  mode: {
    type: String,
    default: 'task' // 'task' | 'history'
  }
})

const statusLabel = computed(() => (props.mode === 'history' ? 'Status Picking' : 'Status Stok'))
const currentStatusOptions = computed(() =>
  props.mode === 'history' ? historyStatusOptions : stockStatusOptions
)

const emit = defineEmits(['update:modelValue'])

const {
  filterState: localValues,
  activeFilterBadges,
  isSearching,
  clearFilters,
  removeFilter,
  onSearchInput,
  onSelectChange
} = usePickingFilters(props.modelValue, newVal => emit('update:modelValue', newVal))

// Sync from parent to local
watch(
  () => props.modelValue,
  val => {
    Object.assign(localValues, val)
  },
  { deep: true }
)
</script>

<template>
  <div class="sticky top-[72px] z-10 -mx-4 px-4 sm:mx-0 sm:px-0 sm:shadow-none sm:bg-transparent">
    <BaseFilterPanel :border="false" :activeFilterCount="activeFilterBadges.length">
      <!-- TOP ROW: Search -->
      <template #search>
        <div
          class="w-full lg:max-w-[360px] xl:max-w-[420px] relative group rounded-md ring-1 ring-secondary bg-background flex-1"
        >
          <input
            :value="localValues.search"
            @input="onSearchInput"
            type="text"
            placeholder="Cari Invoice, SKU"
            class="w-full pl-9 pr-10 py-2 rounded-lg bg-secondary/5 border border-transparent hover:border-secondary/20 focus:bg-background focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all text-sm font-medium h-[42px]"
            :class="{ '!bg-primary/5 !border-primary/30': localValues.search }"
          />
          <font-awesome-icon
            icon="fa-solid fa-search"
            class="absolute left-3 top-3 text-text/40 text-sm transition-colors group-focus-within:text-primary"
          />

          <!-- Loading Spinner or Clear -->
          <div class="absolute right-2 top-2 h-6 flex items-center justify-center mt-0.5">
            <font-awesome-icon v-if="isSearching" icon="fa-solid fa-spinner" class="fa-spin text-primary text-sm" />
            <button
              v-else-if="localValues.search"
              @click="onSearchInput({ target: { value: '' } })"
              class="h-6 w-6 flex items-center justify-center rounded-full hover:bg-secondary/20 text-text/40 hover:text-danger transition-all"
              title="Hapus pencarian"
            >
              <font-awesome-icon icon="fa-solid fa-times" class="text-xs" />
            </button>
          </div>
        </div>
      </template>

      <!-- TOP ROW: Actions (Sort, View Mode) -->
      <template #actions>
        <div class="flex items-center gap-2 w-full lg:w-auto flex-wrap sm:flex-nowrap justify-end">
          <!-- Sort Tabs -->
          <div class="w-full sm:w-auto shrink-0 min-w-[180px]">
            <SegmentedControl
              :model-value="localValues.sortBy"
              @update:model-value="v => onSelectChange('sortBy', v)"
              :options="sortOptions"
            />
          </div>

          <!-- Mode View -->
          <div class="w-full sm:w-auto sm:min-w-[290px] shrink-0">
            <SegmentedControl
              :model-value="localValues.viewMode"
              @update:model-value="v => onSelectChange('viewMode', v)"
              :options="viewModeOptions"
            />
          </div>
        </div>
      </template>

      <!-- Main Filters Grid (Tampil Langsung) -->
      <template #filters>
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 w-full pt-1">
          <!-- Date Range -->
          <div class="flex flex-col gap-1 w-full">
            <label class="text-[10px] font-bold text-text/50 uppercase tracking-wide">Rentang Tanggal</label>
            <DateRangeFilter
              v-model:startDate="localValues.startDate"
              v-model:endDate="localValues.endDate"
              class="w-full"
            />
          </div>

          <!-- Source -->
          <div class="flex flex-col gap-1 w-full">
            <label class="text-[10px] font-bold text-text/50 uppercase tracking-wide">Sumber</label>
            <TriStateSelect
              :model-value="localValues.source"
              @update:model-value="v => onSelectChange('source', v)"
              :options="sourceOptions"
              label="label"
              track-by="id"
              placeholder="Semua Sumber"
              class="w-full"
            />
          </div>

          <!-- Shop Name -->
          <div v-if="shopOptions && shopOptions.length > 0" class="flex flex-col gap-1 w-full">
            <label class="text-[10px] font-bold text-text/50 uppercase tracking-wide">Toko / Saluran</label>
            <TriStateSelect
              :model-value="localValues.shopName"
              @update:model-value="v => onSelectChange('shopName', v)"
              :options="shopOptions"
              label="label"
              track-by="id"
              placeholder="Semua Toko"
              class="w-full"
            />
          </div>

          <!-- Stock / Picking Status -->
          <div class="flex flex-col gap-1 w-full">
            <label class="text-[10px] font-bold text-text/50 uppercase tracking-wide">{{ statusLabel }}</label>
            <TriStateSelect
              :model-value="localValues.stockStatus"
              @update:model-value="v => onSelectChange('stockStatus', v)"
              :options="currentStatusOptions"
              label="label"
              track-by="id"
              placeholder="Semua Status"
              class="w-full"
            />
          </div>

          <!-- Location Purpose (Conditional if Offline included) -->
          <div
            v-if="localValues.source?.include?.includes('Offline')"
            class="flex flex-col gap-1 w-full animate-fade-in sm:col-span-2 lg:col-span-4 border-t border-secondary/10"
          >
            <label class="text-[10px] font-bold text-text/50 uppercase tracking-wide">Tujuan Lokasi</label>
            <TriStateSelect
              :model-value="localValues.locationPurpose"
              @update:model-value="v => onSelectChange('locationPurpose', v)"
              :options="purposeOptions"
              label="label"
              track-by="id"
              placeholder="Semua Lokasi"
              class="w-full"
            />
          </div>
        </div>
      </template>

      <!-- Active Filter Badges & Reset Bar (Di Bawah) -->
      <template #advanced v-if="activeFilterBadges.length > 0">
        <div
          class="flex flex-wrap items-center justify-between gap-2.5 pt-2.5 mt-0.5 border-t border-secondary/20 animate-fade-in"
        >
          <div class="flex flex-wrap items-center gap-2">
            <span class="text-xs font-semibold text-text/60 mr-1">Filter Aktif:</span>

            <div
              v-for="badge in activeFilterBadges"
              :key="badge.key"
              class="inline-flex items-center gap-1.5 px-2.5 py-1 bg-primary/10 text-primary border border-primary/20 rounded-lg text-xs font-medium transition-colors hover:bg-primary/15"
            >
              <span>{{ badge.label }}</span>
              <button
                @click="removeFilter(badge.key)"
                class="hover:bg-primary/20 hover:text-danger rounded-full w-4 h-4 flex items-center justify-center transition-colors"
                :title="`Hapus ${badge.label}`"
              >
                <font-awesome-icon icon="fa-solid fa-times" class="text-[10px]" />
              </button>
            </div>
          </div>

          <!-- Reset Filter Button -->
          <button
            @click="clearFilters"
            class="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold text-danger hover:bg-danger/10 border border-danger/20 rounded-lg transition-all active:scale-[0.98] bg-danger/5 cursor-pointer"
            title="Reset semua filter"
          >
            <font-awesome-icon icon="fa-solid fa-rotate-right" class="text-[10px]" />
            <span>Reset Filter</span>
          </button>
        </div>
      </template>
    </BaseFilterPanel>
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
  transform: scale(0.95);
}

.slide-fade-enter-active,
.slide-fade-leave-active {
  transition: all 0.3s ease;
  max-height: 500px;
  opacity: 1;
  overflow: hidden;
}
.slide-fade-enter-from,
.slide-fade-leave-to {
  max-height: 0;
  opacity: 0;
  margin-top: 0;
  padding-top: 0;
}
</style>
