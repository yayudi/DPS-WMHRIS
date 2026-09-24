<!-- frontend/src/views/admin/ShiftSchedule.vue -->
<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { useToast } from '@/composables/useToast.js'
import { fetchShifts } from '@/api/helpers/admin.js'
import { useMasterDataStore } from '@/stores/masterData'
import BatchScheduleImportModal from '@/components/shifts/BatchScheduleImportModal.vue'
import { fetchSchedules, createSchedule, deleteSchedule } from '@/api/helpers/schedule.js'
import { useEventListener, useResizeObserver, onClickOutside } from '@vueuse/core'
import BaseSelect from '@/components/ui/BaseSelect.vue'
import { useMobile } from '@/composables/useMobile.js'
import { useFloating, offset, flip, shift, autoUpdate } from '@floating-ui/vue'

const { isMobile } = useMobile()
const masterData = useMasterDataStore()

// State
const users = ref([])
const shifts = ref([])
const schedules = ref([])
const selectedUserId = ref('')
const loading = ref(false)
const isImportModalOpen = ref(false)

const userOptions = computed(() => {
  return users.value.map(u => ({ id: u.id, label: u.nama || u.username }))
})

// Calendar State
const currentDate = ref(new Date())
const weekDays = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu']
const weekDaysShort = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab']

// Popover State
const popover = ref({
  visible: false,
  top: 0,
  left: 0,
  dateStr: '',
  dateObj: null,
  currentShiftId: null
})
const isProcessing = ref(false)

const referenceRef = ref(null)
const floatingRef = ref(null)
const { floatingStyles } = useFloating(referenceRef, floatingRef, {
  placement: 'bottom',
  middleware: [offset(5), flip(), shift({ padding: 10 })],
  whileElementsMounted: autoUpdate
})

onClickOutside(
  floatingRef,
  event => {
    // Ignore if clicking a calendar day (handled by openPopover logic)
    if (event.target.closest('.group')) return
    closePopover()
  },
  { ignore: [referenceRef] }
)

const { toast } = useToast()

// --- Computed Props for Calendar ---
const currentMonthLabel = computed(() => {
  return currentDate.value.toLocaleString('id-ID', { month: 'long', year: 'numeric' })
})

const calendarDays = computed(() => {
  const year = currentDate.value.getFullYear()
  const month = currentDate.value.getMonth()

  const firstDayOfMonth = new Date(year, month, 1)
  const lastDayOfMonth = new Date(year, month + 1, 0)

  const startOffset = firstDayOfMonth.getDay()
  const totalDays = lastDayOfMonth.getDate()

  const days = []
  for (let i = 0; i < startOffset; i++) {
    days.push({ day: '', isPadding: true })
  }

  for (let i = 1; i <= totalDays; i++) {
    const d = new Date(year, month, i)
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    const dateStr = `${y}-${m}-${day}`

    const schedule = (Array.isArray(schedules.value) ? schedules.value : []).find(s => {
      return s.date.startsWith(dateStr)
    })

    days.push({
      day: i,
      date: d,
      dateStr,
      isPadding: false,
      schedule,
      isToday: new Date().toDateString() === d.toDateString()
    })
  }

  return days
})

const loadInitialData = async () => {
  loading.value = true
  try {
    const [usersData, shiftsData] = await Promise.all([masterData.getUsers(true), fetchShifts()])
    users.value = usersData
    shifts.value = shiftsData
  } catch (e) {
    console.error(e)
  } finally {
    loading.value = false
  }
}

const loadSchedules = async () => {
  if (!selectedUserId.value) {
    schedules.value = []
    return
  }

  loading.value = true
  try {
    const year = currentDate.value.getFullYear()
    const month = currentDate.value.getMonth()
    const startDate = `${year}-${String(month + 1).padStart(2, '0')}-01`
    const lastDay = new Date(year, month + 1, 0).getDate()
    const endDate = `${year}-${String(month + 1).padStart(2, '0')}-${lastDay}`

    const data = await fetchSchedules(selectedUserId.value, startDate, endDate)
    schedules.value = Array.isArray(data) ? data : []
  } catch (e) {
    console.error(e)
  } finally {
    loading.value = false
  }
}

const changeMonth = delta => {
  currentDate.value = new Date(currentDate.value.getFullYear(), currentDate.value.getMonth() + delta, 1)
  loadSchedules()
}

const openPopover = (event, dayObj) => {
  if (dayObj.isPadding) return
  if (!selectedUserId.value) {
    toast('Pilih karyawan terlebih dahulu', 'warning')
    return
  }

  referenceRef.value = event.currentTarget

  popover.value = {
    visible: true,
    dateStr: dayObj.dateStr,
    dateObj: dayObj,
    currentShiftId: dayObj.schedule?.shift_id || null
  }
}

const closePopover = () => {
  popover.value.visible = false
}

const selectShift = async shiftId => {
  isProcessing.value = true
  try {
    await createSchedule({
      userId: selectedUserId.value,
      shiftId: shiftId,
      date: popover.value.dateStr
    })
    closePopover()
    await loadSchedules() // Reload to reflect changes
    toast('Jadwal diperbarui', 'success')
  } catch (e) {
    console.error(e)
  } finally {
    isProcessing.value = false
  }
}

const clearSchedule = async () => {
  if (!popover.value.currentShiftId) return

  isProcessing.value = true
  try {
    await deleteSchedule(selectedUserId.value, popover.value.dateStr)
    closePopover()
    await loadSchedules()
    toast('Jadwal dikembalikan ke default', 'success')
  } catch (e) {
    console.error(e)
  } finally {
    isProcessing.value = false
  }
}

// Watchers
watch(selectedUserId, () => {
  loadSchedules()
  closePopover()
})

watch(currentDate, () => {
  closePopover()
})

onMounted(loadInitialData)
// Auto-close popover when scrolling or resizing to prevent detached floating elements
useEventListener(document, 'scroll', closePopover, true)
useResizeObserver(document.body, () => {
  if (popover.value.visible) closePopover()
})
</script>

<template>
  <!-- Overlay for Popover (Optional since onClickOutside is used, but keeping it for manual transparent backdrop if needed) -->
  <div v-if="popover.visible" class="fixed inset-0 z-40 bg-transparent" @click="closePopover"></div>

  <!-- Popover -->
  <div
    v-if="popover.visible"
    ref="floatingRef"
    :style="floatingStyles"
    class="fixed z-50 w-64 bg-background shadow-xl rounded-xl border border-secondary flex flex-col overflow-hidden animate-fade-in-up origin-top"
  >
    <div
      class="px-3 py-2 bg-secondary/20 border-b border-primary/10 text-xs font-bold text-text/70 flex justify-between items-center"
    >
      <span>{{
        new Date(popover.dateStr).toLocaleDateString('id-ID', {
          weekday: 'short',
          day: 'numeric',
          month: 'short'
        })
      }}</span>
      <button @click="closePopover" class="text-text hover:text-danger">&times;</button>
    </div>

    <div class="p-1 max-h-60 overflow-y-auto custom-scrollbar space-y-0.5">
      <button
        v-for="s in shifts"
        :key="s.id"
        @click="selectShift(s.id)"
        class="w-full text-left px-3 py-2 rounded-md text-sm transition-colors flex justify-between items-center group"
        :class="
          popover.currentShiftId === s.id ? 'bg-primary/10 text-primary font-bold' : 'text-text hover:bg-primary/20'
        "
      >
        <div>
          <div class="truncate">{{ s.name }}</div>
          <div class="text-[10px] opacity-70">{{ s.start_time.slice(0, 5) }} - {{ s.end_time.slice(0, 5) }}</div>
        </div>
        <font-awesome-icon v-if="popover.currentShiftId === s.id" icon="fa-solid fa-check" class="text-xs" />
      </button>
    </div>

    <div v-if="popover.currentShiftId" class="border-t border-secondary/20 p-1">
      <button
        @click="clearSchedule"
        class="w-full text-left px-3 py-2 rounded-md text-xs text-danger hover:bg-danger/10 transition-colors flex items-center gap-2"
      >
        <font-awesome-icon icon="fa-solid fa-trash" />
        <span>Hapus / Reset Default</span>
      </button>
    </div>
  </div>

  <!-- Header -->
  <div class="flex gap-3 flex-row items-center justify-end">
    <button
      @click="isImportModalOpen = true"
      class="px-3 h-[40px] bg-success/5 text-success border border-success/20 rounded-lg text-sm font-bold hover:bg-success hover:text-background transition-all flex items-center gap-2"
    >
      <font-awesome-icon icon="fa-solid fa-file-excel" /> Import Excel
    </button>

    <BaseSelect
      v-model="selectedUserId"
      :options="userOptions"
      track-by="id"
      emit-value
      placeholder="Pilih Karyawan..."
      class="w-full md:w-[250px]"
    />
  </div>
  <!-- Calendar Controls -->
  <div
    v-if="selectedUserId"
    class="bg-background border border-secondary/20 rounded-xl overflow-hidden shadow-sm selection-none"
  >
    <!-- Month Nav -->
    <div class="p-4 flex justify-between items-center bg-secondary/5 border-b border-secondary/10">
      <button @click="changeMonth(-1)" class="p-2 hover:bg-secondary/10 rounded-full transition-colors">
        <font-awesome-icon icon="fa-solid fa-chevron-left" />
      </button>
      <h3 class="text-lg font-bold text-text">{{ currentMonthLabel }}</h3>
      <button @click="changeMonth(1)" class="p-2 hover:bg-secondary/10 rounded-full transition-colors">
        <font-awesome-icon icon="fa-solid fa-chevron-right" />
      </button>
    </div>

    <!-- Grid Header -->
    <div class="grid grid-cols-7 border-b border-secondary/10 bg-secondary/5">
      <div
        v-for="d in isMobile ? weekDaysShort : weekDays"
        :key="d"
        class="py-2 text-center text-xs font-semibold text-text/60 uppercase tracking-wide"
      >
        {{ d }}
      </div>
    </div>

    <!-- Days Grid -->
    <div class="grid grid-cols-7 auto-rows-fr">
      <div
        v-for="(day, idx) in calendarDays"
        :key="idx"
        class="border-b border-r border-secondary/10 p-1 md:p-2 relative transition-colors group select-none"
        :class="[
          {
            'bg-secondary/5': day.isPadding,
            'hover:bg-primary/5 cursor-pointer active:bg-primary/10': !day.isPadding,
            'bg-primary/5': day.isToday && !day.isPadding,
            'ring-2 ring-inset ring-primary/40': popover.visible && popover.dateStr === day.dateStr
          },
          isMobile ? 'min-h-[70px]' : 'min-h-[100px]'
        ]"
        @click="openPopover($event, day)"
      >
        <div v-if="!day.isPadding">
          <span class="text-sm font-medium text-text/80 block mb-1" :class="{ 'text-primary font-bold': day.isToday }">
            {{ day.day }}
          </span>

          <!-- Shift Badge -->
          <div
            v-if="day.schedule"
            class="bg-primary/10 border border-primary/20 text-primary text-xs rounded p-1.5 break-words shadow-sm"
          >
            <div class="font-bold truncate" :class="isMobile ? 'text-[9px]' : ''">
              {{ day.schedule.shift_name }}
            </div>
            <div class="mt-0.5" :class="isMobile ? 'text-[8px]' : 'text-[10px]'">
              {{ day.schedule.start_time.slice(0, 5) }} - {{ day.schedule.end_time.slice(0, 5) }}
            </div>
          </div>

          <!-- Add Indicator (Hover only, if no schedule) -->
          <div
            v-else
            class="absolute inset-0 flex items-center justify-center text-primary/30 pointer-events-none"
            :class="isMobile ? 'opacity-50' : 'opacity-0 group-hover:opacity-100'"
          >
            <font-awesome-icon icon="fa-solid fa-plus" class="text-2xl" />
          </div>
        </div>
      </div>
    </div>
  </div>

  <div v-else class="text-center py-20 bg-secondary/5 rounded-xl border border-dashed border-secondary/30">
    <font-awesome-icon icon="fa-solid fa-user-clock" class="text-4xl text-text/20 mb-3" />
    <p class="text-text/60">Silakan pilih karyawan untuk melihat dan mengatur jadwal shift.</p>
  </div>
  <!-- Popover -->
  <!-- (Existing Popover Code) -->

  <BatchScheduleImportModal :isOpen="isImportModalOpen" @close="isImportModalOpen = false" @success="loadSchedules" />
</template>

<style scoped>
/* Simple Fade In Up Animation for Popover */
@keyframes fadeInUp {
  from {
    opacity: 0;
    transform: translateY(5px);
  }

  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.animate-fade-in-up {
  animation: fadeInUp 0.2s ease-out forwards;
}

.selection-none {
  user-select: none;
}
</style>

