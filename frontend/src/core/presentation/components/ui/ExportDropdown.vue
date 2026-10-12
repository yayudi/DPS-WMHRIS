<script setup>
import { ref } from 'vue'

const props = defineProps({
  options: {
    type: Array,
    default: () => [
      { key: 'xlsx', label: 'Excel (.xlsx)', icon: 'fa-file-excel', iconClass: 'text-success' },
      { key: 'csv', label: 'CSV (.csv)', icon: 'fa-file-csv', iconClass: 'text-primary' }
    ]
  },
  loading: {
    type: Boolean,
    default: false
  },
  disabled: {
    type: Boolean,
    default: false
  },
  text: {
    type: String,
    default: 'Export'
  },
  buttonClass: {
    type: String,
    default: 'inline-flex items-center rounded-md bg-background px-3 py-2 text-sm font-semibold text-text shadow-sm ring-1 ring-inset ring-secondary/30 hover:bg-secondary/10 transition-colors'
  }
})

const emit = defineEmits(['select'])

const showMenu = ref(false)

const handleSelect = (option) => {
  showMenu.value = false
  emit('select', option.key)
}

const handleClick = () => {
  if (props.options.length === 1) {
    emit('select', props.options[0].key)
  } else {
    showMenu.value = !showMenu.value
  }
}
</script>

<template>
  <div
    class="relative inline-block text-left"
    @focusout.capture="
      e => {
        if (!e.currentTarget.contains(e.relatedTarget)) showMenu = false
      }
    "
    tabindex="-1"
  >
    <button
      @click="handleClick"
      type="button"
      :disabled="loading || disabled"
      :class="[buttonClass, (loading || disabled) ? 'opacity-50 cursor-not-allowed' : '']"
    >
      <font-awesome-icon v-if="loading" icon="fa-solid fa-circle-notch" spin class="-ml-0.5 mr-1.5" />
      <font-awesome-icon v-else-if="options.length === 1 && options[0].icon" :icon="`fa-solid ${options[0].icon}`" :class="['-ml-0.5 mr-1.5', options[0].iconClass]" />
      <font-awesome-icon v-else icon="fa-solid fa-file-export" class="-ml-0.5 mr-1.5 text-primary" />
      
      {{ loading ? 'Mempersiapkan...' : text }}
      
      <font-awesome-icon v-if="options.length > 1" icon="fa-solid fa-chevron-down" class="ml-2 -mr-1 h-4 w-4 text-text/50" />
    </button>
    <div
      v-if="showMenu && options.length > 1"
      class="absolute right-0 z-10 mt-2 w-48 origin-top-right rounded-md bg-background shadow-lg ring-1 ring-secondary/20 focus:outline-none overflow-hidden"
    >
      <div class="py-1">
        <button
          v-for="opt in options"
          :key="opt.key"
          @click="handleSelect(opt)"
          class="text-text w-full px-4 py-2 text-left text-sm hover:bg-secondary/10 transition-colors flex items-center gap-2"
        >
          <font-awesome-icon v-if="opt.icon" :icon="`fa-solid ${opt.icon}`" :class="opt.iconClass" />
          {{ opt.label }}
        </button>
      </div>
    </div>
  </div>
</template>
