<script setup>
import { ref, computed, onMounted, onUnmounted, nextTick, watch } from 'vue'
import { format, subDays, startOfMonth, endOfMonth, parseISO } from 'date-fns'
import { id } from 'date-fns/locale'

const props = defineProps({
  startDate: { type: String, default: null }, // YYYY-MM-DD
  endDate: { type: String, default: null },   // YYYY-MM-DD
  align: { type: String, default: 'left' }    // left, right
})

const emit = defineEmits(['update:startDate', 'update:endDate', 'change'])

const isOpen = ref(false)
const containerRef = ref(null)
const popoverStyle = ref({})

// Local state for the picker
const tempStart = ref('')
const tempEnd = ref('')

const presets = [
  { label: 'Hari Ini', getValue: () => [new Date(), new Date()] },
  { label: 'Kemarin', getValue: () => [subDays(new Date(), 1), subDays(new Date(), 1)] },
  { label: '7 Hari Terakhir', getValue: () => [subDays(new Date(), 6), new Date()] },
  { label: '30 Hari Terakhir', getValue: () => [subDays(new Date(), 29), new Date()] },
  { label: 'Bulan Ini', getValue: () => [startOfMonth(new Date()), new Date()] },
]

// Formatting helper
const formatDateYMD = (date) => format(date, 'yyyy-MM-dd')
const formatDateDisplay = (dateStr) => {
  if (!dateStr) return ''
  return format(parseISO(dateStr), 'dd MMM yyyy', { locale: id })
}

// Button label display
const displayLabel = computed(() => {
  if (!props.startDate && !props.endDate) return 'Filter Tanggal'
  if (props.startDate && !props.endDate) return `${formatDateDisplay(props.startDate)} - ...`
  if (!props.startDate && props.endDate) return `... - ${formatDateDisplay(props.endDate)}`

  if (props.startDate === props.endDate) {
    return formatDateDisplay(props.startDate)
  }
  return `${formatDateDisplay(props.startDate)} - ${formatDateDisplay(props.endDate)}`
})

const updatePosition = () => {
  if (!containerRef.value) return
  const rect = containerRef.value.getBoundingClientRect()

  const style = {
    top: `${rect.bottom + 8}px`, // +8px for margin (mt-2)
  }

  if (props.align === 'right') {
    style.right = `${window.innerWidth - rect.right}px`
    style.left = 'auto'
  } else {
    style.left = `${rect.left}px`
    style.right = 'auto'
  }

  popoverStyle.value = style
}

const toggleDropdown = async () => {
  if (!isOpen.value) {
    // Sync local state when opening
    tempStart.value = props.startDate || ''
    tempEnd.value = props.endDate || ''

    // Calculate position before showing (or right after)
    // We update position then set isOpen
    await nextTick()
    updatePosition()
  }
  isOpen.value = !isOpen.value
}

const selectPreset = (preset) => {
  const [start, end] = preset.getValue()
  tempStart.value = formatDateYMD(start)
  tempEnd.value = formatDateYMD(end)
}

const applyFilter = () => {
  emit('update:startDate', tempStart.value || undefined)
  emit('update:endDate', tempEnd.value || undefined)
  emit('change', { startDate: tempStart.value || undefined, endDate: tempEnd.value || undefined })
  isOpen.value = false
}

const clearFilter = () => {
  tempStart.value = ''
  tempEnd.value = ''
  applyFilter()
}

// Close logic
const closeDropdown = () => {
  isOpen.value = false
}

const handleClickOutside = (event) => {
  if (containerRef.value && containerRef.value.contains(event.target)) return
  if (event.target.closest('.date-range-popover')) return // Check interactions inside popover
  isOpen.value = false
}

// Handle scroll/resize to close dropdown (simple UX to avoid detached floating)
const handleScrollOrResize = () => {
  if (isOpen.value) isOpen.value = false
}

watch(isOpen, (val) => {
  if (val) {
    document.addEventListener('click', handleClickOutside)
    window.addEventListener('scroll', handleScrollOrResize, true) // Capture to detect any scroll
    window.addEventListener('resize', handleScrollOrResize)
    // Update position again in case of layout shifts
    nextTick(updatePosition)
  } else {
    document.removeEventListener('click', handleClickOutside)
    window.removeEventListener('scroll', handleScrollOrResize, true)
    window.removeEventListener('resize', handleScrollOrResize)
  }
})

onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside)
  window.removeEventListener('scroll', handleScrollOrResize, true)
  window.removeEventListener('resize', handleScrollOrResize)
})
</script>

<template>
  <div class="relative inline-block" ref="containerRef">
    <!-- Trigger Button -->
    <button @click.stop="toggleDropdown"
      class="flex items-center gap-2 px-4 py-2 bg-background border border-secondary/30 rounded-lg hover:border-primary/50 hover:bg-secondary/5 transition-all text-sm font-medium text-text group"
      :class="{ 'border-primary ring-1 ring-primary/20': isOpen || startDate }">
      <font-awesome-icon icon="fa-solid fa-calendar" class="text-text/50 group-hover:text-primary transition-colors" />
      <span>{{ displayLabel }}</span>
      <font-awesome-icon icon="fa-solid fa-chevron-down" class="text-xs text-text/30 ml-1 transition-transform"
        :class="{ 'rotate-180': isOpen }" />
    </button>

    <!-- Popover via Teleport -->
    <Teleport to="body">
      <div v-if="isOpen"
        class="date-range-popover fixed z-[9999] w-auto min-w-[320px] max-w-[600px] bg-background border border-secondary/20 shadow-xl rounded-xl overflow-hidden flex flex-col md:flex-row"
        :style="popoverStyle">

        <!-- Sidebar / Presets -->
        <div
          class="bg-secondary/5 border-b md:border-b-0 md:border-r border-secondary/20 p-2 flex flex-row md:flex-col gap-1 w-full md:w-[140px] overflow-x-auto md:overflow-visible">
          <button v-for="(preset, idx) in presets" :key="idx" @click="selectPreset(preset)"
            class="px-3 py-2 text-left text-xs font-medium rounded hover:bg-primary/10 hover:text-primary transition-colors whitespace-nowrap">
            {{ preset.label }}
          </button>
        </div>

        <!-- Custom Range Inputs -->
        <div class="p-4 flex-1">
          <h4 class="text-xs font-bold uppercase tracking-wider text-text/50 mb-3">Custom Range</h4>
          <div class="flex flex-col gap-3 mb-4">
            <div class="flex flex-col gap-1">
              <div class="flex items-center justify-between">
                <label class="text-[10px] uppercase text-text/60 font-semibold tracking-wider">Dari</label>
              </div>
              <input type="date" v-model="tempStart"
                class="w-full px-3 py-2 bg-background border border-secondary/30 rounded-lg text-xs focus:ring-2 focus:ring-primary focus:border-primary placeholder:text-text/30 text-text" />
            </div>
            <div class="flex flex-col gap-1">
              <div class="flex items-center justify-between">
                <label class="text-[10px] uppercase text-text/60 font-semibold tracking-wider">Sampai</label>
              </div>
              <input type="date" v-model="tempEnd" :min="tempStart"
                class="w-full px-3 py-2 bg-background border border-secondary/30 rounded-lg text-xs focus:ring-2 focus:ring-primary focus:border-primary placeholder:text-text/30 text-text" />
            </div>
          </div>

          <!-- Action Buttons -->
          <div class="flex justify-between items-center pt-3 border-t border-secondary/10">
            <button @click="clearFilter"
              class="text-xs text-danger/80 hover:text-danger font-medium px-2 py-1 rounded hover:bg-danger/5 transition-colors">
              Reset
            </button>
            <div class="flex gap-2">
              <button @click="closeDropdown"
                class="px-3 py-1.5 text-xs font-medium text-text/70 hover:bg-secondary/10 rounded-lg transition-colors border border-transparent">
                Batal
              </button>
              <button @click="applyFilter"
                class="px-3 py-1.5 text-xs font-bold text-white bg-primary hover:bg-primary-dark rounded-lg shadow-sm shadow-primary/30 transition-all hover:scale-[1.02]">
                Terapkan
              </button>
            </div>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>
