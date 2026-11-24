<script setup lang="ts">
import { ref, onMounted, watch } from 'vue'
import { useMagicKeys } from '@vueuse/core'
import { dayjs } from '@/core/utils/time' // Can be refactored later
import DateRangeFilter from '@/core/presentation/components/ui/DateRangeFilter.vue'
import SearchInput from '@/core/presentation/components/ui/SearchInput.vue'
import BaseSkeleton from '@/core/presentation/components/ui/BaseSkeleton.vue'
import BasePagination from '@/core/presentation/components/ui/BasePagination.vue'
import TriStateSelect from '@/core/presentation/components/ui/TriStateSelect.vue'
import { useMobile } from '@/core/presentation/composables/useMobile'
import { usePagination } from '@/core/presentation/composables/usePagination'
import { useI18n } from '@/core/infrastructure/localization'
import { useLogs } from '../../application/useLogs'
import type { LogFilter } from '../../domain/log.entity'

const { isMobile } = useMobile()
const { t } = useI18n()
const { logs, total, isLoading, fetchLogs } = useLogs()

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
const actionFilter = ref<{ include: string[]; exclude: string[] }>({ include: [], exclude: [] })
const targetFilter = ref<{ include: string[]; exclude: string[] }>({ include: [], exclude: [] })

const startDate = ref<string | null>(null)
const endDate = ref<string | null>(null)

const actionOptions = [
  { id: 'CREATE', label: 'CREATE' },
  { id: 'UPDATE', label: 'UPDATE' },
  { id: 'DELETE', label: 'DELETE' },
  { id: 'LOGIN', label: 'LOGIN' },
  { id: 'UPDATE_FULFILLMENT_SOURCE', label: 'UPDATE_FULFILLMENT_SOURCE' },
  { id: 'UPDATE_LOCALIZATION', label: 'UPDATE_LOCALIZATION' }
]

const targetOptions = [
  { id: 'PRODUCT', label: 'PRODUCT' },
  { id: 'USER', label: 'USER' },
  { id: 'ROLE', label: 'ROLE' },
  { id: 'LOCATION', label: 'LOCATION' },
  { id: 'CATEGORY', label: 'CATEGORY' },
  { id: 'SETTING', label: 'SETTING' },
  { id: 'SALES_CHANNEL', label: 'SALES_CHANNEL' },
  { id: 'PAPER_SIZE', label: 'PAPER_SIZE' },
  { id: 'STICKER_TEMPLATE', label: 'STICKER_TEMPLATE' },
  { id: 'localization_locales', label: 'localization_locales' }
]

const loadLogs = async () => {
  const filter: LogFilter = {
    page: page.value,
    limit: limit.value,
    search: search.value,
    action: JSON.stringify(actionFilter.value),
    targetType: JSON.stringify(targetFilter.value),
    startDate: startDate.value,
    endDate: endDate.value
  }
  await fetchLogs(filter)
}

// Helpers
const formatDate = (dateString?: string) => {
  if (!dateString) return '-'
  return dayjs(dateString).format('DD MMM YYYY HH:mm')
}

const formatChanges = (changesJson: any) => {
  if (!changesJson) return '-'
  try {
    const changes = typeof changesJson === 'string' ? JSON.parse(changesJson) : changesJson
    return changes
  } catch {
    return changesJson
  }
}

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
      loadLogs()
    }
  },
  { deep: true }
)

watch([page, limit], () => {
  loadLogs()
})

onMounted(() => {
  loadLogs()
})

const { Slash } = useMagicKeys()
watch(Slash, pressed => {
  if (pressed) {
    setTimeout(() => {
      const el = document.getElementById('global-search-input')
      if (el) el.focus()
    }, 10)
  }
})
</script>

<template>
  <div class="px-6">
    <div class="flex flex-col sm:flex-row sm:flex-wrap xl:flex-nowrap sm:items-center justify-between gap-3 w-full mb-4">
      <div class="flex flex-col sm:flex-row sm:flex-wrap xl:flex-nowrap sm:items-center gap-3 w-full sm:w-auto sm:flex-1 min-w-0">
        <div class="w-full sm:flex-1 sm:min-w-[180px] sm:max-w-xs min-w-0">
          <SearchInput
            v-model="search"
            input-id="global-search-input"
            :placeholder="t('settings.log.search_placeholder')"
          />
        </div>

        <div class="flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-3 w-full sm:w-auto shrink-0">
          <DateRangeFilter
            v-model:startDate="startDate"
            v-model:endDate="endDate"
            class="w-full sm:w-auto shrink-0"
          />

          <div class="w-full sm:w-auto sm:max-w-[190px] shrink-0">
            <TriStateSelect
              v-model="actionFilter"
              :options="actionOptions"
              label="label"
              track-by="id"
              :placeholder="t('settings.log.all_actions')"
              :label-prefix="t('common.label.action')"
              :searchable="true"
            />
          </div>

          <div class="w-full sm:w-auto sm:max-w-[190px] shrink-0">
            <TriStateSelect
              v-model="targetFilter"
              :options="targetOptions"
              label="label"
              track-by="id"
              :placeholder="t('settings.log.all_types')"
              :label-prefix="t('settings.log.col_target')"
              :searchable="true"
            />
          </div>
        </div>
      </div>

      <button
        @click="loadLogs"
        class="bg-primary/10 text-primary text-sm font-semibold px-4 h-[42px] rounded-lg hover:bg-primary/20 transition-colors flex items-center justify-center gap-2 shrink-0 whitespace-nowrap sm:ml-auto"
      >
        <font-awesome-icon icon="fa-solid fa-rotate-right" :spin="isLoading" />
        <span>{{ t('common.btn.refresh') }}</span>
      </button>
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
                {{ t('settings.log.col_time') }}
              </th>
              <th class="px-6 py-3 border-b border-secondary/10 w-[200px]">{{ t('common.label.user') }}</th>
              <th class="px-6 py-3 border-b border-secondary/10 w-[120px]">{{ t('common.label.action') }}</th>
              <th class="px-6 py-3 border-b border-secondary/10 w-[180px]">{{ t('settings.log.col_target') }}</th>
              <th class="px-6 py-3 border-b border-secondary/10">{{ t('settings.log.col_changes') }}</th>
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
              <td colspan="5" class="py-12 text-center text-text/50 italic">{{ t('settings.log.no_logs') }}</td>
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
                <span v-if="isMobile" class="text-text/60 text-xs uppercase font-semibold">{{ t('settings.log.col_time') }}</span>
                <div class="flex flex-col" :class="isMobile ? 'items-end' : ''">
                  <span class="font-bold text-sm text-text">{{ formatDate(log.created_at) }}</span>
                  <span class="text-[10px] text-text/40">{{ log.ip_address || '-' }}</span>
                </div>
              </td>
              <td
                :class="isMobile ? 'flex justify-between items-center py-2 border-b border-secondary/10' : 'px-6 py-4'"
              >
                <span v-if="isMobile" class="text-text/60 text-xs uppercase font-semibold">{{ t('common.label.user') }}</span>
                <div class="flex flex-col" :class="isMobile ? 'items-end' : ''">
                  <span class="font-bold text-sm">{{ log.nickname || log.username || 'System' }}</span>
                  <span class="text-xs text-text/50">{{ log.role || 'N/A' }}</span>
                </div>
              </td>
              <td
                :class="isMobile ? 'flex justify-between items-center py-2 border-b border-secondary/10' : 'px-6 py-4'"
              >
                <span v-if="isMobile" class="text-text/60 text-xs uppercase font-semibold">{{ t('common.label.action') }}</span>
                <span
                  class="px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wide border"
                  :class="{
                    'bg-success/10 text-success border-success/20': log.action === 'CREATE',
                    'bg-warning/10 text-warning border-warning/20': log.action === 'UPDATE',
                    'bg-danger/10 text-danger border-danger/20': log.action === 'DELETE',
                    'bg-accent/10 text-accent border-accent/20': log.action === 'LOGIN',
                    'bg-secondary/15 text-text/80 border-secondary/30': !['CREATE', 'UPDATE', 'DELETE', 'LOGIN'].includes(log.action)
                  }"
                >
                  {{ log.action }}
                </span>
              </td>
              <td
                :class="isMobile ? 'flex justify-between items-center py-2 border-b border-secondary/10' : 'px-6 py-4'"
              >
                <span v-if="isMobile" class="text-text/60 text-xs uppercase font-semibold">{{ t('settings.log.col_target') }}</span>
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
                  >{{ t('settings.log.col_changes') }}</span
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
                      :title="String(key)"
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
                <span v-else class="text-text/30 italic text-xs">{{ t('settings.log.no_details') }}</span>
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
