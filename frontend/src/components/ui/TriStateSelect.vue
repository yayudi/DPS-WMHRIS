<script setup>
import { ref, computed, onMounted, onUnmounted, watch, nextTick } from 'vue'
import { useFloating, autoUpdate, offset, flip, shift, size } from '@floating-ui/vue'
import { useListNavigation } from '@/composables/useListNavigation.js'

const props = defineProps({
  modelValue: {
    type: Object,
    default: () => ({ include: [], exclude: [] })
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
    default: false
  },
  disabled: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits(['update:modelValue'])

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

const dropdownListRef = ref(null)

const filteredOptions = computed(() => {
  if (!props.searchable || !searchQuery.value) return props.options
  const q = searchQuery.value.toLowerCase()
  return props.options.filter(opt => {
    const text = typeof opt === 'object' ? String(opt[props.label] || '') : String(opt || '')
    return text.toLowerCase().includes(q)
  })
})

const { selectedIndex, handleNavigation } = useListNavigation(
  dropdownListRef,
  filteredOptions,
  option => {
    const val = getOptionValue(option)
    const state = getItemState(val)
    if (state === 'include' || state === 'exclude') {
      setItemState(val, 'neutral')
    } else {
      if (excludeCount.value === 0) setItemState(val, 'include')
      else if (includeCount.value === 0) setItemState(val, 'exclude')
    }
  },
  '.select-option'
)

watch(isOpen, val => {
  if (val) {
    if (props.searchable) {
      nextTick(() => {
        inputRef.value?.focus()
      })
    }
  } else {
    searchQuery.value = ''
  }
})

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

const handleSearchKeydown = e => {
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter') {
    e.preventDefault()
    handleNavigation(e, isOpen.value)
  } else if (e.key === 'Escape') {
    e.preventDefault()
    close()
    triggerRef.value?.focus()
  }
}

// Ensure modelValue is always a proper object
const safeModelValue = computed(() => {
  return {
    include: Array.isArray(props.modelValue?.include) ? props.modelValue.include : [],
    exclude: Array.isArray(props.modelValue?.exclude) ? props.modelValue.exclude : []
  }
})

const includeCount = computed(() => safeModelValue.value.include.length)
const excludeCount = computed(() => safeModelValue.value.exclude.length)
const isPlaceholderState = computed(() => includeCount.value === 0 && excludeCount.value === 0)

// Removed displayValue, handling directly in template

function toggle() {
  if (props.disabled) return
  if (isOpen.value) close()
  else open()
}

function open() {
  isOpen.value = true
}

function close() {
  isOpen.value = false
}

function getOptionValue(option) {
  return typeof option === 'object' ? option[props.trackBy] : option
}

function getOptionLabel(option) {
  return typeof option === 'object' ? option[props.label] : option
}

function getItemState(val) {
  if (safeModelValue.value.include.includes(val)) return 'include'
  if (safeModelValue.value.exclude.includes(val)) return 'exclude'
  return 'neutral'
}

function setItemState(val, targetState) {
  const currentInclude = [...safeModelValue.value.include]
  const currentExclude = [...safeModelValue.value.exclude]

  const includeIndex = currentInclude.indexOf(val)
  const excludeIndex = currentExclude.indexOf(val)

  if (includeIndex > -1) currentInclude.splice(includeIndex, 1)
  if (excludeIndex > -1) currentExclude.splice(excludeIndex, 1)

  if (targetState === 'include') {
    currentInclude.push(val)
  } else if (targetState === 'exclude') {
    currentExclude.push(val)
  }

  emit('update:modelValue', { include: currentInclude, exclude: currentExclude })
}

function toggleInclude(option, event) {
  event.stopPropagation()
  const val = getOptionValue(option)
  const currentState = getItemState(val)
  if (currentState === 'include') {
    setItemState(val, 'neutral') // Toggle off
  } else {
    setItemState(val, 'include') // Toggle on
  }
}

function toggleExclude(option, event) {
  event.stopPropagation()
  const val = getOptionValue(option)
  const currentState = getItemState(val)
  if (currentState === 'exclude') {
    setItemState(val, 'neutral') // Toggle off
  } else {
    setItemState(val, 'exclude') // Toggle on
  }
}

function clearAll(event) {
  if (event) event.stopPropagation()
  emit('update:modelValue', { include: [], exclude: [] })
}

function includeFiltered() {
  const currentInclude = [...safeModelValue.value.include]
  const currentExclude = [...safeModelValue.value.exclude]

  filteredOptions.value.forEach(opt => {
    const val = getOptionValue(opt)
    const excIdx = currentExclude.indexOf(val)
    if (excIdx > -1) currentExclude.splice(excIdx, 1)
    if (!currentInclude.includes(val)) {
      currentInclude.push(val)
    }
  })

  emit('update:modelValue', { include: currentInclude, exclude: currentExclude })
}

function excludeFiltered() {
  const currentInclude = [...safeModelValue.value.include]
  const currentExclude = [...safeModelValue.value.exclude]

  filteredOptions.value.forEach(opt => {
    const val = getOptionValue(opt)
    const incIdx = currentInclude.indexOf(val)
    if (incIdx > -1) currentInclude.splice(incIdx, 1)
    if (!currentExclude.includes(val)) {
      currentExclude.push(val)
    }
  })

  emit('update:modelValue', { include: currentInclude, exclude: currentExclude })
}

// Click Outside
const handleClickOutside = event => {
  const isClickInsideContainer = containerRef.value && containerRef.value.contains(event.target)
  const isClickInsideDropdown = dropdownRef.value && dropdownRef.value.contains(event.target)

  if (!isClickInsideContainer && !isClickInsideDropdown) {
    close()
  }
}

onMounted(() => document.addEventListener('click', handleClickOutside))
onUnmounted(() => document.removeEventListener('click', handleClickOutside))
</script>

<template>
  <div ref="containerRef" class="relative text-left font-sans h-[42px] shadow-sm rounded-lg">
    <!-- TRIGGER AREA -->
    <div
      ref="triggerRef"
      @click="toggle"
      @keydown="handleKeydown"
      :tabindex="disabled ? -1 : 0"
      class="w-full h-full px-3 bg-background border rounded-lg cursor-pointer flex items-center justify-between transition-all shadow-sm select-none focus:outline-none"
      :class="[
        isOpen ? 'border-primary ring-1 ring-primary' : 'border-secondary/50 hover:border-primary/50',
        disabled ? 'opacity-50 cursor-not-allowed bg-secondary/10' : 'focus:ring-2 focus:ring-primary/50'
      ]"
    >
      <div class="flex items-center gap-2 truncate pr-2 flex-grow text-sm">
        <span v-if="isPlaceholderState" class="text-text/40 font-normal truncate">
          {{ placeholder }}
        </span>
        <div v-else class="flex items-center gap-3 text-text font-bold truncate">
          <span v-if="includeCount > 0" class="flex items-center gap-1.5 text-primary">
            <font-awesome-icon icon="fa-solid fa-check" class="text-xs" /> {{ includeCount }}
          </span>
          <span v-if="excludeCount > 0" class="flex items-center gap-1.5 text-danger">
            <font-awesome-icon icon="fa-solid fa-ban" class="text-xs" /> {{ excludeCount }}
          </span>
        </div>
      </div>

      <div class="flex items-center gap-1 shrink-0">
        <font-awesome-icon
          v-if="!isPlaceholderState && !disabled"
          icon="fa-solid fa-xmark"
          class="text-[13px] text-text/40 hover:text-danger cursor-pointer transition-colors p-1"
          @click.stop="clearAll"
          title="Bersihkan"
        />
        <font-awesome-icon
          v-else
          icon="fa-solid fa-chevron-down"
          class="text-xs text-text/40 transition-transform duration-200"
          :class="{ 'rotate-180': isOpen }"
        />
      </div>
    </div>

    <!-- DROPDOWN MENU -->
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
          class="z-[9999] w-max max-w-[90vw] p-2 md:max-w-md bg-background border border-secondary/20 rounded-lg shadow-xl overflow-hidden text-sm flex flex-col"
        >
          <!-- HEADER -->
          <div
            class="bg-secondary/5 border-b border-secondary/10 flex flex-col gap-2 p-2 text-xs font-bold text-text/60"
          >
            <div v-if="searchable" class="w-full relative">
              <font-awesome-icon
                icon="fa-solid fa-search"
                class="absolute left-3 top-1/2 -translate-y-1/2 text-text/40 text-[10px]"
              />
              <input
                ref="inputRef"
                v-model="searchQuery"
                @click.stop
                @keydown.stop="handleSearchKeydown"
                type="text"
                class="w-full pl-8 pr-3 py-1.5 bg-background border border-secondary/30 rounded-md text-xs focus:border-primary focus:ring-1 focus:ring-primary/30 outline-none transition-all"
                placeholder="Cari opsi..."
              />
            </div>
            <!-- Quick Actions for Search Results -->
            <div
              v-if="searchable && searchQuery && filteredOptions.length > 0"
              class="w-full flex items-center justify-between px-1 py-1.5 text-[10px] text-text/60 border-t border-secondary/10 mt-1"
            >
              <span>Hasil: {{ filteredOptions.length }}</span>
              <div class="flex gap-2">
                <button
                  type="button"
                  @click.stop="includeFiltered"
                  class="text-primary hover:underline font-bold transition-colors"
                  :disabled="excludeCount > 0"
                  :class="{ 'opacity-50 cursor-not-allowed': excludeCount > 0 }"
                  :title="excludeCount > 0 ? 'Tidak bisa include saat ada exclude aktif' : 'Include Semua'"
                >
                  + Include Semua
                </button>
                <span class="text-secondary/40">|</span>
                <button
                  type="button"
                  @click.stop="excludeFiltered"
                  class="text-danger hover:underline font-bold transition-colors"
                  :disabled="includeCount > 0"
                  :class="{ 'opacity-50 cursor-not-allowed': includeCount > 0 }"
                  :title="includeCount > 0 ? 'Tidak bisa exclude saat ada include aktif' : 'Exclude Semua'"
                >
                  - Exclude Semua
                </button>
              </div>
            </div>
            <div class="flex gap-2 w-full">
              <button
                @click="includeFiltered"
                class="flex-1 py-1.5 bg-primary/5 text-primary hover:text-secondary hover:bg-primary rounded-lg transition-colors font-medium text-xs"
              >
                Pilih Semua
              </button>
              <button
                @click="clearAll"
                class="flex-1 py-1.5 bg-danger/5 text-danger hover:text-secondary hover:bg-danger rounded-lg transition-colors font-medium text-xs"
              >
                Reset
              </button>
            </div>
          </div>

          <!-- OPTIONS LIST -->
          <div class="max-h-60 overflow-y-auto custom-scrollbar p-2 grid gap-y-1" ref="dropdownListRef">
            <div v-if="filteredOptions.length === 0" class="px-3 py-4 text-center text-text/40 italic text-xs">
              Tidak ada opsi ditemukan.
            </div>

            <div
              v-else
              v-for="(option, index) in filteredOptions"
              :key="typeof option === 'object' ? option[trackBy] : index"
              @mouseover="selectedIndex = index"
              class="select-option rounded-md flex justify-between items-center group py-1 px-2 transition-colors hover:bg-secondary/10"
              :class="[
                getItemState(getOptionValue(option)) === 'include' ? 'bg-primary/5' : '',
                getItemState(getOptionValue(option)) === 'exclude' ? 'bg-danger/5' : '',
                selectedIndex === index ? 'ring-1 ring-primary/50 bg-secondary/10' : ''
              ]"
            >
              <span class="flex-1 truncate font-medium text-text text-xs sm:text-sm">
                {{ getOptionLabel(option) }}
              </span>

              <div class="rounded-md flex items-center shrink-0 ml-2 p-1 gap-0 bg-secondary/20 border border-secondary">
                <!-- Include Button -->
                <button
                  @click="
                    e => {
                      if (excludeCount === 0) toggleInclude(option, e)
                    }
                  "
                  class="w-6 h-6 flex items-center justify-center transition-all border outline-none hover:rounded-md"
                  :class="[
                    getItemState(getOptionValue(option)) === 'include'
                      ? 'bg-primary text-secondary border-primary shadow-sm rounded-md'
                      : 'bg-primary/10 text-primary border-secondary/30 rounded-s-md hover:border-primary hover:text-primary',
                    excludeCount > 0 ? 'opacity-30 cursor-not-allowed hover:border-secondary/30 hover:text-text/30' : ''
                  ]"
                  :title="excludeCount > 0 ? 'Tidak bisa include saat ada exclude aktif' : 'Termasuk'"
                  :disabled="excludeCount > 0"
                >
                  <font-awesome-icon icon="fa-solid fa-check" class="text-[10px]" />
                </button>

                <!-- Exclude Button -->
                <button
                  @click="
                    e => {
                      if (includeCount === 0) toggleExclude(option, e)
                    }
                  "
                  class="w-6 h-6 hover:rounded-md flex items-center justify-center transition-all border outline-none"
                  :class="[
                    getItemState(getOptionValue(option)) === 'exclude'
                      ? 'bg-danger text-secondary border-danger shadow-sm rounded-md'
                      : 'bg-danger/10 text-danger border-secondary/30 rounded-e-md hover:border-danger hover:text-danger',
                    includeCount > 0 ? 'opacity-30 cursor-not-allowed hover:border-secondary/30 hover:text-text/30' : ''
                  ]"
                  :title="includeCount > 0 ? 'Tidak bisa exclude saat ada include aktif' : 'Kecuali'"
                  :disabled="includeCount > 0"
                >
                  <font-awesome-icon icon="fa-solid fa-ban" class="text-[10px]" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </transition>
    </Teleport>
  </div>
</template>
