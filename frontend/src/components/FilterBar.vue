<!-- FilterBar.vue -->
<script setup>
import { reactive, watch } from 'vue'

const props = defineProps({
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
  <!-- Main container with themed colors -->
  <div
    class="flex flex-wrap gap-4 items-center bg-background p-3 rounded-lg shadow-sm border border-secondary"
  >
    <!-- Loop through filters -->
    <template v-for="(filter, index) in filters" :key="index">
      <!-- Date Input -->
      <div v-if="filter.type === 'date'" class="flex items-center gap-2">
        <label
          v-if="filter.label"
          :for="filter.key"
          class="text-sm font-medium text-text/80 whitespace-nowrap"
        >
          {{ filter.label }}:
        </label>
        <input
          :id="filter.key"
          type="date"
          class="px-3 py-2 bg-background border border-secondary text-text rounded-lg text-sm shadow-sm focus:ring-2 focus:ring-primary/50 focus:border-primary"
          v-model="localValues[filter.key]"
          @input="emitChange"
        />
      </div>

      <!-- Select Input -->
      <div v-else-if="filter.type === 'select'" class="flex items-center gap-2">
        <label
          v-if="filter.label"
          :for="filter.key"
          class="text-sm font-medium text-text/80 whitespace-nowrap"
        >
          {{ filter.label }}:
        </label>
        <select
          :id="filter.key"
          :multiple="filter.multiple || false"
          class="px-3 py-2 bg-background border border-secondary text-text rounded-lg text-sm shadow-sm focus:ring-2 focus:ring-primary/50 focus:border-primary"
          v-model="localValues[filter.key]"
          @change="emitChange"
        >
          <option v-for="opt in filter.options" :key="opt.value" :value="opt.value">
            {{ opt.label }}
          </option>
        </select>
      </div>
    </template>

    <!-- Clear Button -->
    <button
      type="button"
      class="ml-auto px-3 py-2 bg-secondary/60 hover:bg-secondary text-text/80 text-sm rounded-lg shadow-sm transition-colors"
      @click="emitClear"
    >
      Reset Filter
    </button>
  </div>
</template>
