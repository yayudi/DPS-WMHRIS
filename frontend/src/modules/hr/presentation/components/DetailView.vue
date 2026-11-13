<script setup>
import { computed, ref, watch } from 'vue'
import { formatJamMenit } from '@/core/utils/time'
import BaseSkeleton from '@/core/presentation/components/ui/BaseSkeleton.vue'
import BasePagination from '@/core/presentation/components/ui/BasePagination.vue'
import AttendanceEditModal from '@/modules/hr/presentation/components/AttendanceEditModal.vue'
import { usePagination } from '@/core/presentation/composables/usePagination'
import { useI18n } from '@/core/presentation/composables/useI18n'

const { t, activeLocale } = useI18n()

const props = defineProps({
  user: { type: Object, default: null }, // For single user mode { id, nama, logs[] }
  users: { type: Array, default: null }, // For multi-user mode, array of { id, nama, logs[] }
  year: { type: Number, default: null },
  month: { type: Number, default: null },
  startDate: { type: String, default: null },
  endDate: { type: String, default: null },
  loading: { type: Boolean, default: false },
  mobileLayout: { type: String, default: 'card' }
})

const emit = defineEmits(['refresh'])

const isEditModalOpen = ref(false)
const selectedLog = ref(null) // Defined correctly now
const tableContainer = ref(null)

function formatRow(log, nama) {
  let ket = ''
  if (log.status === 1) ket = t('hris.attendance.status_not_present')
  else if (log.status === 2) ket = t('hris.attendance.status_day_off')
  else if (log.status === 4) ket = t('hris.attendance.status_sick')
  else if (log.status === 5) ket = t('hris.attendance.status_permit')

  // Fallback for Partial Data
  if (!ket && log.status === 3) ket = t('hris.attendance.status_incomplete')

  let fullDate = ''
  let displayDate = ''

  if (log.fullDate) {
    fullDate = log.fullDate
    const d = new Date(log.fullDate)
    displayDate = d.toLocaleDateString(activeLocale.value || 'id-ID', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    })
  } else if (props.year && props.month) {
    fullDate = `${props.year}-${String(props.month).padStart(2, '0')}-${String(log.tanggal).padStart(2, '0')}`
    displayDate = `${log.tanggal}/${props.month}/${props.year}`
  }

  return {
    nama,
    tanggal: log.tanggal,
    displayDate,
    fullDate,
    username: nama,

    jamMasuk: log.jamMasuk,
    jamKeluar: log.jamKeluar,
    status: log.status,
    dbStatus: log.dbStatus,
    notes: log.notes,

    jamMasukStr: formatJamMenit(log.jamMasuk),
    breakOut: log.breaks?.[0] ? formatJamMenit(log.breaks[0].start) : '-',
    breakIn: log.breaks?.[0] ? formatJamMenit(log.breaks.at(-1).end) : '-',
    jamKeluarStr: formatJamMenit(log.jamKeluar),
    late_pardon_minutes: log.late_pardon_minutes,
    ket
  }
}

function openEditModal(row) {
  selectedLog.value = row
  isEditModalOpen.value = true
}

function handleUpdateSuccess() {
  emit('refresh')
}

// Computed for ALL formatted rows
// Rename original computed to allFormattedRows, then use it to slice
const allFormattedRows = computed(() => {
  if (props.user) {
    return (props.user.logs || []).map(log => formatRow(log, props.user.nama))
  } else if (props.users) {
    return props.users.flatMap(u => (u.logs || []).map(log => formatRow(log, u.nama)))
  }
  return []
})

// Setup universal pagination
const {
  paginatedData: visibleRows,
  meta: pagination,
  changePage,
  changePageSize
} = usePagination({
  totalItems: allFormattedRows,
  storageKey: 'detailPageSize',
  initialLimit: 30
})

watch(
  () => [props.user, props.users, props.year, props.month, props.startDate, props.endDate],
  () => {
    if (tableContainer.value) tableContainer.value.scrollTop = 0
  }
)
</script>
<template>
  <div>
    <!-- Wrapper with themed border and background -->
    <div
      ref="tableContainer"
      class="bg-background rounded-xl shadow-md border border-secondary/20 overflow-x-auto overflow-y-auto relative custom-scrollbar h-[calc(75vh)] table-container"
    >
      <table class="w-full bg-background text-sm text-text border-collapse block md:table">
        <!-- Themed table header -->
        <thead
          class="hidden md:table-header-group sticky top-0 z-30 bg-background/95 backdrop-blur-md shadow-sm ring-1 ring-secondary/5"
        >
          <tr>
            <th
              class="px-6 py-3 border-b border-secondary/10 sticky left-0 z-30 bg-background/95 backdrop-blur-md shadow-[4px_0_8px_-4px_rgba(0,0,0,0.05)] w-[200px] text-left uppercase text-xs font-bold text-text"
            >
              {{ t('common.label.name') }}
            </th>
            <th class="px-6 py-3 border-b border-secondary/10 text-center uppercase text-xs font-bold text-text">
              {{ t('common.label.date') }}
            </th>
            <th class="px-6 py-3 border-b border-secondary/10 text-center uppercase text-xs font-bold text-text">
              {{ t('hris.detail.clock_in') }}
            </th>
            <th class="px-6 py-3 border-b border-secondary/10 text-center uppercase text-xs font-bold text-text">
              {{ t('hris.detail.break_start') }}
            </th>
            <th class="px-6 py-3 border-b border-secondary/10 text-center uppercase text-xs font-bold text-text">
              {{ t('hris.detail.break_end') }}
            </th>
            <th class="px-6 py-3 border-b border-secondary/10 text-center uppercase text-xs font-bold text-text">
              {{ t('hris.detail.clock_out') }}
            </th>
            <th class="px-6 py-3 border-b border-secondary/10 text-center uppercase text-xs font-bold text-text">
              {{ t('hris.detail.pardon') }}
            </th>
            <th class="px-6 py-3 border-b border-secondary/10 text-left uppercase text-xs font-bold text-text">
              {{ t('common.label.notes') }}
            </th>
          </tr>
        </thead>
        <TransitionGroup tag="tbody" name="list" class="block md:table-row-group divide-y divide-secondary/5 relative">
          <template v-if="loading">
            <tr v-for="n in 5" :key="`skeleton-${n}`" class="border-b border-secondary/20 animate-pulse">
              <td v-for="i in 5" :key="i" class="px-6 py-4">
                <BaseSkeleton
                  :shape="i === 5 ? 'rect' : 'text'"
                  :className="i === 1 ? 'w-8 h-4 mx-auto' : i === 5 ? 'w-16 h-6 mx-auto rounded-md' : 'w-full h-4'"
                />
              </td>
            </tr>
          </template>

          <tr v-else-if="!allFormattedRows.length" key="empty" class="block md:table-row">
            <td colspan="7" class="py-12 text-center text-text/50 italic block md:table-cell">
              {{ t('hris.detail.no_data_period') }}
            </td>
          </tr>

          <tr
            v-else
            v-for="(row, idx) in visibleRows"
            :key="idx"
            @click="openEditModal(row)"
            class="block md:table-row hover:bg-secondary/5 transition-colors group relative cursor-pointer mb-4 md:mb-0 bg-background/50 md:bg-transparent rounded-xl md:rounded-none shadow-sm md:shadow-none p-4 md:p-0 border border-secondary/20 md:border-none"
            :class="{ 'mx-4': mobileLayout === 'card' }"
          >
            <!-- Name: Sticky on Desktop, Static on Mobile -->
            <td
              class="flex justify-between items-center md:table-cell px-2 md:px-6 py-2 md:py-4 font-bold text-text whitespace-nowrap md:sticky md:left-0 z-20 md:bg-background md:group-hover:bg-secondary/5 transition-colors md:shadow-[4px_0_8px_-4px_rgba(0,0,0,0.05)] border-b border-secondary/10 md:border-none mb-2 md:mb-0"
            >
              <span class="text-base md:text-sm">{{ row.nama }}</span>
              <!-- Mobile Date (Merged into Header) -->
              <span class="md:hidden text-xs font-normal text-text bg-secondary/10 px-2 py-1 rounded">{{
                row.displayDate
              }}</span>
            </td>

            <!-- Date Column (Hidden on Mobile because displayed in Name row for header effect or separate) -->
            <td
              class="flex justify-between items-center px-2 md:px-6 py-1 md:py-4 text-center whitespace-nowrap md:table-cell"
            >
              <span class="md:hidden text-text text-xs uppercase font-semibold">{{ t('common.label.date') }}</span>
              <span>{{ row.displayDate }}</span>
            </td>

            <td
              class="flex justify-between items-center md:table-cell px-2 md:px-6 py-1 md:py-4 text-center font-mono text-xs md:text-sm"
            >
              <span class="md:hidden text-text text-xs uppercase font-semibold">{{
                t('hris.attendance.clock_in')
              }}</span>
              <span>{{ row.jamMasukStr }}</span>
            </td>

            <td
              class="flex justify-between items-center md:table-cell px-2 md:px-6 py-1 md:py-4 text-center font-mono text-xs md:text-sm text-text"
            >
              <span class="md:hidden text-text text-xs uppercase font-semibold">{{
                t('hris.detail.break_start_short')
              }}</span>
              <span>{{ row.breakOut }}</span>
            </td>
            <td
              class="flex justify-between items-center md:table-cell px-2 md:px-6 py-1 md:py-4 text-center font-mono text-xs md:text-sm text-text"
            >
              <span class="md:hidden text-text text-xs uppercase font-semibold">{{
                t('hris.detail.break_end_short')
              }}</span>
              <span>{{ row.breakIn }}</span>
            </td>

            <td
              class="flex justify-between items-center md:table-cell px-2 md:px-6 py-1 md:py-4 text-center font-mono text-xs md:text-sm"
            >
              <span class="md:hidden text-text text-xs uppercase font-semibold">{{
                t('hris.attendance.clock_out')
              }}</span>
              <span>{{ row.jamKeluarStr }}</span>
            </td>

            <td
              class="flex justify-between items-center md:table-cell px-2 md:px-6 py-1 md:py-4 text-center font-mono text-xs md:text-sm"
            >
              <span class="md:hidden text-text text-xs uppercase font-semibold">{{ t('hris.detail.pardon') }}</span>
              <span
                v-if="row.late_pardon_minutes >= 480"
                class="text-xs font-bold text-primary bg-primary/10 px-2 py-1 rounded whitespace-nowrap"
              >
                {{ t('hris.pardon.full_pardon') }}
              </span>
              <span
                v-else-if="row.late_pardon_minutes > 0"
                class="text-xs font-bold text-success bg-success/10 px-2 py-1 rounded whitespace-nowrap"
              >
                {{ t('hris.pardon.pardoned_minutes', { minutes: row.late_pardon_minutes }) }}
              </span>
              <span v-else class="text-text/30">-</span>
            </td>

            <td
              class="flex justify-between items-center md:table-cell px-2 md:px-6 py-1 md:py-4 border-t border-secondary/10 md:border-none mt-2 md:mt-0 pt-2 md:pt-4"
            >
              <span class="md:hidden text-text text-xs uppercase font-semibold">{{ t('common.label.status') }}</span>
              <span
                v-if="row.ket"
                class="inline-flex items-center px-2 py-1 rounded-md text-xs font-semibold"
                :class="{
                  'bg-danger/10 text-danger': row.status === 1,
                  'bg-warning/10 text-warning': row.status === 3,
                  'bg-secondary/20 text-text/70': row.status === 2,
                  'bg-accent/10 text-accent': [4, 5].includes(row.status)
                }"
              >
                {{ row.ket }}
              </span>
              <span v-else class="text-text/30 text-xs italic">-</span>
            </td>
          </tr>
        </TransitionGroup>
      </table>
    </div>

    <!-- Pagination -->
    <div v-if="!loading && allFormattedRows.length > 0" class="mt-4 rounded-xl overflow-hidden">
      <BasePagination
        :pagination="pagination"
        :show-limit-picker="true"
        @changePage="changePage"
        @update:limit="changePageSize"
        :limit-options="[30, 60, 90, 120]"
        class="bg-transparent mb-0 pb-1"
      />
    </div>

    <AttendanceEditModal
      :is-open="isEditModalOpen"
      :log-data="selectedLog"
      @close="isEditModalOpen = false"
      @update="handleUpdateSuccess"
    />
  </div>
</template>

<style scoped>
/* List Transitions */
.list-enter-active,
.list-leave-active {
  transition: all 0.3s ease;
}

.list-enter-from,
.list-leave-to {
  opacity: 0;
  transform: translateX(-10px);
}

.list-leave-active {
  transition: all 0.3s ease;
}
</style>
