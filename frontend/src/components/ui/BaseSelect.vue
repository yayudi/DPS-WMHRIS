<script setup>
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue'

const props = defineProps({
  modelValue: {
    type: [Object, String, Number, Array, null],
    default: null,
  },
  options: {
    type: Array,
    default: () => [],
  },
  label: {
    type: String,
    default: 'label',
  },
  trackBy: {
    type: String,
    default: 'id',
  },
  placeholder: {
    type: String,
    default: 'Pilih opsi...',
  },
  searchable: {
    type: Boolean,
    default: true,
  },
  disabled: {
    type: Boolean,
    default: false,
  },
  multiple: {
    type: Boolean,
    default: false,
  },
  loading: {
    type: Boolean,
    default: false,
  },
  internalSearch: {
    type: Boolean,
    default: true,
  },
})

const emit = defineEmits(['update:modelValue', 'search-change'])

const isOpen = ref(false)
const searchQuery = ref('')
const containerRef = ref(null)
const triggerRef = ref(null) // New Trigger Ref
const dropdownRef = ref(null) // New Dropdown Ref (Teleported)
const inputRef = ref(null)

const dropdownStyle = ref({}) // Style for teleported dropdown

// --- COMPUTED ---
const displayValue = computed(() => {
  if (props.multiple) return '' // Multi handled by tags
  if (!props.modelValue) return ''
  if (typeof props.modelValue === 'object') {
    return props.modelValue[props.label]
  }
  return props.modelValue
})

const filteredOptions = computed(() => {
  if (!props.internalSearch) return props.options
  if (!props.searchable || !searchQuery.value) {
    return props.options
  }
  const query = searchQuery.value.toLowerCase()
  return props.options.filter((option) => {
    const text = typeof option === 'object' ? option[props.label] : String(option)
    return String(text).toLowerCase().includes(query)
  })
})

const selectedItems = computed(() => {
  if (!props.multiple) return []
  return Array.isArray(props.modelValue) ? props.modelValue : []
})

// --- WATCHERS ---
watch(searchQuery, (newQuery) => {
  if (props.searchable) {
    emit('search-change', newQuery)
  }
})

// --- METHODS ---
function toggle() {
  if (props.disabled) return
  if (isOpen.value) {
    close()
  } else {
    open()
  }
}

function updatePosition() {
  if (!isOpen.value || !triggerRef.value) return

  const rect = triggerRef.value.getBoundingClientRect()

  dropdownStyle.value = {
    position: 'absolute',
    top: `${rect.bottom + window.scrollY}px`,
    left: `${rect.left + window.scrollX}px`,
    width: `${rect.width}px`
  }
}

function open() {
  isOpen.value = true
  if (!props.internalSearch) {
    // If external search, keep query
  } else {
    searchQuery.value = ''
  }
  nextTick(() => {
    updatePosition() // Calculate position after render
    if (props.searchable && inputRef.value) {
      inputRef.value.focus()
    }
  })
}

function close() {
  isOpen.value = false
  if (props.internalSearch) {
    searchQuery.value = ''
  }
}

function select(option) {
  if (props.multiple) {
    const current = Array.isArray(props.modelValue) ? [...props.modelValue] : []
    const index = findIndex(current, option)
    if (index === -1) {
      current.push(option)
    } else {
      current.splice(index, 1)
    }
    emit('update:modelValue', current)
    // Keep open for multiple
    nextTick(updatePosition) // Re-calc in case height changes (though width is fixed)
  } else {
    emit('update:modelValue', option)
    close()
  }
}

function removeTag(option, event) {
  event.stopPropagation()
  if (!props.multiple) return
  const current = Array.isArray(props.modelValue) ? [...props.modelValue] : []
  const index = findIndex(current, option)
  if (index !== -1) {
    current.splice(index, 1)
    emit('update:modelValue', current)
    nextTick(updatePosition) // Re-calc height
  }
}

function findIndex(array, option) {
  if (typeof option === 'object' && props.trackBy) {
    return array.findIndex((item) => item[props.trackBy] === option[props.trackBy])
  }
  return array.indexOf(option)
}

function isSelected(option) {
  if (props.multiple) {
    return findIndex(selectedItems.value, option) !== -1
  }
  if (!props.modelValue) return false
  if (typeof props.modelValue === 'object' && props.trackBy) {
    return props.modelValue[props.trackBy] === option[props.trackBy]
  }
  return props.modelValue === option
}

// Click Outside Handler
const handleClickOutside = (event) => {
  const isClickInsideContainer = containerRef.value && containerRef.value.contains(event.target)
  const isClickInsideDropdown = dropdownRef.value && dropdownRef.value.contains(event.target)

  if (!isClickInsideContainer && !isClickInsideDropdown) {
    close()
  }
}

const handleResizeOrScroll = () => {
  if (isOpen.value) {
    updatePosition()
  }
}

onMounted(() => {
  document.addEventListener('click', handleClickOutside)
  window.addEventListener('resize', handleResizeOrScroll)
  window.addEventListener('scroll', handleResizeOrScroll, true)
})

onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside)
  window.removeEventListener('resize', handleResizeOrScroll)
  window.removeEventListener('scroll', handleResizeOrScroll, true)
})
</script>

<template>
  <div ref="containerRef" class="relative w-full text-left font-sans">
    <!-- TRIGGER AREA -->
    <div
      ref="triggerRef"
      @click="toggle"
      class="w-full min-h-[42px] px-3 py-2 bg-background border rounded-lg cursor-pointer flex flex-wrap gap-1.5 items-center transition-all shadow-sm"
      :class="[
        isOpen ? 'border-primary ring-1 ring-primary' : 'border-secondary/50 hover:border-primary/50',
        disabled ? 'opacity-50 cursor-not-allowed bg-secondary/10' : ''
      ]"
    >
      <!-- Loading Indicator -->
      <div v-if="loading" class="absolute right-8 top-1/2 -translate-y-1/2">
        <font-awesome-icon icon="fa-solid fa-spinner" class="animate-spin text-primary text-xs" />
      </div>

      <!-- Multiple: Tags -->
      <template v-if="multiple && selectedItems.length > 0">
        <div
          v-for="item in selectedItems"
          :key="typeof item === 'object' ? item[trackBy] : item"
          class="bg-primary/10 text-primary border border-primary/20 text-xs px-2 py-0.5 rounded-md flex items-center gap-1"
        >
          <span>{{ typeof item === 'object' ? item[label] : item }}</span>
          <span
            @click="(e) => removeTag(item, e)"
            class="cursor-pointer hover:text-primary/70 font-bold"
            >&times;</span
          >
        </div>
      </template>

      <!-- Single: Display Value -->
      <span v-else-if="!multiple && modelValue" class="text-sm text-text font-medium truncate pr-2 flex-grow">
        {{ displayValue }}
      </span>

      <!-- Placeholder -->
      <span
        v-if="(!modelValue && !multiple) || (multiple && selectedItems.length === 0)"
        class="text-sm text-text/40 truncate pr-2 flex-grow"
      >
        {{ placeholder }}
      </span>

      <!-- Icon Chevron -->
      <div class="ml-auto pl-2">
        <font-awesome-icon
          icon="fa-solid fa-chevron-down"
          class="text-xs text-text/40 transition-transform duration-200"
          :class="{ 'rotate-180': isOpen }"
        />
      </div>
    </div>

    <!-- DROPDOWN MENU (TELEPORTED) -->
    <Teleport to="body">
      <transition
        enter-active-class="transition duration-100 ease-out"
        enter-from-class="transform scale-95 opacity-0"
        enter-to-class="transform scale-100 opacity-100"
        leave-active-class="transition duration-75 ease-in"
        leave-from-class="transform scale-100 opacity-100"
        leave-to-class="transform scale-95 opacity-0"
      >
        <div
          v-if="isOpen"
          ref="dropdownRef"
          :style="dropdownStyle"
          class="fixed z-[9999] mt-1 bg-background border border-secondary/20 rounded-lg shadow-xl overflow-hidden text-sm"
        >
          <!-- Search Input -->
          <div v-if="searchable" class="p-2 border-b border-secondary/10 bg-secondary/5">
            <div class="relative">
              <font-awesome-icon
                icon="fa-solid fa-magnifying-glass"
                class="absolute left-3 top-1/2 -translate-y-1/2 text-text/30 text-xs"
              />
              <input
                ref="inputRef"
                v-model="searchQuery"
                type="text"
                placeholder="Cari..."
                class="w-full pl-8 pr-3 py-1.5 text-xs bg-background border border-secondary/20 rounded-md focus:outline-none focus:border-primary text-text placeholder:text-text/30"
                @keydown.esc="close"
              />
            </div>
          </div>

          <!-- Options List -->
          <ul class="max-h-60 overflow-y-auto custom-scrollbar p-1">
            <li
              v-if="loading"
              class="px-3 py-4 text-center text-text/60 italic text-xs"
            >
              Memuat data...
            </li>
            <li
              v-else-if="filteredOptions.length === 0"
              class="px-3 py-4 text-center text-text/40 italic text-xs"
            >
              <slot name="noResult">Tidak ada opsi ditemukan.</slot>
            </li>

            <li
              v-else
              v-for="(option, index) in filteredOptions"
              :key="typeof option === 'object' ? option[trackBy] : index"
              @click="select(option)"
              class="px-3 py-2 rounded-md cursor-pointer flex justify-between items-center transition-colors group"
              :class="[
                isSelected(option)
                  ? 'bg-primary/10 text-primary font-bold'
                  : 'text-text hover:bg-secondary/10'
              ]"
            >
              <!-- Slot for Custom Option Content -->
              <div class="flex-1 w-full truncate text-left">
                <slot name="option" :option="option" :selected="isSelected(option)">
                  {{ typeof option === 'object' ? option[label] : option }}
                </slot>
              </div>

              <!-- Checkmark for Selected -->
              <font-awesome-icon
                v-if="isSelected(option)"
                icon="fa-solid fa-check"
                class="text-xs ml-2"
              />
            </li>
          </ul>
        </div>
      </transition>
    </Teleport>
  </div>
</template>

<style scoped>
.custom-scrollbar::-webkit-scrollbar {
  width: 6px;
}
.custom-scrollbar::-webkit-scrollbar-track {
  background: transparent;
}
.custom-scrollbar::-webkit-scrollbar-thumb {
  background-color: rgba(var(--color-secondary), 0.2);
  border-radius: 9999px;
}
.custom-scrollbar::-webkit-scrollbar-thumb:hover {
  background-color: rgba(var(--color-secondary), 0.4);
}
</style>
