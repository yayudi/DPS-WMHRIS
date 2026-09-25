<script setup>
import { ref, computed, useSlots } from 'vue'
import { useMobile } from '@/composables/useMobile.js'

const props = defineProps({
  title: { type: String, default: '' },
  /** Number of active filters to show as badge on mobile toggle */
  activeFilterCount: { type: Number, default: 0 },
  /** Whether the filter panel should collapse on mobile */
  collapsible: { type: Boolean, default: true },
  /** Breakpoint in pixels for mobile view */
  collapseBreakpoint: { type: Number, default: 768 }
})

const { isMobile } = useMobile(props.collapseBreakpoint)
const slots = useSlots()
const isExpanded = ref(false)

const shouldCollapse = computed(() => isMobile.value && props.collapsible)

const hasCollapsibleContent = computed(() => {
  return !!(slots.actions || slots.filters || slots['filter-actions'] || slots.advanced)
})

const hasTopRow = computed(() => !!(slots.search || slots.tabs || slots.actions))
const hasBottomRow = computed(() => !!(slots.filters || slots['filter-actions']))
</script>

<template>
  <div class="flex flex-col gap-1">
    <!-- MOBILE LAYOUT -->
    <template v-if="shouldCollapse">
      <!-- Title -->
      <div v-if="title || $slots.header" class="flex justify-between items-center px-1">
        <h3 v-if="title" class="text-sm font-bold text-text/80 uppercase tracking-wider">{{ title }}</h3>
        <slot name="header"></slot>
      </div>

      <!-- Always Visible Row: Search & Tabs -->
      <div class="flex flex-col md:flex-row gap-2 items-start md:items-end w-full">
        <div v-if="$slots.search" class="flex-grow min-w-0 w-full md:w-auto">
          <slot name="search" />
        </div>
        <div v-if="$slots.tabs" class="flex-grow min-w-0 w-full md:w-auto">
          <slot name="tabs" />
        </div>
      </div>

      <!-- Collapsible Wrapper -->
      <div
        v-if="hasCollapsibleContent"
        class="transition-all duration-300 ease-in-out origin-top flex flex-col gap-3"
        :class="
          isExpanded ? 'max-h-[2000px] opacity-100 mt-1' : 'max-h-0 opacity-0 overflow-hidden pointer-events-none m-0'
        "
      >
        <slot name="actions" v-if="$slots.actions" />

        <div v-if="hasBottomRow" class="flex flex-col gap-4">
          <div v-if="$slots.filters" class="w-full">
            <slot name="filters"></slot>
          </div>
          <div v-if="$slots['filter-actions']" class="flex gap-3 w-full justify-end">
            <slot name="filter-actions"></slot>
          </div>
        </div>

        <div v-if="$slots.advanced" class="w-full">
          <slot name="advanced"></slot>
        </div>
      </div>

      <!-- Full-width Toggle Button -->
      <button
        v-if="hasCollapsibleContent"
        @click="isExpanded = !isExpanded"
        class="w-full py-1.5 mt-1 rounded-lg border transition-all flex justify-center items-center gap-2"
        :class="
          isExpanded || activeFilterCount > 0
            ? 'bg-primary/10 border-primary text-primary'
            : 'bg-secondary/5 border-secondary/20 text-text/60 hover:bg-secondary/10'
        "
      >
        <span class="text-xs font-bold uppercase tracking-wider">{{
          isExpanded ? 'Sembunyikan Filter' : 'Tampilkan Filter'
        }}</span>
        <font-awesome-icon :icon="isExpanded ? 'fa-solid fa-chevron-up' : 'fa-solid fa-chevron-down'" />
        <span
          v-if="activeFilterCount > 0"
          class="min-w-[18px] h-[18px] bg-accent text-secondary text-[10px] font-bold rounded-full flex items-center justify-center px-1"
        >
          {{ activeFilterCount }}
        </span>
      </button>
    </template>

    <!-- DESKTOP LAYOUT -->
    <template v-else>
      <!-- Header (Optional Title) -->
      <div v-if="title || $slots.header" class="flex justify-between items-center px-1">
        <h3 v-if="title" class="text-sm font-bold text-text/80 uppercase tracking-wider">{{ title }}</h3>
        <slot name="header"></slot>
      </div>

      <!-- TOP ROW (Search, Tabs, Main Actions) -->
      <div
        v-if="hasTopRow"
        class="flex flex-col lg:flex-row flex-wrap justify-between items-start lg:items-end gap-2"
      >
        <slot name="search" v-if="$slots.search" />
        <slot name="tabs" v-if="$slots.tabs" />
        <slot name="actions" v-if="$slots.actions" />
      </div>

      <!-- DIVIDER -->
      <div v-if="hasTopRow && hasBottomRow" class="h-px w-full bg-secondary/10 hidden lg:block"></div>

      <!-- BOTTOM ROW (Filters) -->
      <div v-if="hasBottomRow" class="flex flex-col lg:flex-row gap-4 items-end justify-between">
        <div v-if="$slots.filters" class="w-full flex-grow">
          <slot name="filters"></slot>
        </div>
        <div
          v-if="$slots['filter-actions']"
          class="flex gap-3 shrink-0 lg:ml-auto w-full lg:w-auto justify-end items-end h-full"
        >
          <slot name="filter-actions"></slot>
        </div>
      </div>

      <!-- ADVANCED FILTERS ROW -->
      <div v-if="$slots.advanced" class="w-full">
        <slot name="advanced"></slot>
      </div>
    </template>
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
</style>
