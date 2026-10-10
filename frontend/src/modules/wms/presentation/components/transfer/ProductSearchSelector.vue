<script setup>
import { ref, watch, toRef, onMounted, onUnmounted } from 'vue'
import { useProductSearch } from '@/modules/wms/application/useProductSearch'
import { useListNavigation } from '@/composables/useListNavigation'
import { useFloating, autoUpdate, offset, flip, shift, size } from '@floating-ui/vue'

const props = defineProps({
  modelValue: { type: Object, default: null },
  placeholder: { type: String, default: 'Ketik nama / SKU' },
  locationId: { type: [Number, String], default: null },
  disabled: { type: Boolean, default: false },
  enableScanner: { type: Boolean, default: false },
  displayField: { type: String, default: 'name' },
  inStockOnly: { type: Boolean, default: false }
})

const emit = defineEmits(['update:modelValue', 'scanner-match'])

const {
  results: searchResults,
  isSearching: isLoading,
  performSearch,
  clear: clearSearch,
  fetchNextPage,
  hasNextPage,
  isFetchingNextPage
} = useProductSearch({
  locationId: toRef(props, 'locationId'),
  inStockOnly: toRef(props, 'inStockOnly')
})

import { useIntersectionObserver } from '@vueuse/core'
const bottomSentinelRef = ref(null)

useIntersectionObserver(
  bottomSentinelRef,
  ([{ isIntersecting }]) => {
    if (isIntersecting && hasNextPage.value && !isFetchingNextPage.value) {
      fetchNextPage()
    }
  },
  { threshold: 0.1 }
)

const searchQuery = ref('')
const showDropdown = ref(false)
const inputRef = ref(null)
const triggerRef = ref(null)
const dropdownRef = ref(null)
const dropdownListRef = ref(null)
const { selectedIndex, handleNavigation } = useListNavigation(dropdownListRef, searchResults, item => selectItem(item))

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
          width: `${rects.reference.width}px`
        })
      }
    })
  ]
})

// --- LOGIC ---
watch(
  () => props.modelValue,
  (newVal, oldVal) => {
    if (newVal) {
      searchQuery.value = newVal[props.displayField] || newVal.name
    } else {
      if (oldVal) {
        const oldName = oldVal[props.displayField] || oldVal.name
        if (searchQuery.value === oldName) {
          searchQuery.value = ''
        }
      } else if (oldVal === undefined) {
        searchQuery.value = ''
      }
    }
  },
  { immediate: true }
)

watch(isLoading, newVal => {
  if (newVal && searchQuery.value.length >= 2) {
    showDropdown.value = true
  }
})

watch(
  searchResults,
  newVal => {
    if (newVal.length > 0 && searchQuery.value.length >= 2) {
      showDropdown.value = true

      if (props.enableScanner && searchQuery.value) {
        const match = newVal.find(p => p.sku.toLowerCase() === searchQuery.value.toLowerCase())
        if (match) {
          console.log('[Scanner Auto] Exact match found:', match.sku)
          emit('scanner-match', match)
          searchQuery.value = ''
          showDropdown.value = false
        }
      }
    }
  },
  { deep: true }
)
async function handleInput() {
  const query = searchQuery.value

  if (props.modelValue) {
    const currentName = props.modelValue[props.displayField] || props.modelValue.name
    if (query !== currentName) {
      emit('update:modelValue', null)
    }
  }

  if (!query || query.length < 2) {
    emit('update:modelValue', null)
    clearSearch()
    showDropdown.value = false
    return
  }

  // The composable will debounce this automatically
  performSearch(query)
}

function clearInput() {
  searchQuery.value = ''
  emit('update:modelValue', null)
  clearSearch()
  showDropdown.value = false
}

function selectItem(item) {
  emit('update:modelValue', item)
  searchQuery.value = item[props.displayField] || item.name
  showDropdown.value = false
}

const handleKeydown = event => {
  if (props.enableScanner && (event.key === 'Enter' || event.key === 'Tab')) {
    event.preventDefault()
  }

  handleNavigation(event, showDropdown.value)
}

function closeDropdown() {
  showDropdown.value = false
}

const handleClickOutside = event => {
  const isClickInsideContainer = triggerRef.value && triggerRef.value.contains(event.target)
  const isClickInsideDropdown = dropdownRef.value && dropdownRef.value.contains(event.target)

  if (!isClickInsideContainer && !isClickInsideDropdown) {
    closeDropdown()
  }
}

onMounted(() => {
  document.addEventListener('click', handleClickOutside)
})

onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside)
})

const getStockColor = stock => {
  if (!stock || stock <= 0) return 'text-danger bg-danger/10 border-danger/20'
  if (stock < 10) return 'text-warning bg-warning/10 border-warning/20'
  return 'text-success bg-success/10 border-success/20'
}

const focusInput = () => {
  if (inputRef.value) {
    inputRef.value.focus()
  }
}

defineExpose({ focusInput })
</script>

<template>
  <div class="relative w-full h-[42px] shadow-sm rounded-lg text-left font-sans" ref="triggerRef">
    <div class="relative h-full">
      <input
        type="text"
        ref="inputRef"
        v-model="searchQuery"
        @input="handleInput"
        @keydown="handleKeydown"
        @focus="
          () => {
            if (searchResults.length && !disabled) {
              showDropdown = true
            }
          }
        "
        :placeholder="placeholder"
        :disabled="disabled"
        class="w-full h-full pl-9 pr-8 py-1.5 bg-background border rounded-lg text-sm text-text focus:outline-none transition-all font-medium placeholder-text/40"
        :class="[
          showDropdown ? 'border-primary ring-1 ring-primary' : 'border-secondary/50 hover:border-primary/50',
          disabled ? 'opacity-50 cursor-not-allowed bg-secondary/10' : ''
        ]"
      />

      <div class="absolute left-3 top-1/2 -translate-y-1/2 text-text/40 text-xs">
        <font-awesome-icon v-if="isLoading" icon="fa-solid fa-circle-notch" spin class="text-primary" />
        <font-awesome-icon v-else icon="fa-solid fa-search" />
      </div>

      <button
        v-if="searchQuery"
        @click="clearInput"
        class="absolute right-3 top-1/2 -translate-y-1/2 text-text/30 hover:text-danger transition-colors flex items-center justify-center w-5 h-5"
      >
        <font-awesome-icon icon="fa-solid fa-times" />
      </button>
    </div>

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
          v-if="showDropdown && (searchResults.length > 0 || isLoading)"
          ref="dropdownRef"
          :style="floatingStyles"
          class="z-[9999] bg-background border border-secondary/20 rounded-lg shadow-xl overflow-hidden text-sm"
        >
          <ul class="max-h-60 overflow-y-auto custom-scrollbar p-1" ref="dropdownListRef">
            <li
              v-for="(item, index) in searchResults"
              :key="item.id || item.sku"
              @mousedown.prevent.stop="selectItem(item)"
              @mouseover="selectedIndex = index"
              class="px-3 py-2 rounded-md cursor-pointer flex justify-between items-center transition-colors group text-text"
              :class="selectedIndex === index ? 'bg-secondary/10' : 'hover:bg-secondary/10'"
            >
              <div class="flex-1 min-w-0">
                <div
                  class="font-bold text-sm truncate text-left transition-colors"
                  :class="selectedIndex === index ? 'text-primary' : 'text-text group-hover:text-primary'"
                >
                  {{ item.name }}
                </div>
                <div class="text-[10px] text-text/50 font-mono text-left">SKU: {{ item.sku }}</div>
              </div>

              <div
                v-if="item.current_stock !== undefined"
                class="shrink-0 text-[10px] font-bold px-2 py-0.5 rounded border whitespace-nowrap ml-2"
                :class="getStockColor(item.current_stock)"
              >
                Stok: {{ item.current_stock }}
              </div>
            </li>

            <li
              v-if="!isLoading && searchResults.length === 0"
              class="px-3 py-4 text-center text-text/40 italic text-xs"
            >
              Tidak ada hasil.
            </li>

            <li v-if="hasNextPage" ref="bottomSentinelRef" class="h-2 w-full"></li>
            <li
              v-if="isFetchingNextPage"
              class="px-3 py-2 text-center text-text/50 text-xs flex justify-center items-center gap-2"
            >
              <font-awesome-icon icon="fa-solid fa-circle-notch" spin class="text-primary" />
              <span>Memuat...</span>
            </li>
          </ul>
        </div>
      </transition>
    </Teleport>
  </div>
</template>
