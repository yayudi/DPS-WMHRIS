<!-- frontend/src/components/wms/shared/WmsControlPanel.vue -->
<script setup>
import { ref, onMounted } from 'vue'
import { onClickOutside } from '@vueuse/core'
import { useFloating, offset, flip, shift, autoUpdate } from '@floating-ui/vue'
import BaseFilterPanel from '@/components/ui/BaseFilterPanel.vue'
import BaseSelect from '@/components/ui/BaseSelect.vue'
import TriStateSelect from '@/components/ui/TriStateSelect.vue'
import SegmentedControl from '@/components/ui/SegmentedControl.vue'
import { useMobile } from '@/composables/useMobile'

defineProps({
  // Data
  searchPlaceholder: { type: String, default: 'Cari...' },
  searchTabs: { type: Array, default: () => [] },
  warehouseViews: { type: Array, default: () => [] },
  buildingFilterOptions: { type: Array, default: () => [] },
  floorFilterOptions: { type: Array, default: () => [] },
  categoryFilterOptions: { type: Array, default: () => [] },

  // Status
  isAutoRefetching: Boolean,

  // v-models
  searchBy: String,
  searchValue: String,
  activeView: String,
  productTypeFilter: { type: String, default: 'all' },
  stockStatusFilter: { type: String, default: 'all' },
  selectedBuilding: { type: Object, default: () => ({ include: [], exclude: [] }) },
  selectedFloor: { type: Object, default: () => ({ include: [], exclude: [] }) },
  selectedCategory: { type: Object, default: () => ({ include: [], exclude: [] }) },
  mobileLayout: { type: String, default: 'card' },
  availableColumns: { type: Array, default: () => [] },
  visibleColumns: { type: Object, default: () => new Set() },
  viewMode: { type: String, default: 'infinite' }
})

const emit = defineEmits([
  'update:searchBy',
  'update:searchValue',
  'update:activeView',
  'update:stockStatusFilter',
  'update:productTypeFilter',
  'update:selectedBuilding',
  'update:selectedFloor',
  'update:selectedCategory',
  'update:categoryFilterOptions',
  'update:mobileLayout',
  'update:viewMode',
  'search',
  'toggle-column',
  'toggle-refetch'
])

const searchInput = ref(null)
const { isMobile } = useMobile(1024)

function onSearchInput(e) {
  emit('update:searchValue', e.target.value)
  emit('search', e.target.value)
}

function clearSearch() {
  emit('update:searchValue', '')
  emit('search', '')
}

const typeOptions = [
  { value: 'all', label: 'Semua', icon: 'fa-solid fa-list' },
  { value: 'unit', label: 'Satuan', icon: 'fa-solid fa-box' },
  { value: 'package', label: 'Paket', icon: 'fa-solid fa-boxes-stacked' }
]

const stockOptions = [
  { value: 'all', label: 'Semua', icon: 'fa-solid fa-list' },
  { value: 'minus', label: 'Minus', icon: 'fa-solid fa-arrow-trend-down' },
  { value: 'positive', label: 'Aman', icon: 'fa-solid fa-arrow-trend-up' }
]

// Column Menu State
const isColumnMenuOpen = ref(false)

function toggleColumnMenu() {
  isColumnMenuOpen.value = !isColumnMenuOpen.value
}

function handleToggleColumn(colId) {
  emit('toggle-column', colId)
}

onMounted(() => {
  // Auto focus search input
  if (searchInput.value) {
    searchInput.value.focus()
  }
})

const buttonRef = ref(null)
const dropdownRef = ref(null)

const { floatingStyles } = useFloating(buttonRef, dropdownRef, {
  placement: 'bottom-end',
  middleware: [offset(8), flip(), shift({ padding: 10 })],
  whileElementsMounted: autoUpdate
})

onClickOutside(
  dropdownRef,
  event => {
    // Prevent closing if clicking the button itself
    if (buttonRef.value && buttonRef.value.contains(event.target)) return
    isColumnMenuOpen.value = false
  },
  { ignore: [buttonRef] }
)
</script>

<template>
  <BaseFilterPanel class="z-50" :collapse-breakpoint="1024">
    <!-- Search Row -->
    <template #search>
      <div class="relative flex-grow group w-full xl:w-[1vw] shadow-sm rounded-lg items-end mt-auto">
        <span
          class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-text/40 group-focus-within:text-primary transition-colors"
        >
          <font-awesome-icon icon="fa-solid fa-search" />
        </span>

        <input
          ref="searchInput"
          id="global-search-input"
          :value="searchValue"
          @input="onSearchInput"
          type="text"
          :placeholder="searchPlaceholder"
          class="w-full px-10 py-2 bg-background border border-secondary rounded-lg focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/50 text-text transition-all placeholder-text/30 h-[42px]"
        />

        <button
          v-if="searchValue"
          @click="clearSearch"
          class="absolute inset-y-0 right-0 flex items-center pr-4 text-text/40 hover:text-danger cursor-pointer transition-colors"
          title="Bersihkan pencarian"
        >
          <font-awesome-icon icon="fa-solid fa-times-circle" />
        </button>
      </div>
    </template>

    <!-- Tabs Row -->
    <template #tabs>
      <div class="flex flex-col md:flex-row gap-2 w-full lg:w-auto items-end">
        <!-- Search By Tabs -->
        <SegmentedControl
          :model-value="searchBy"
          @update:modelValue="emit('update:searchBy', $event)"
          :options="searchTabs.map(t => ({ value: t.value, label: t.label }))"
          class="w-full md:w-auto shrink-0"
        />

        <!-- View Tabs -->
        <div class="flex flex-col gap-1 w-full lg:w-[260px] shrink-0">
          <label class="hidden md:block text-xs font-semibold text-text/60 text-center">Lokasi</label>
          <SegmentedControl
            :model-value="activeView"
            @update:modelValue="emit('update:activeView', $event)"
            :options="warehouseViews.map(v => ({ value: v.value, label: v.label }))"
            class="w-full"
          />
        </div>
      </div>
    </template>

    <!-- Actions & Filters (Inline Right) -->
    <template #actions>
      <div class="flex flex-wrap items-end justify-start lg:justify-end gap-2 w-full lg:w-auto">
        <!-- Filter Warehouse (Hanya tampil jika view gudang atau pajangan) -->
        <div v-if="['gudang', 'pajangan'].includes(activeView)" class="flex gap-2 w-full lg:w-auto shrink-0">
          <div v-if="activeView === 'gudang'" class="flex flex-col gap-1 w-1/2 lg:w-[110px]">
            <label class="block text-xs font-semibold text-text/60 text-center mb-1">Gedung</label>
            <TriStateSelect
              :model-value="selectedBuilding"
              @update:modelValue="emit('update:selectedBuilding', $event)"
              :options="buildingFilterOptions"
              placeholder="Gedung"
              label="label"
              track-by="value"
              class="w-full"
            />
          </div>

          <div class="flex flex-col gap-1 lg:w-[110px]" :class="activeView === 'gudang' ? 'w-1/2' : 'w-full'">
            <label class="block text-xs font-semibold text-text/60 text-center mb-1">Lantai</label>
            <TriStateSelect
              :model-value="selectedFloor"
              @update:modelValue="emit('update:selectedFloor', $event)"
              :options="floorFilterOptions"
              placeholder="Lantai"
              label="label"
              track-by="value"
              class="w-full"
            />
          </div>
        </div>

        <!-- Type Filter -->
        <div class="flex flex-col gap-1 w-full lg:w-[110px] shrink-0">
          <label class="block text-xs font-semibold text-text/60 text-center mb-1">Tipe</label>
          <BaseSelect
            :model-value="productTypeFilter"
            @update:modelValue="emit('update:productTypeFilter', $event)"
            :options="typeOptions"
            class="h-[42px] w-full"
            placeholder="Tipe"
            label="label"
            track-by="value"
            :searchable="false"
            emit-value
          />
        </div>

        <!-- Status Stock -->
        <div class="flex flex-col gap-1 w-full lg:w-[110px] shrink-0">
          <label class="block text-xs font-semibold text-text/60 text-center mb-1">Status</label>
          <BaseSelect
            :model-value="stockStatusFilter"
            @update:modelValue="emit('update:stockStatusFilter', $event)"
            :options="stockOptions"
            class="w-full h-[42px]"
            placeholder="Status"
            label="label"
            track-by="value"
            :searchable="false"
            emit-value
          />
        </div>

        <!-- Category Filter -->
        <div class="flex flex-col gap-1 w-full lg:w-[110px] shrink-0">
          <label class="block text-xs font-semibold text-text/60 text-center mb-1">Kategori</label>
          <TriStateSelect
            :model-value="selectedCategory"
            @update:modelValue="emit('update:selectedCategory', $event)"
            :options="categoryFilterOptions"
            placeholder="Kategori"
            label="label"
            track-by="id"
            :searchable="true"
            class="w-full h-[42px]"
            :class="[
              selectedCategory?.include?.length > 0 || selectedCategory?.exclude?.length > 0
                ? 'bg-accent/5 border-accent text-accent'
                : 'bg-background border-secondary text-text/60 hover:text-text'
            ]"
          />
        </div>

        <!-- Mode Tampilan Group -->
        <div v-if="isMobile" class="flex flex-col gap-1 shrink-0 mt-auto mb-0.5 mx-auto lg:mx-0">
          <label class="block text-xs font-semibold text-text/60 text-center mb-1">Mode Tampilan</label>
          <div class="flex items-center justify-center lg:justify-start gap-2 h-[36px]">
            <!-- View Mode (Scroll / Page) -->
            <SegmentedControl
              :model-value="viewMode"
              @update:modelValue="emit('update:viewMode', $event)"
              :options="[
                { value: 'infinite', label: 'Scroll', icon: 'fa-solid fa-angles-down' },
                { value: 'pagination', label: 'Halaman', icon: 'fa-solid fa-pager' }
              ]"
              class="shrink-0 min-w-[200px] !w-[200px]"
            />

            <!-- Mobile Layout Switcher -->
            <SegmentedControl
              :model-value="mobileLayout"
              @update:modelValue="emit('update:mobileLayout', $event)"
              :options="[
                { value: 'card', icon: 'fa-solid fa-grip-vertical' },
                { value: 'compact', icon: 'fa-solid fa-list' }
              ]"
              class="shrink-0 min-w-[100px] !w-[100px] md:hidden"
            />
          </div>
        </div>

        <div class="flex flex-col gap-1 shrink-0 mt-auto mb-0.5 mx-auto lg:mx-0">
          <!-- Column Visibility Selector -->
          <button
            ref="buttonRef"
            @click.stop="toggleColumnMenu"
            class="w-[36px] h-[36px] flex items-center justify-center rounded-lg border border-secondary/20 bg-background text-text/60 hover:text-primary transition-all shadow-sm shrink-0"
            :class="{ 'bg-primary/10 text-primary border-primary': isColumnMenuOpen }"
            title="Visibilitas Kolom"
          >
            <font-awesome-icon v-if="!isMobile" icon="fa-solid fa-sliders" />
            <font-awesome-icon v-else icon="fa-solid fa-table-columns" />
          </button>
        </div>
        <!-- Dropdown Menu -->
        <Teleport to="body">
          <div
            v-if="isColumnMenuOpen"
            ref="dropdownRef"
            class="fixed z-[9999] bg-background border border-secondary/20 rounded-lg shadow-xl p-2 animate-fade-in-down column-selector-group w-[220px]"
            :style="floatingStyles"
          >
            <div v-if="!isMobile" class="flex flex-col gap-1 mb-4">
              <span class="text-[10px] font-bold text-text/50 uppercase tracking-wide px-1 mb-1"> Mode Tampilan </span>
              <div class="flex items-center justify-center lg:justify-start gap-2 h-[36px]">
                <!-- View Mode (Scroll / Page) -->
                <SegmentedControl
                  :model-value="viewMode"
                  @update:modelValue="emit('update:viewMode', $event)"
                  :options="[
                    { value: 'infinite', label: 'Scroll', icon: 'fa-solid fa-angles-down' },
                    { value: 'pagination', label: 'Halaman', icon: 'fa-solid fa-pager' }
                  ]"
                  class="shrink-0 min-w-[200px] !w-[200px]"
                />
              </div>
            </div>
            <div class="flex flex-col gap-1">
              <span class="text-[10px] font-bold text-text/50 uppercase tracking-wide px-1 mb-1">
                Visibilitas Kolom
              </span>
              <div
                v-for="col in availableColumns"
                :key="col.id"
                class="flex items-center gap-2 px-2 py-1.5 cursor-pointer hover:bg-secondary/10 rounded transition-colors"
                @click.stop="handleToggleColumn(col.id)"
              >
                <div
                  class="w-4 h-4 rounded border border-secondary flex items-center justify-center"
                  :class="visibleColumns.has(col.id) ? 'bg-primary border-primary' : 'bg-transparent'"
                >
                  <font-awesome-icon
                    v-if="visibleColumns.has(col.id)"
                    icon="fa-solid fa-check"
                    class="text-secondary text-[10px]"
                  />
                </div>
                <span class="text-sm font-semibold text-text/80">{{ col.label }}</span>
              </div>
            </div>
          </div>
        </Teleport>
      </div>
    </template>
  </BaseFilterPanel>
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

.animate-fade-in-down {
  animation: fadeInDown 0.2s ease-out;
}

@keyframes fadeInDown {
  from {
    opacity: 0;
    transform: translateY(-10px);
  }

  to {
    opacity: 1;
    transform: translateY(0);
  }
}
</style>
