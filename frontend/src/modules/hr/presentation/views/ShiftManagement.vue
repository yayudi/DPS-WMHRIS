<script setup lang="ts">
import { swalConfirm } from '@/core/presentation/composables/useSweetAlert'
import { onMounted, watch, ref } from 'vue'
import { useMagicKeys } from '@vueuse/core'
import { useToast } from '@/core/presentation/composables/useToast'
import { useShift } from '@/modules/hr/application/useShift'
import ShiftFormModal from '@/modules/hr/presentation/components/shifts/ShiftFormModal.vue'
import { useI18n } from '@/core/presentation/composables/useI18n'

const { t } = useI18n()
const { shifts, isLoading: loading, fetchShifts, deleteShift: removeShift } = useShift()
const isModalOpen = ref(false)
const selectedShift = ref<any>(null)

const { toast } = useToast()

const getShifts = async () => {
  await fetchShifts()
}

const openCreate = () => {
  selectedShift.value = null
  isModalOpen.value = true
}

const openEdit = (shift: any) => {
  selectedShift.value = shift
  isModalOpen.value = true
}

const deleteShiftHandler = async (id: number | string) => {
  if (!(await swalConfirm(t('hris.shift.confirm_delete')))) return

  try {
    const res = await removeShift(id)
    toast(res?.message || t('common.status.success'), 'success')
    getShifts()
  } catch (e) {
    console.error(e)
  }
}

const getWorkDaysLabel = (daysStr: string) => {
  if (!daysStr) return '-'
  const days = daysStr.split(',')
  if (days.length === 5 && !days.includes('6') && !days.includes('7')) return t('hris.shift.mon_fri')
  if (days.length === 6 && !days.includes('7')) return t('hris.shift.mon_sat')
  return t('hris.shift.work_days_count', { count: days.length })
}

onMounted(getShifts)

// --- LOCAL HOTKEYS ---
const { Alt_N } = useMagicKeys()

watch(Alt_N, pressed => {
  if (pressed && !isModalOpen.value) {
    openCreate()
  }
})
</script>

<template>
  <button
    @click="openCreate"
    class="bg-primary mb-8 text-secondary text-sm font-semibold px-4 py-2 rounded-lg hover:bg-primary/90 transition-colors flex items-center gap-2 w-full md:w-auto justify-center"
  >
    <font-awesome-icon icon="fa-solid fa-plus" />
    <span>{{ t('hris.shift.add_btn') }}</span>
  </button>
  <!-- Shift Cards Grid -->
  <div v-if="loading" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
    <!-- Simple Skeleton -->
    <div v-for="n in 3" :key="n" class="h-32 bg-secondary/10 rounded-xl animate-pulse"></div>
  </div>

  <div v-else class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
    <div
      v-for="shift in shifts"
      :key="shift.id"
      class="bg-secondary/10 border border-secondary/20 rounded-xl p-6 shadow-sm hover:shadow-md transition-shadow relative overflow-hidden group"
    >
      <!-- Default Badge -->
      <div
        v-if="shift.is_default"
        class="absolute top-0 right-0 bg-primary/10 text-primary text-xs font-bold px-3 py-1 rounded-bl-lg"
      >
        {{ t('hris.shift.badge_default') }}
      </div>

      <div class="flex items-start justify-between mb-4">
        <div>
          <h3 class="text-xl font-bold text-text">{{ shift.name }}</h3>
          <p class="text-sm text-text/60 mt-1 flex items-center gap-2">
            <font-awesome-icon icon="fa-solid fa-calendar-day" />
            {{ getWorkDaysLabel(shift.work_days) }}
          </p>
        </div>

        <div class="flex gap-2">
          <button
            @click="openEdit(shift)"
            class="p-2 text-primary hover:bg-primary/5 rounded-lg transition-colors"
            :title="t('hris.shift.edit_title')"
          >
            <font-awesome-icon icon="fa-solid fa-pen" />
          </button>
          <button
            @click="deleteShiftHandler(shift.id)"
            class="p-2 text-danger hover:bg-danger/5 rounded-lg transition-colors"
            :title="t('common.btn.delete')"
          >
            <font-awesome-icon icon="fa-solid fa-trash" />
          </button>
        </div>
      </div>

      <div class="flex items-center gap-4 bg-secondary/20 p-3 rounded-lg border border-secondary/10">
        <div class="text-center">
          <div class="text-xs text-text/60 uppercase font-semibold">{{ t('hris.shift.clock_in') }}</div>
          <div class="text-lg font-mono font-bold text-primary">
            {{ shift.start_time.slice(0, 5) }}
          </div>
        </div>
        <div class="h-8 w-px bg-secondary/20"></div>
        <div class="text-center">
          <div class="text-xs text-text/60 uppercase font-semibold">{{ t('hris.shift.clock_out') }}</div>
          <div class="text-lg font-mono font-bold text-primary">
            {{ shift.end_time.slice(0, 5) }}
          </div>
        </div>
        <div class="flex-1 text-right">
          <span
            v-if="shift.flexible_minutes > 0"
            class="text-xs font-medium text-success bg-success/10 px-2 py-1 rounded"
          >
            {{ t('hris.shift.badge_flex', { minutes: shift.flexible_minutes }) }}
          </span>
          <span v-else class="text-xs font-medium text-text/60 bg-secondary/10 px-2 py-1 rounded">
            {{ t('hris.shift.badge_fixed') }}
          </span>
        </div>
      </div>
    </div>
  </div>

  <div v-if="!loading && shifts.length === 0" class="text-center py-20 text-text/40 italic">
    {{ t('hris.shift.no_shifts') }}
  </div>

  <!-- Modal -->
  <ShiftFormModal :show="isModalOpen" :shift="selectedShift" @close="isModalOpen = false" @updated="getShifts" />
</template>

