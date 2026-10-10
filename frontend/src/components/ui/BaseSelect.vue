<script setup>
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue'
import { useFloating, autoUpdate, offset, flip, shift, size } from '@floating-ui/vue'
import { useListNavigation } from '@/composables/useListNavigation'

const props = defineProps({
  modelValue: {
    type: [Object, String, Number, Array, null],
    default: null
  },
  options: {
    type: Array,
    default: () => []
  },
  label: {
    type: String,
    default: 'label'
  },
  trackBy: {
    type: String,
    default: 'id'
  },
  placeholder: {
    type: String,
    default: 'Pilih opsi...'
  },
  searchable: {
    type: Boolean,
    default: true
  },
  disabled: {
    type: Boolean,
    default: false
  },
  multiple: {
    type: Boolean,
    default: false
  },
  loading: {
    type: Boolean,
    default: false
  },
  internalSearch: {
    type: Boolean,
    default: true
  },
  emitValue: {
    type: Boolean,
    default: false
  },
  clearable: {
    type: Boolean,
    default: false
  },
  clearValue: {
    type: [String, Number, Boolean, Object, Array, null],
    default: ''
  },
  placeholderValues: {
    type: Array,
    default: () => [null, '', 'all']
  },
  autoOpen: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits(['update:modelValue', 'search-change'])

const isOpen = ref(false)
const searchQuery = ref('')
const containerRef = ref(null)
const triggerRef = ref(null)
const dropdownRef = ref(null)
const inputRef = ref(null)

const { floatingStyles } = useFloating(triggerRef, dropdownRef, {
  placement: 'bottom-start',
  whileElementsMounted: autoUpdate,
  middleware: [
    offset(4),
    flip(),
    shift({ padding: 8 }),
    size({
      apply({ rects, elements }) {
        Object.assign(elements.floating.style, {
          minWidth: `${rects.reference.width}px`,
          maxWidth: '90vw'
        })
      }
    })
  ]
})

// --- COMPUTED ---
const displayValue = computed(() => {
  if (props.multiple) return ''
  if (props.modelValue == null || props.modelValue === '') return ''
  if (typeof props.modelValue === 'object') {
    return props.modelValue[props.label]
  }
  if (props.emitValue) {
    const matched = props.options.find(opt => {
      if (typeof opt === 'object') return opt[props.trackBy] == props.modelValue
      return opt == props.modelValue
    })
    if (matched && typeof matched === 'object') return matched[props.label]
    if (matched) return matched
  }
  return props.modelValue
})

const filteredOptions = computed(() => {
  if (!props.internalSearch) return props.options
  if (!props.searchable || !searchQuery.value) {
    return props.options
  }
  const query = searchQuery.value.toLowerCase()
  return props.options.filter(option => {
    const text = typeof option === 'object' ? option[props.label] : String(option)
    return String(text).toLowerCase().includes(query)
  })
})

const selectedItems = computed(() => {
  if (!props.multiple) return []
  return Array.isArray(props.modelValue) ? props.modelValue : []
})

const isPlaceholderState = computed(() => {
  if (props.multiple) return selectedItems.value.length === 0
  return props.placeholderValues.includes(props.modelValue)
})

const { selectedIndex, handleNavigation } = useListNavigation(
  dropdownRef,
  filteredOptions,
  option => select(option),
  '.select-option'
)

const handleKeydown = event => {
  if (!isOpen.value) {
    if (event.key === 'Enter' || event.key === ' ' || event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      open()
    }
    return
  }

  if (event.key === 'Escape') {
    close()
    triggerRef.value?.focus()
    return
  }

  handleNavigation(event, isOpen.value)
}

// --- WATCHERS ---
watch(searchQuery, newQuery => {
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

function open() {
  isOpen.value = true
  if (props.internalSearch) {
    searchQuery.value = ''
  }
  nextTick(() => {
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

function getOptionValue(option) {
  if (props.emitValue && typeof option === 'object') {
    return option[props.trackBy]
  }
  return option
}

function select(option) {
  const valueToEmit = getOptionValue(option)

  if (props.multiple) {
    const current = Array.isArray(props.modelValue) ? [...props.modelValue] : []
    const index = findIndex(current, valueToEmit)
    if (index === -1) {
      current.push(valueToEmit)
    } else {
      current.splice(index, 1)
    }
    emit('update:modelValue', current)
  } else {
    emit('update:modelValue', valueToEmit)
    close()
    triggerRef.value?.focus()
  }
}

function removeTag(item, event) {
  event.stopPropagation()
  if (!props.multiple) return
  const current = Array.isArray(props.modelValue) ? [...props.modelValue] : []
  const index = findIndex(current, item)
  if (index !== -1) {
    current.splice(index, 1)
    emit('update:modelValue', current)
  }
}

function findIndex(array, val) {
  return array.findIndex(item => {
    const isItemObj = item !== null && typeof item === 'object'
    const isValObj = val !== null && typeof val === 'object'
    if (isItemObj && isValObj && props.trackBy) {
      if (item[props.trackBy] !== undefined) {
        return item[props.trackBy] == val[props.trackBy]
      }
    }
    if (isItemObj !== isValObj) return false
    return item == val
  })
}

function isSelected(option) {
  const val = getOptionValue(option)
  if (props.multiple) {
    return findIndex(selectedItems.value, val) !== -1
  }
  if (props.modelValue == null || props.modelValue === '') return false

  const isModelObj = props.modelValue !== null && typeof props.modelValue === 'object'
  const isValObj = val !== null && typeof val === 'object'

  if (isModelObj && isValObj && props.trackBy) {
    if (props.modelValue[props.trackBy] !== undefined) {
      return props.modelValue[props.trackBy] == val[props.trackBy]
    }
  }

  if (isModelObj !== isValObj) return false
  return props.modelValue == val
}

function selectAll() {
  if (!props.multiple) return
  const current = Array.isArray(props.modelValue) ? [...props.modelValue] : []
  filteredOptions.value.forEach(opt => {
    const val = getOptionValue(opt)
    if (findIndex(current, val) === -1) {
      current.push(val)
    }
  })
  emit('update:modelValue', current)
}

function clearSelection() {
  if (!props.multiple) return
  emit('update:modelValue', [])
}

function handleClear(event) {
  event.stopPropagation()
  if (props.disabled) return

  if (props.multiple) {
    emit('update:modelValue', [])
  } else {
    emit('update:modelValue', props.clearValue)
  }
}

// Click Outside Handler
const handleClickOutside = event => {
  const isClickInsideContainer = containerRef.value && containerRef.value.contains(event.target)
  const isClickInsideDropdown = dropdownRef.value && dropdownRef.value.contains(event.target)

  if (!isClickInsideContainer && !isClickInsideDropdown) {
    close()
  }
}

onMounted(() => {
  document.addEventListener('click', handleClickOutside)
})

// --- LIFECYCLE ---
onMounted(() => {
  if (props.autoOpen) {
    // slight delay to ensure teleport target is ready if needed
    setTimeout(() => {
      open()
    }, 10)
  }
})

onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside)
})
</script>

<template>
  <div ref="containerRef" class="relative text-left font-sans h-[42px] shadow-sm rounded-lg">
    <!-- TRIGGER AREA -->
    <div
      ref="triggerRef"
      @click="toggle"
      @keydown="handleKeydown"
      :tabindex="disabled ? -1 : 0"
      class="w-full min-h-[42px] px-2 bg-background border rounded-lg cursor-pointer flex flex-wrap gap-1 items-center transition-all shadow-sm focus:outline-none"
      :class="[
        isOpen ? 'border-primary ring-1 ring-primary' : 'border-secondary/50 hover:border-primary/50',
        disabled ? 'opacity-50 cursor-not-allowed bg-secondary/10' : 'focus:ring-2 focus:ring-primary/50'
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
          class="bg-primary/10 text-primary border border-primary/20 text-xs px-2 py-0.5 rounded-md flex items-center gap-1 select-none"
        >
          <span>{{
            typeof item === 'object'
              ? item[label]
              : props.emitValue
                ? options.find(o => (typeof o === 'object' ? o[trackBy] == item : o == item))?.[label] || item
                : item
          }}</span>
          <span @click="e => removeTag(item, e)" class="cursor-pointer hover:text-primary/70 font-bold">&times;</span>
        </div>
      </template>

      <!-- Single: Display Value / Placeholder -->
      <span
        v-else-if="!multiple"
        class="text-sm truncate pr-2 flex-grow select-none"
        :class="isPlaceholderState ? 'text-text/40 font-normal' : 'text-text font-medium'"
      >
        {{
          isPlaceholderState && (!displayValue || displayValue === modelValue)
            ? placeholder
            : displayValue || placeholder
        }}
      </span>

      <!-- Placeholder for Multiple -->
      <span v-if="multiple && selectedItems.length === 0" class="text-sm text-text/40 truncate flex-grow select-none">
        {{ placeholder }}
      </span>

      <!-- Action Icons -->
      <div class="ml-auto pl-1 flex items-center gap-1">
        <!-- Clear Button -->
        <font-awesome-icon
          v-if="clearable && !isPlaceholderState && !disabled"
          icon="fa-solid fa-xmark"
          class="text-[13px] text-text/40 hover:text-danger cursor-pointer transition-colors py-1"
          @click.stop="handleClear"
          title="Bersihkan"
        />
        <!-- Icon Chevron -->
        <font-awesome-icon
          v-else
          icon="fa-solid fa-chevron-down"
          class="text-xs text-text/40 transition-transform duration-200"
          :class="{ 'rotate-180': isOpen }"
        />
      </div>
    </div>

    <!-- DROPDOWN MENU (TELEPORTED) -->
    <Teleport to="body">
      <transition
        enter-active-class="transition-opacity duration-150 ease-out"
        enter-from-class="opacity-0"
        enter-to-class="opacity-100"
        leave-active-class="transition-opacity duration-100 ease-in"
        leave-from-class="opacity-100"
        leave-to-class="opacity-0"
      >
        <div
          v-if="isOpen"
          ref="dropdownRef"
          :style="floatingStyles"
          class="z-[9999] bg-background border border-secondary/20 rounded-lg shadow-xl overflow-hidden text-sm"
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
                @keydown="handleKeydown"
              />
            </div>
          </div>

          <!-- Multiple Selection Action Buttons -->
          <div
            v-if="multiple"
            class="p-2 border-b border-secondary/10 bg-background flex flex-wrap gap-1 justify-between items-center text-xs"
          >
            <button
              @click.stop="selectAll"
              class="text-primary hover:text-primary/80 font-semibold px-2 py-1 rounded hover:bg-primary/10 transition-colors"
            >
              <font-awesome-icon icon="fa-solid fa-check-double" class="mr-1" /> Pilih Semua
            </button>
            <button
              @click.stop="clearSelection"
              class="text-danger hover:text-danger/80 font-semibold px-2 py-1 rounded hover:bg-danger/10 transition-colors"
            >
              <font-awesome-icon icon="fa-solid fa-eraser" class="mr-1" /> Bersihkan
            </button>
          </div>

          <!-- Options List (Multiple as Chip Cloud) -->
          <div
            v-if="multiple"
            class="max-h-[300px] overflow-y-auto custom-scrollbar p-3 flex flex-wrap gap-1 items-start content-start"
          >
            <div v-if="loading" class="w-full text-center text-text/60 italic text-xs py-2">Memuat data...</div>
            <div v-else-if="filteredOptions.length === 0" class="w-full text-center text-text/40 italic text-xs py-2">
              <slot name="noResult">Tidak ada opsi ditemukan.</slot>
            </div>
            <button
              v-else
              v-for="(option, index) in filteredOptions"
              :key="typeof option === 'object' ? option[trackBy] : index"
              @click.stop="select(option)"
              @mouseover="selectedIndex = index"
              class="select-option px-3 py-1.5 rounded-full text-xs sm:text-sm font-medium transition-all shadow-sm flex items-center gap-1 focus:outline-none focus:ring-2 focus:ring-primary/50"
              :class="[
                isSelected(option)
                  ? 'bg-primary text-secondary border border-transparent hover:brightness-110'
                  : 'bg-secondary/10 text-text border border-secondary/30 hover:bg-secondary/20',
                selectedIndex === index ? 'ring-2 ring-primary/50' : ''
              ]"
            >
              <span class="truncate max-w-[200px] text-left">
                <slot name="option" :option="option" :selected="isSelected(option)">
                  {{ typeof option === 'object' ? option[label] : option }}
                </slot>
              </span>
              <font-awesome-icon v-if="isSelected(option)" icon="fa-solid fa-check" class="text-[10px]" />
              <font-awesome-icon v-else icon="fa-solid fa-plus" class="text-[10px]" />
            </button>
          </div>

          <!-- Options List (Single mode) -->
          <ul v-else class="max-h-60 overflow-y-auto custom-scrollbar p-1">
            <li v-if="loading" class="px-3 py-4 text-center text-text/60 italic text-xs">Memuat data...</li>
            <li v-else-if="filteredOptions.length === 0" class="px-3 py-4 text-center text-text/40 italic text-xs">
              <slot name="noResult">Tidak ada opsi ditemukan.</slot>
            </li>

            <li
              v-else
              v-for="(option, index) in filteredOptions"
              :key="typeof option === 'object' ? option[trackBy] : index"
              @mousedown.prevent.stop="select(option)"
              @mouseover="selectedIndex = index"
              class="select-option px-3 py-2 rounded-md cursor-pointer flex justify-between items-center transition-colors group"
              :class="[
                isSelected(option) ? 'bg-primary/10 text-primary font-bold' : 'text-text hover:bg-secondary/10',
                selectedIndex === index ? 'bg-secondary/10 ring-1 ring-primary/50' : ''
              ]"
            >
              <!-- Slot for Custom Option Content -->
              <div class="flex-1 w-full truncate text-left">
                <slot name="option" :option="option" :selected="isSelected(option)">
                  {{ typeof option === 'object' ? option[label] : option }}
                </slot>
              </div>

              <!-- Checkmark for Selected -->
              <font-awesome-icon v-if="isSelected(option)" icon="fa-solid fa-check" class="text-xs ml-2" />
            </li>

            <slot name="afterOptions"></slot>
          </ul>
        </div>
      </transition>
    </Teleport>
  </div>
</template>
