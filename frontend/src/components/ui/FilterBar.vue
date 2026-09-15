<!-- frontend\src\components\ui\FilterBar.vue -->
<script setup>
import { reactive, watch } from 'vue'
import BaseFilterPanel from '@/components/ui/BaseFilterPanel.vue'
import DateRangeFilter from '@/components/ui/DateRangeFilter.vue'
import BaseSelect from '@/components/ui/BaseSelect.vue'
import TriStateSelect from '@/components/ui/TriStateSelect.vue'
import SegmentedControl from '@/components/ui/SegmentedControl.vue'

const props = defineProps({
  title: {
    type: String,
    default: ''
  },
  filters: {
    type: Array,
    required: true
  },
  modelValue: {
    type: Object,
    default: () => ({})
  }
})

const emit = defineEmits(['update:modelValue', 'change', 'clear'])

// local copy so it's reactive
const localValues = reactive({ ...props.modelValue })

// sync with parent
watch(
  () => props.modelValue,
  val => {
    Object.assign(localValues, val)
  },
  { deep: true }
)

function emitChange() {
  emit('update:modelValue', { ...localValues })
  emit('change', { ...localValues })
}

function emitClear() {
  emit('clear')
}
</script>

<template>
  <BaseFilterPanel :title="title">
    <template #search v-if="$slots.search">
      <slot name="search"></slot>
    </template>
    <template #tabs v-if="$slots.tabs">
      <slot name="tabs"></slot>
    </template>
    <template #header v-if="$slots.header">
      <slot name="header"></slot>
    </template>
    <template #actions v-if="$slots.actions">
      <slot name="actions"></slot>
    </template>

    <template #filters>
      <slot name="prepend"></slot>
      <!-- Loop through filters -->
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 w-full">
        <template v-for="(filter, index) in filters" :key="index">
          <div class="flex flex-col gap-1.5 w-full" :class="filter.class">
            <label
              v-if="filter.label"
              :for="filter.key"
              class="text-[10px] font-bold text-text/50 uppercase tracking-wide"
            >
              {{ filter.label }}
            </label>

            <!-- Date Range Filter -->
            <DateRangeFilter
              v-if="filter.type === 'daterange'"
              :startDate="localValues[filter.keyStart]"
              :endDate="localValues[filter.keyEnd]"
              @update:startDate="((localValues[filter.keyStart] = $event), emitChange())"
              @update:endDate="((localValues[filter.keyEnd] = $event), emitChange())"
              class="w-full"
            />

            <!-- Select Input -->
            <BaseSelect
              v-else-if="filter.type === 'select'"
              v-model="localValues[filter.key]"
              :options="filter.options"
              track-by="value"
              emit-value
              :multiple="filter.multiple || false"
              :searchable="filter.searchable || false"
              :clearable="filter.clearable !== undefined ? filter.clearable : true"
              :clear-value="filter.clearValue !== undefined ? filter.clearValue : 'all'"
              :placeholder="filter.placeholder || 'Semua ' + filter.label"
              @update:modelValue="emitChange"
              class="w-full"
            />

            <TriStateSelect
              v-else-if="filter.type === 'triselect'"
              v-model="localValues[filter.key]"
              :options="filter.options"
              :label="filter.optionLabel || 'label'"
              :track-by="filter.trackBy || 'id'"
              :placeholder="filter.placeholder || 'Pilih ' + filter.label"
              :searchable="filter.searchable || false"
              @update:modelValue="emitChange"
              class="w-full"
            />

            <SegmentedControl
              v-else-if="filter.type === 'segmented'"
              v-model="localValues[filter.key]"
              :options="filter.options"
              @update:modelValue="emitChange"
              class="w-full h-[42px]"
            />

            <!-- Text Input -->
            <div v-else-if="filter.type === 'text'" class="relative w-full group">
              <span
                v-if="filter.icon !== false"
                class="absolute inset-y-0 left-0 pl-3 flex items-center text-text/40 group-focus-within:text-primary transition-colors pointer-events-none"
              >
                <font-awesome-icon :icon="filter.icon || 'fa-solid fa-search'" />
              </span>
              <input
                v-model="localValues[filter.key]"
                type="text"
                :placeholder="filter.placeholder || filter.label"
                class="min-w-[250px] w-full h-[42px] rounded-lg bg-background border border-secondary/50 focus:border-primary focus:ring-1 focus:ring-primary/20 outline-none transition-all text-sm text-text placeholder:text-text/30 shadow-sm"
                :class="filter.icon !== false ? 'pl-9 pr-3' : 'px-3'"
                @input="emitChange"
              />
            </div>
          </div>
        </template>
      </div>
    </template>

    <template #filter-actions>
      <!-- Clear Button -->
      <button
        type="button"
        class="h-[42px] px-4 flex items-center justify-center gap-2 border border-danger/30 rounded-lg text-sm font-semibold text-danger hover:bg-danger/10 transition-all bg-danger/5 active:scale-[0.98]"
        @click="emitClear"
      >
        <font-awesome-icon icon="fa-solid fa-rotate-right" />
        <span class="hidden lg:inline">Reset</span>
      </button>

      <slot name="filter-actions"></slot>
    </template>
  </BaseFilterPanel>
</template>
