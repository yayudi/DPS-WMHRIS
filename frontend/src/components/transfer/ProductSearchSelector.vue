<!-- frontend\src\components\transfer\ProductSearchSelector.vue -->
<script setup>
import { ref, watch, onMounted, onUnmounted, nextTick } from 'vue'
import { searchProducts } from '@/api/helpers/products.js'

const props = defineProps({
  modelValue: { type: Object, default: null },
  placeholder: { type: String, default: 'Ketik nama / SKU...' },
  locationId: { type: [Number, String], default: null },
})

const emit = defineEmits(['update:modelValue'])

// State
const searchQuery = ref('')
const searchResults = ref([])
const isLoading = ref(false)
const showDropdown = ref(false)
const inputRef = ref(null)
const dropdownRef = ref(null)
const dropdownPos = ref({})
let debounceTimer = null

// --- LOGIC ---
watch(
  () => props.modelValue,
  (newVal) => {
    if (newVal) {
      searchQuery.value = newVal.name
    } else {
      searchQuery.value = ''
    }
  },
  { immediate: true },
)

const updateDropdownPosition = () => {
  if (inputRef.value) {
    const rect = inputRef.value.getBoundingClientRect()
    dropdownPos.value = {
      top: `${rect.bottom + window.scrollY + 5}px`,
      left: `${rect.left + window.scrollX}px`,
      width: `${rect.width}px`,
    }
  }
}

function handleInput() {
  const query = searchQuery.value
  if (!query) {
    emit('update:modelValue', null)
    searchResults.value = []
    showDropdown.value = false
    return
  }
  updateDropdownPosition()
  clearTimeout(debounceTimer)
  isLoading.value = true
  debounceTimer = setTimeout(async () => {
    try {
      if (query.length < 2) return
      const results = await searchProducts(query, props.locationId)
      searchResults.value = Array.isArray(results) ? results : []
      if (searchResults.value.length > 0) {
        showDropdown.value = true
        nextTick(() => updateDropdownPosition())
      }
    } catch (e) {
      console.error(e)
    } finally {
      isLoading.value = false
    }
  }, 300)
}

function selectItem(item) {
  emit('update:modelValue', item)
  searchQuery.value = item.name
  showDropdown.value = false
}

function closeDropdown() {
  showDropdown.value = false
}

function handleGlobalEvents(event) {
  if (!showDropdown.value) return
  if (event && event.type === 'scroll') {
    if (
      dropdownRef.value &&
      (event.target === dropdownRef.value || dropdownRef.value.contains(event.target))
    ) {
      return
    }
  }
  closeDropdown()
}

onMounted(() => {
  window.addEventListener('resize', handleGlobalEvents)
  window.addEventListener('scroll', handleGlobalEvents, true)
})
onUnmounted(() => {
  window.removeEventListener('resize', handleGlobalEvents)
  window.removeEventListener('scroll', handleGlobalEvents, true)
})

const getStockColor = (stock) => {
  if (!stock || stock <= 0) return 'text-danger bg-danger/10 border-danger/20'
  if (stock < 10) return 'text-warning bg-warning/10 border-warning/20'
  return 'text-success bg-success/10 border-success/20'
}
</script>

<template>
  <div class="relative w-full">
    <div class="relative" ref="inputRef">
      <input
        type="text"
        v-model="searchQuery"
        @input="handleInput"
        @focus="
          () => {
            if (searchResults.length) {
              showDropdown = true
              updateDropdownPosition()
            }
          }
        "
        :placeholder="placeholder"
        class="w-full pl-9 pr-8 py-1.5 bg-background border border-secondary/30 rounded text-sm text-text focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all shadow-sm font-medium placeholder-text/40"
      />

      <div class="absolute left-3 top-2 text-text/40 text-xs">
        <font-awesome-icon
          v-if="isLoading"
          icon="fa-solid fa-circle-notch"
          spin
          class="text-primary"
        />
        <font-awesome-icon v-else icon="fa-solid fa-search" />
      </div>

      <button
        v-if="searchQuery"
        @click="
          (handleInput({ target: { value: '' } }), (searchQuery = ''), (showDropdown = false))
        "
        class="absolute right-3 top-2 text-text/30 hover:text-danger transition-colors"
      >
        <font-awesome-icon icon="fa-solid fa-times" />
      </button>
    </div>

    <Teleport to="body">
      <div
        v-if="showDropdown && (searchResults.length > 0 || isLoading)"
        ref="dropdownRef"
        :style="{ top: dropdownPos.top, left: dropdownPos.left, width: dropdownPos.width }"
        class="fixed z-[99999] mt-1 bg-background rounded-lg shadow-2xl border border-secondary/30 max-h-60 overflow-y-auto overflow-x-hidden"
      >
        <ul class="py-1 relative z-10 bg-background">
          <li
            v-for="item in searchResults"
            :key="item.id || item.sku"
            @click="selectItem(item)"
            class="px-4 py-2 hover:bg-primary/5 cursor-pointer border-b border-secondary/10 last:border-0 transition-colors group"
          >
            <div class="flex justify-between items-center gap-2">
              <div class="min-w-0">
                <div class="font-bold text-sm text-text group-hover:text-primary truncate">
                  {{ item.name }}
                </div>
                <div class="text-[10px] text-text/50 font-mono">SKU: {{ item.sku }}</div>
              </div>

              <div
                v-if="item.current_stock !== undefined"
                class="shrink-0 text-[10px] font-bold px-2 py-0.5 rounded border whitespace-nowrap"
                :class="getStockColor(item.current_stock)"
              >
                Stok: {{ item.current_stock }}
              </div>
            </div>
          </li>

          <li
            v-if="!isLoading && searchResults.length === 0"
            class="px-4 py-3 text-center text-xs text-text/40"
          >
            Tidak ada hasil.
          </li>
        </ul>
      </div>
    </Teleport>
  </div>
</template>


