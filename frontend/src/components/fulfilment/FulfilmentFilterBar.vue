<!-- frontend\src\components\fulfilment\FulfilmentFilterBar.vue -->
<script setup>
import { watch, ref, computed } from 'vue'
import SegmentedControl from '@/components/ui/SegmentedControl.vue'
import BaseSwitch from '@/components/ui/BaseSwitch.vue'
import BaseFilterPanel from '@/components/ui/BaseFilterPanel.vue'
import DateRangeFilter from '@/components/ui/DateRangeFilter.vue'
import BaseSelect from '@/components/ui/BaseSelect.vue'
import TriStateSelect from '@/components/ui/TriStateSelect.vue'
import { useFulfilmentFilters } from '@/composables/useFulfilmentFilters.js'

const isAdvancedFilterOpen = ref(false)

const sourceTypeOptions = [
  { id: 'All', label: 'Semua' },
  { id: 'Offline', label: 'Offline' },
  { id: 'Online', label: 'Online' }
]

const roleTabs = [
  { value: 'All', label: 'All' },
  { value: 'Pick', label: 'Pick' },
  { value: 'Pack', label: 'Pack' },
  { value: 'Ship', label: 'Ship' }
]

const isSamedayTabs = [
  { value: 'All', label: 'All' },
  { value: 'true', label: 'Sameday' },
  { value: 'false', label: 'Reguler' }
]

const viewModeTabs = [
  { value: 'grid', icon: 'fa-solid fa-border-all', label: 'Grid' },
  { value: 'compact', icon: 'fa-solid fa-table-cells', label: 'Compact' },
  { value: 'list', icon: 'fa-solid fa-list', label: 'List' }
]

const sourceOptions = [
  { id: 'Tokopedia', label: 'Tokopedia' },
  { id: 'Shopee', label: 'Shopee' },
  { id: 'Offline', label: 'Offline' }
]

const purposeOptions = [
  { id: 'DISPLAY', label: 'DISPLAY' },
  { id: 'BRANCH', label: 'BRANCH' }
]

const sortOptions = [
  { id: 'newest', label: 'Terbaru' },
  { id: 'oldest', label: 'Terlama' },
  { id: 'invoice_asc', label: 'A-Z' },
  { id: 'invoice_desc', label: 'Z-A' }
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
  courierOptions: {
    type: Array,
    default: () => []
  },
  hideRoleAndBackorder: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits(['update:modelValue'])

const {
  filterState: localValues,
  hasActiveFilters,
  activeFilterBadges,
  isSearching,
  clearFilters,
  onSearchInput,
  onSelectChange
} = useFulfilmentFilters(props.modelValue, newVal => emit('update:modelValue', newVal))

const filteredCourierOptions = computed(() => {
  if (localValues.isSameday === 'true') {
    return props.courierOptions.filter(c => c.is_sameday)
  } else if (localValues.isSameday === 'false') {
    return props.courierOptions.filter(c => !c.is_sameday)
  }
  return props.courierOptions
})

watch(
  () => localValues.isSameday,
  () => {
    onSelectChange('courier', { include: [], exclude: [] })
  }
)

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
  <div class="sticky top-[72px] z-10 sm:shadow-none sm:bg-transparent">
    <BaseFilterPanel :border="false" :activeFilterCount="activeFilterBadges.length">
      <!-- TOP ROW: Search & Presets -->
      <template #search>
        <div class="flex flex-wrap w-full xl:w-[500px] items-center gap-2 flex-1 md:flex-none">
          <!-- Search -->
          <div
            class="w-full relative group shrink-0 rounded-lg ring-1 ring-secondary/20 bg-background transition-shadow focus-within:ring-primary/50 focus-within:shadow-md"
          >
            <input
              :value="localValues.search"
              @input="onSearchInput"
              type="text"
              placeholder="Cari Invoice, SKU, Nama Produk..."
              class="w-full pl-10 pr-10 py-2 rounded-lg bg-transparent border-none outline-none text-sm font-medium h-[40px]"
            />
            <font-awesome-icon
              icon="fa-solid fa-search"
              class="absolute left-3.5 top-[13px] text-text/40 text-sm transition-colors group-focus-within:text-primary"
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
        </div>
      </template>

      <!-- TOP ROW: Actions (View Mode & Clear) -->
      <template #actions>
        <div
          class="flex flex-col lg:flex-row xl:flex-row items-start lg:items-center justify-end w-full xl:w-auto mt-2 gap-2 lg:mt-0 flex-1"
        >
          <!-- Quick Toggles Row -->
          <div class="flex flex-wrap xl:flex-nowrap items-center gap-2 w-full lg:w-auto justify-start lg:justify-end">
            <SegmentedControl
              :model-value="localValues.isSameday"
              @update:model-value="v => onSelectChange('isSameday', v)"
              :options="isSamedayTabs"
              class="shrink-0"
            />
            <SegmentedControl
              v-if="!hideRoleAndBackorder"
              :model-value="localValues.role"
              @update:model-value="v => onSelectChange('role', v)"
              :options="roleTabs"
              class="shrink-0"
            />
            <BaseSwitch
              v-if="!hideRoleAndBackorder"
              :model-value="localValues.isBackorder === 'true'"
              @update:model-value="v => onSelectChange('isBackorder', v ? 'true' : 'false')"
              left-label="Available"
              right-label="Backorder"
              class="shrink-0"
            />
          </div>

          <div
            class="flex flex-wrap md:flex-nowrap items-center justify-start lg:justify-end gap-2 w-full md:w-auto mt-2 lg:mt-0 shrink-0"
          >
            <button
              v-if="hasActiveFilters"
              @click="clearFilters"
              class="h-[40px] px-4 rounded-lg text-sm font-bold border border-danger/20 bg-danger/5 text-danger hover:bg-danger hover:text-secondary hover:shadow-md hover:shadow-danger/20 transition-all flex items-center gap-2"
            >
              <font-awesome-icon icon="fa-solid fa-eraser" />
            </button>
            <!-- Mode View -->
            <SegmentedControl
              :model-value="localValues.viewMode"
              @update:model-value="v => onSelectChange('viewMode', v)"
              :options="viewModeTabs"
              hide-label-on-mobile
            />
            <button
              @click="isAdvancedFilterOpen = !isAdvancedFilterOpen"
              class="h-[40px] px-4 text-sm font-bold rounded-lg flex items-center justify-center gap-2 transition-all shrink-0 flex-1 md:flex-none"
              :class="
                isAdvancedFilterOpen ? 'bg-primary text-background' : 'bg-primary text-background hover:bg-primary/85'
              "
            >
              <font-awesome-icon icon="fa-solid fa-sliders" />
              <span class="md:hidden lg:inline">Filter Lanjutan</span>
              <font-awesome-icon
                :icon="isAdvancedFilterOpen ? 'fa-solid fa-chevron-up' : 'fa-solid fa-chevron-down'"
                class="text-[10px] ml-1 opacity-70"
              />
            </button>
          </div>
        </div>
      </template>

      <!-- Advanced Grid Filters -->
      <template #advanced v-if="isAdvancedFilterOpen">
        <div class="flex flex-col w-full my-5 border-t border-secondary/10 animate-fade-in">
          <!-- FORM GRID -->
          <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-x-6 gap-y-3">
            <!-- Date Range -->
            <div class="flex flex-col gap-1.5">
              <label class="text-[10px] font-bold text-text/60 uppercase tracking-widest">Rentang Tanggal</label>
              <DateRangeFilter
                v-model:startDate="localValues.startDate"
                v-model:endDate="localValues.endDate"
                class="w-full"
              />
            </div>

            <!-- Sorting -->
            <div class="flex flex-col gap-1.5">
              <label class="text-[10px] font-bold text-text/60 uppercase tracking-widest">Urutkan</label>
              <BaseSelect
                :model-value="localValues.sortBy"
                @update:model-value="v => onSelectChange('sortBy', v)"
                :options="sortOptions"
                label="label"
                track-by="id"
                :searchable="false"
                emit-value
                class="w-full"
              />
            </div>

            <!-- Source Type (Online/Offline) -->
            <div class="flex flex-col gap-1.5">
              <label class="text-[10px] font-bold text-text/60 uppercase tracking-widest">Tipe Pesanan</label>
              <BaseSelect
                :model-value="localValues.sourceType"
                @update:model-value="v => onSelectChange('sourceType', v)"
                :options="sourceTypeOptions"
                label="label"
                track-by="id"
                :searchable="false"
                emit-value
                class="w-full"
              />
            </div>

            <!-- Shop Name (Store) -->
            <div v-if="shopOptions && shopOptions.length > 0" class="flex flex-col gap-1.5">
              <label class="text-[10px] font-bold text-text/60 uppercase tracking-widest">Store (Toko)</label>
              <TriStateSelect
                :model-value="localValues.shopName"
                @update:model-value="v => onSelectChange('shopName', v)"
                :options="shopOptions"
                label="label"
                track-by="id"
                placeholder="Toko"
                class="w-full"
              />
            </div>

            <!-- Source (Marketplace) -->
            <div class="flex flex-col gap-1.5">
              <label class="text-[10px] font-bold text-text/60 uppercase tracking-widest">Marketplace</label>
              <TriStateSelect
                :model-value="localValues.source"
                @update:model-value="v => onSelectChange('source', v)"
                :options="sourceOptions"
                label="label"
                track-by="id"
                placeholder="Sumber"
                class="w-full"
              />
            </div>

            <!-- Courier (Expedition) -->
            <div class="flex flex-col gap-1.5">
              <label class="text-[10px] font-bold text-text/60 uppercase tracking-widest">Ekspedisi</label>
              <TriStateSelect
                :model-value="localValues.courier"
                @update:model-value="v => onSelectChange('courier', v)"
                :options="filteredCourierOptions"
                label="label"
                track-by="id"
                placeholder="Ekspedisi"
                class="w-full"
              />
            </div>

            <!-- Product Search -->
            <div class="flex flex-col gap-1.5">
              <label class="text-[10px] font-bold text-text/60 uppercase tracking-widest">Produk</label>
              <div class="relative group">
                <input
                  v-model="localValues.productName"
                  type="text"
                  placeholder="Cari nama produk..."
                  class="w-full pl-9 pr-3 py-2 rounded-lg bg-background border border-secondary/20 hover:border-secondary/40 focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all text-sm font-medium h-[40px] shadow-sm"
                />
                <font-awesome-icon
                  icon="fa-solid fa-box"
                  class="absolute left-3 top-3 text-text/40 text-xs transition-colors group-focus-within:text-primary"
                />
              </div>
            </div>

            <!-- Location Purpose (Conditional) -->
            <div v-if="localValues.source?.include?.includes('Offline')" class="flex flex-col gap-1.5 animate-fade-in">
              <label class="text-[10px] font-bold text-text/60 uppercase tracking-widest">Tujuan Lokasi</label>
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
