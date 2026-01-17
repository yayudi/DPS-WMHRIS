<script setup>
import { reactive, watch } from 'vue'
import FilterContainer from '@/components/ui/FilterContainer.vue'
import DateRangeFilter from '@/components/ui/DateRangeFilter.vue'

const props = defineProps({
  title: {
    type: String,
    default: '',
  },
  filters: {
    type: Array,
    required: true,
  },
  modelValue: {
    type: Object,
    default: () => ({}),
  },
})

const emit = defineEmits(['update:modelValue', 'change', 'clear'])

// local copy so it's reactive
const localValues = reactive({ ...props.modelValue })

// sync with parent
watch(
  () => props.modelValue,
  (val) => {
    Object.assign(localValues, val)
  },
  { deep: true },
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
  <FilterContainer :title="title || 'Filter Data'">
    <div class="flex flex-wrap gap-4 items-center">
      <!-- Loop through filters -->
      <template v-for="(filter, index) in filters" :key="index">
        <!-- Date Range Filter -->
        <div v-if="filter.type === 'daterange'"
          class="flex flex-col md:flex-row md:items-center gap-1 md:gap-2 w-full md:w-auto">
          <label v-if="filter.label" class="text-sm font-medium text-text/80 whitespace-nowrap">
            {{ filter.label }}:
          </label>
          <DateRangeFilter :startDate="localValues[filter.keyStart]" :endDate="localValues[filter.keyEnd]"
            @update:startDate="localValues[filter.keyStart] = $event; emitChange()"
            @update:endDate="localValues[filter.keyEnd] = $event; emitChange()" class="w-full md:w-auto" />
        </div>

        <!-- Select Input -->
        <div v-else-if="filter.type === 'select'"
          class="flex flex-col md:flex-row md:items-center gap-1 md:gap-2 w-full md:w-auto">
          <label v-if="filter.label" :for="filter.key" class="text-sm font-medium text-text/80 whitespace-nowrap">
            {{ filter.label }}:
          </label>
          <select :id="filter.key" :multiple="filter.multiple || false"
            class="w-full md:w-auto px-3 py-2 bg-background border border-secondary text-text rounded-lg text-sm shadow-sm focus:ring-2 focus:ring-primary/50 focus:border-primary"
            v-model="localValues[filter.key]" @change="emitChange">
            <option v-for="opt in filter.options" :key="opt.value" :value="opt.value">
              {{ opt.label }}
            </option>
          </select>
        </div>
      </template>

      <!-- Clear Button -->
      <button type="button"
        class="ml-auto px-3 py-2 bg-secondary/60 hover:bg-secondary text-text/80 text-sm rounded-lg shadow-sm transition-colors flex items-center gap-2"
        @click="emitClear">
        <font-awesome-icon icon="fa-solid fa-rotate-left" />
        <span>Reset Filter</span>
      </button>
    </div>
  </FilterContainer>
</template>
