<!-- frontend/src/views/admin/LogsView.vue -->
<script setup>
import WmsActionHeader from '@/components/wms/shared/WmsActionHeader.vue'
import { ref, onMounted, watch } from 'vue'
import axios from '@/api/axios.js'
import { dayjs } from '@/api/helpers/time.js'
import DateRangeFilter from '@/components/ui/DateRangeFilter.vue'
import FilterToggle from '@/components/ui/FilterToggle.vue'
import BaseSkeleton from '@/components/ui/BaseSkeleton.vue'
import BasePagination from '@/components/ui/BasePagination.vue'
import TriStateSelect from '@/components/ui/TriStateSelect.vue'
import { useMobile } from '@/composables/useMobile.js'
import { usePagination } from '@/composables/usePagination.js'

const { isMobile } = useMobile()

const logs = ref([])
const total = ref(0)
const isLoading = ref(false)
const search = ref('')

const {
  currentPage: page,
  currentLimit: limit,
  meta: paginationData,
  changePage: onChangePage,
  changePageSize: onUpdateLimit
} = usePagination({
  totalItems: total,
  storageKey: 'logsPageSize',
  initialLimit: 20
})

// Filters
const actionFilter = ref({ include: [], exclude: [] })
const targetFilter = ref({ include: [], exclude: [] })

const startDate = ref(null)
const endDate = ref(null)
const showFilters = ref(false)

const actionOptions = [
  { id: 'CREATE', label: 'CREATE' },
  { id: 'UPDATE', label: 'UPDATE' },
  { id: 'DELETE', label: 'DELETE' },
  { id: 'LOGIN', label: 'LOGIN' }
]

const targetOptions = [
  { id: 'PRODUCT', label: 'PRODUCT' },
  { id: 'USER', label: 'USER' },
  { id: 'ROLE', label: 'ROLE' },
  { id: 'LOCATION', label: 'LOCATION' },
  { id: 'SETTING', label: 'SETTING' }
]

const fetchLogs = async () => {
  isLoading.value = true
  try {
    const params = {
      page: page.value,
      limit: limit.value,
      search: search.value,
      action: JSON.stringify(actionFilter.value),
      targetType: JSON.stringify(targetFilter.value),
      startDate: startDate.value,
      endDate: endDate.value
    }

    const response = await axios.get('/logs', { params })
    logs.value = response.data.data
    total.value = response.data.total
  } catch (error) {
    console.error('Error fetching logs:', error)
  } finally {
    isLoading.value = false
  }
}

// Helpers
const formatDate = dateString => {
  if (!dateString) return '-'
  return dayjs(dateString).format('DD MMM YYYY HH:mm')
}

const formatChanges = changesJson => {
  if (!changesJson) return '-'
  try {
    const changes = typeof changesJson === 'string' ? JSON.parse(changesJson) : changesJson
    return changes
  } catch {
    return changesJson
  }
}

// Pagination handled by usePagination

// Watchers
watch(
  [
    search,
    () => actionFilter.value.include,
    () => actionFilter.value.exclude,
    () => targetFilter.value.include,
    () => targetFilter.value.exclude,
    startDate,
    endDate
  ],
  () => {
    if (page.value !== 1) {
      page.value = 1
    } else {
      fetchLogs()
    }
  },
  { deep: true }
)

watch([page, limit], () => {
  fetchLogs()
})

onMounted(() => {
  fetchLogs()
})
</script>

<template>
  <div class="px-6">
    <WmsActionHeader title="Audit Logs" icon="fa-solid fa-history">
      <template #actions>
        <FilterToggle v-model="showFilters" />
        <button
          @click="fetchLogs"
          class="bg-primary/10 text-primary px-4 py-2 rounded-lg hover:bg-primary/20 transition-colors"
        >
          <font-awesome-icon icon="fa-solid fa-rotate-right" :spin="isLoading" />
          Refresh
        </button>
      </template>
    </WmsActionHeader>

    <!-- Filters -->
    <div v-show="showFilters" class="animate-fade-in-down bg-background rounded-xl shadow-sm border border-secondary/20 p-4 mb-6 flex flex-wrap gap-4">
      <div class="flex-1 min-w-[200px]">
        <input
          v-model="search"
          placeholder="Cari ID Target..."
          class="w-full px-4 py-2 bg-background border border-secondary/30 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary outline-none text-text"
        />
      </div>

      <DateRangeFilter v-model:startDate="startDate" v-model:endDate="endDate" />

      <TriStateSelect
        v-model="actionFilter"
        :options="actionOptions"
        label="label"
        track="id"
        placeholder="Semua Aksi"
        class="min-w-[150px]"
      />
      <TriStateSelect
        v-model="targetFilter"
        :options="targetOptions"
        label="label"
        track="id"
        placeholder="Semua Tipe"
        class="min-w-[150px]"
      />
    </div>

    <!-- Table & Pagination Card -->
    <div class="bg-background shadow-md rounded-xl border border-secondary/20 flex flex-col h-[calc(100vh-100px)]">
      <!-- Scrollable Table -->
      <div class="overflow-x-auto overflow-y-auto custom-scrollbar flex-1 relative rounded-t-xl">
        <table class="w-full text-sm text-left text-text border-collapse" :class="isMobile ? 'block' : ''">
          <thead
            class="bg-background/95 backdrop-blur-md shadow-sm ring-1 ring-secondary/5"
            :class="isMobile ? 'hidden' : 'sticky top-0 z-30'"
          >
            <tr class="text-xs text-text/80 uppercase">
              <th
                class="px-6 py-3 sticky left-0 z-30 bg-background/95 backdrop-blur-md border-b border-secondary/10 shadow-[4px_0_8px_-4px_rgba(0,0,0,0.05)] w-[180px]"
              >
                Waktu
              </th>
              <th class="px-6 py-3 border-b border-secondary/10 w-[200px]">User</th>
              <th class="px-6 py-3 border-b border-secondary/10 w-[120px]">Aksi</th>
              <th class="px-6 py-3 border-b border-secondary/10 w-[180px]">Target</th>
              <th class="px-6 py-3 border-b border-secondary/10">Perubahan</th>
            </tr>
          </thead>
          <tbody class="relative" :class="isMobile ? 'block' : 'divide-y divide-secondary/5'">
            <template v-if="isLoading">
              <tr v-for="n in 5" :key="`skeleton-${n}`" class="border-b border-secondary/20 animate-pulse">
                <td v-for="i in 5" :key="i" class="px-6 py-4">
                  <BaseSkeleton
                    :shape="i === 5 ? 'rect' : 'text'"
                    :className="i === 1 ? 'w-8 h-4 mx-auto' : i === 5 ? 'w-16 h-6 mx-auto rounded-md' : 'w-full h-4'"
                  />
                </td>
              </tr>
            </template>

            <tr v-else-if="logs.length === 0" key="empty">
              <td colspan="5" class="py-12 text-center text-text/50 italic">Tidak ada log aktivitas ditemukan.</td>
            </tr>

            <tr
              v-else
              v-for="log in logs"
              :key="log.id"
              class="transition-colors group relative"
              :class="
                isMobile
                  ? 'block mb-4 p-4 bg-background/50 rounded-xl border border-secondary/20 shadow-sm mx-4 mt-4'
                  : 'border-b border-secondary/20 hover:bg-secondary/5'
              "
            >
              <td
                class="whitespace-nowrap bg-background group-hover:bg-secondary/5 transition-colors"
                :class="
                  isMobile
                    ? 'flex justify-between items-center py-2 border-b border-secondary/10'
                    : 'px-6 py-4 sticky left-0 z-20 shadow-[4px_0_8px_-4px_rgba(0,0,0,0.05)]'
                "
              >
                <span v-if="isMobile" class="text-text/60 text-xs uppercase font-semibold">Waktu</span>
                <div class="flex flex-col" :class="isMobile ? 'items-end' : ''">
                  <span class="font-bold text-sm text-text">{{ formatDate(log.created_at) }}</span>
                  <span class="text-[10px] text-text/40">{{ log.ip_address || '-' }}</span>
                </div>
              </td>
              <td
                :class="isMobile ? 'flex justify-between items-center py-2 border-b border-secondary/10' : 'px-6 py-4'"
              >
                <span v-if="isMobile" class="text-text/60 text-xs uppercase font-semibold">User</span>
                <div class="flex flex-col" :class="isMobile ? 'items-end' : ''">
                  <span class="font-bold text-sm">{{ log.nickname || log.username || 'System' }}</span>
                  <span class="text-xs text-text/50">{{ log.role || 'N/A' }}</span>
                </div>
              </td>
              <td
                :class="isMobile ? 'flex justify-between items-center py-2 border-b border-secondary/10' : 'px-6 py-4'"
              >
                <span v-if="isMobile" class="text-text/60 text-xs uppercase font-semibold">Aksi</span>
                <span
                  class="px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wide border"
                  :class="{
                    'bg-success/10 text-success border-success/20': log.action === 'CREATE',
                    'bg-warning/10 text-warning border-warning/20': log.action === 'UPDATE',
                    'bg-danger/10 text-danger border-danger/20': log.action === 'DELETE',
                    'bg-accent/10 text-accent border-accent/20': log.action === 'LOGIN',
                    'bg-secondary/10 text-secondary border-secondary/20': log.action === 'OTHER'
                  }"
                >
                  {{ log.action }}
                </span>
              </td>
              <td
                :class="isMobile ? 'flex justify-between items-center py-2 border-b border-secondary/10' : 'px-6 py-4'"
              >
                <span v-if="isMobile" class="text-text/60 text-xs uppercase font-semibold">Target</span>
                <div class="flex flex-col" :class="isMobile ? 'items-end' : ''">
                  <span class="font-bold text-xs text-primary bg-primary/5 px-2 py-0.5 rounded w-fit mb-1">{{
                    log.target_type
                  }}</span>
                  <span
                    class="text-xs text-text/60 font-mono tracking-tight text-ellipsis overflow-hidden max-w-[200px]"
                  >
                    <template v-if="log.target_name">{{ log.target_name }}</template>
                    ({{ log.target_id }})
                  </span>
                </div>
              </td>
              <td class="text-sm" :class="isMobile ? 'flex flex-col gap-2 pt-4' : 'px-6 py-4'">
                <span
                  v-if="isMobile"
                  class="text-text/60 text-xs uppercase font-semibold block mb-2 border-b border-secondary/10 pb-2"
                  >Perubahan</span
                >
                <div v-if="log.changes" class="space-y-1">
                  <div
                    v-for="(val, key) in formatChanges(log.changes)"
                    :key="key"
                    class="grid gap-2 text-xs"
                    :class="isMobile ? 'grid-cols-1' : 'grid-cols-[100px_1fr]'"
                  >
                    <span
                      class="font-mono text-text/50 truncate"
                      :class="isMobile ? 'text-left font-semibold text-primary' : 'text-right'"
                      :title="key"
                      >{{ key }}:</span
                    >
                    <div v-if="val && typeof val === 'object'" class="font-mono flex items-center gap-2 flex-wrap">
                      <span
                        class="bg-danger/5 text-danger px-1.5 py-0.5 rounded decoration-auto line-through opacity-70 break-all"
                        >{{ val.old !== undefined ? val.old : 'NULL' }}</span
                      >
                      <font-awesome-icon icon="fa-solid fa-arrow-right" class="text-text/20 text-[10px]" />
                      <span class="bg-success/5 text-success px-1.5 py-0.5 rounded font-bold break-all">{{
                        val.new !== undefined ? val.new : 'NULL'
                      }}</span>
                    </div>
                    <!-- Handle if val is a primitive -->
                    <div v-else class="font-mono flex items-center gap-2 flex-wrap">
                      <span class="text-text/80 break-all">{{ val !== null && val !== undefined ? val : 'NULL' }}</span>
                    </div>
                  </div>
                </div>
                <span v-else class="text-text/30 italic text-xs">- No details -</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Pagination (Sticky Bottom) -->
      <div class="border-t border-secondary/20 flex justify-between items-center bg-background rounded-b-xl shrink-0">
        <BasePagination :pagination="paginationData" @changePage="onChangePage" @update:limit="onUpdateLimit" />
      </div>
    </div>
  </div>
</template>
