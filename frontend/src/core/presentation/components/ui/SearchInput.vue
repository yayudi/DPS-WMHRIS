<script setup>
import { ref, computed, onMounted } from 'vue'
import { onClickOutside } from '@vueuse/core'
import { useFloating, offset, flip, shift, autoUpdate } from '@floating-ui/vue'
import { useI18n } from '@/core/presentation/composables/useI18n'

const { t } = useI18n()

const props = defineProps({
  modelValue: {
    type: String,
    default: ''
  },
  placeholder: {
    type: String,
    default: 'Cari...'
  },
  inputId: {
    type: String,
    default: ''
  },
  autoFocus: {
    type: Boolean,
    default: false
  },
  searchBy: {
    type: String,
    default: ''
  },
  searchByOptions: {
    type: Array,
    default: () => []
  }
})

const emit = defineEmits(['update:modelValue', 'update:searchBy', 'search'])

const inputRef = ref(null)
const isSearchByOpen = ref(false)
const searchByButtonRef = ref(null)
const searchByDropdownRef = ref(null)

const normalizedSearchByOptions = computed(() =>
  props.searchByOptions.map(opt => ({
    value: opt.value ?? opt.id,
    label: opt.label
  }))
)

const hasSearchBy = computed(() => normalizedSearchByOptions.value.length > 0)

const activeSearchByLabel = computed(
  () =>
    normalizedSearchByOptions.value.find(opt => opt.value === props.searchBy)?.label ||
    normalizedSearchByOptions.value[0]?.label ||
    ''
)

const { floatingStyles: searchByFloatingStyles, isPositioned: isSearchByPositioned } = useFloating(
  searchByButtonRef,
  searchByDropdownRef,
  {
    open: isSearchByOpen,
    placement: 'bottom-start',
    strategy: 'fixed',
    transform: false,
    middleware: [offset(4), flip(), shift({ padding: 8 })],
    whileElementsMounted: autoUpdate
  }
)

onClickOutside(
  searchByDropdownRef,
  () => {
    isSearchByOpen.value = false
  },
  { ignore: [searchByButtonRef] }
)

function focus() {
  inputRef.value?.focus()
}

function onInput(e) {
  const val = e.target.value
  emit('update:modelValue', val)
  emit('search', val)
}

function clearInput() {
  emit('update:modelValue', '')
  emit('search', '')
}

function selectSearchBy(val) {
  emit('update:searchBy', val)
  isSearchByOpen.value = false
  focus()
}

onMounted(() => {
  if (props.autoFocus) {
    focus()
  }
})

defineExpose({ focus })
</script>

<template>
  <div
    class="relative flex items-stretch group w-full shadow-sm rounded-lg bg-background border border-secondary focus-within:border-primary focus-within:ring-1 focus-within:ring-primary/50 transition-all h-[42px]"
  >
    <!-- Optional Left SearchBy Dropdown Trigger -->
    <button
      v-if="hasSearchBy"
      ref="searchByButtonRef"
      type="button"
      aria-haspopup="listbox"
      :aria-expanded="isSearchByOpen"
      @click="isSearchByOpen = !isSearchByOpen"
      @keydown.escape="isSearchByOpen = false"
      class="h-full px-3 bg-secondary/10 hover:bg-secondary/20 border-r border-secondary/50 rounded-l-lg flex items-center gap-2 text-xs sm:text-sm font-semibold text-text/80 shrink-0 cursor-pointer transition-colors focus:outline-none select-none"
    >
      <span class="truncate max-w-[120px]">{{ activeSearchByLabel }}</span>
      <font-awesome-icon
        icon="fa-solid fa-chevron-down"
        class="text-[10px] text-text/50 transition-transform duration-200"
        :class="{ 'rotate-180': isSearchByOpen }"
      />
    </button>

    <!-- Search Input Area -->
    <div class="relative flex-1 flex items-center min-w-0">
      <span
        class="pl-3 flex items-center pointer-events-none text-text/40 group-focus-within:text-primary transition-colors"
      >
        <font-awesome-icon icon="fa-solid fa-search" />
      </span>

      <input
        ref="inputRef"
        :id="inputId || undefined"
        :value="modelValue"
        @input="onInput"
        type="text"
        :placeholder="placeholder === 'Cari...' ? t('common.filter.search') : placeholder"
        class="w-full min-w-0 pl-2.5 pr-9 py-2 bg-transparent text-sm text-text focus:outline-none transition-all placeholder-text/30 h-full"
        :class="hasSearchBy ? 'rounded-r-lg' : 'rounded-lg'"
      />

      <button
        v-if="modelValue"
        @click="clearInput"
        type="button"
        class="absolute inset-y-0 right-0 flex items-center pr-3.5 text-text/40 hover:text-danger cursor-pointer transition-colors"
        :title="t('common.btn.clear_search')"
      >
        <font-awesome-icon icon="fa-solid fa-times-circle" />
      </button>
    </div>

    <!-- Search By Dropdown Menu (Teleported) -->
    <Teleport to="body">
      <div
        v-if="hasSearchBy && isSearchByOpen"
        ref="searchByDropdownRef"
        :style="searchByFloatingStyles"
        @keydown.escape="isSearchByOpen = false"
        class="fixed z-[9999]"
        :class="{ 'invisible pointer-events-none': !isSearchByPositioned }"
      >
        <div
          role="listbox"
          class="bg-background border border-secondary/20 rounded-lg shadow-xl overflow-hidden text-sm p-1 min-w-[140px]"
          :class="isSearchByPositioned ? 'animate-fade-in-down' : 'opacity-0'"
        >
          <button
            v-for="opt in normalizedSearchByOptions"
            :key="opt.value"
            type="button"
            role="option"
            :aria-selected="opt.value === searchBy"
            @click="selectSearchBy(opt.value)"
            class="w-full px-3 py-2 rounded-md cursor-pointer flex justify-between items-center transition-colors text-left"
            :class="opt.value === searchBy ? 'bg-primary/10 text-primary font-bold' : 'text-text hover:bg-secondary/10'"
          >
            <span class="truncate">{{ opt.label }}</span>
            <font-awesome-icon v-if="opt.value === searchBy" icon="fa-solid fa-check" class="text-xs ml-2" />
          </button>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.animate-fade-in-down {
  animation: fadeInDown 0.2s ease-out;
}

@keyframes fadeInDown {
  from {
    opacity: 0;
    transform: translateY(-10px);
  }

  to {
    opacity: 1;
    transform: translateY(0);
  }
}
</style>
