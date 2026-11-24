<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useMagicKeys } from '@vueuse/core'
import { localizationApi } from '@/core/infrastructure/localization.api'
import { useLocaleStore } from '@/core/presentation/stores/localeStore'
import { useToast } from '@/core/presentation/composables/useToast'
import { useI18n } from '@/core/presentation/composables/useI18n'
import { usePagination } from '@/core/presentation/composables/usePagination'
import SearchInput from '@/core/presentation/components/ui/SearchInput.vue'
import TriStateSelect from '@/core/presentation/components/ui/TriStateSelect.vue'
import BaseSelect from '@/core/presentation/components/ui/BaseSelect.vue'
import BasePagination from '@/core/presentation/components/ui/BasePagination.vue'
import type {
  TranslationMatrixResponse,
  TranslationMatrixRow
} from '@/core/domain/localization.types'

const { t } = useI18n()
const { toast } = useToast()
const localeStore = useLocaleStore()

const isLoading = ref<boolean>(false)
const isSaving = ref<boolean>(false)
const matrixData = ref<TranslationMatrixResponse | null>(null)

// Filters
const searchQuery = ref<string>('')
const searchBy = ref<'all' | 'key' | 'text'>('all')
const selectedModules = ref<{ include: string[]; exclude: string[] }>({ include: [], exclude: [] })
const statusFilter = ref<'all' | 'incomplete' | 'complete' | 'dirty'>('all')

const searchByOptions = computed(() => [
  { value: 'all', label: t('common.filter.all') },
  { value: 'key', label: t('localization.search_by_key') },
  { value: 'text', label: t('common.label.text') }
])

const moduleOptions = computed(() => matrixData.value?.modules || [])

const statusOptions = computed(() => [
  { value: 'all', label: t('common.filter.all') },
  { value: 'incomplete', label: t('localization.incomplete') },
  { value: 'complete', label: t('localization.complete') },
  { value: 'dirty', label: t('localization.status_unsaved') }
])

// Dirty State Tracking: Record<locale_code, Record<fullKey, string>>
const dirtyEdits = ref<Record<string, Record<string, string>>>({})

// Add Key Modal State
const showAddModal = ref<boolean>(false)
const newModule = ref<string>('common')
const newKey = ref<string>('')
const newValues = ref<Record<string, string>>({
  'id-ID': '',
  'en-US': ''
})

const totalDirtyCount = computed(() => {
  let count = 0
  for (const loc in dirtyEdits.value) {
    count += Object.keys(dirtyEdits.value[loc] || {}).length
  }
  return count
})

const dirtyKeySet = computed(() => {
  const keys = new Set<string>()
  for (const loc in dirtyEdits.value) {
    for (const fullKey in dirtyEdits.value[loc]) {
      keys.add(fullKey)
    }
  }
  return keys
})

const hasActiveFilters = computed(
  () =>
    Boolean(searchQuery.value.trim()) ||
    selectedModules.value.include.length > 0 ||
    selectedModules.value.exclude.length > 0 ||
    statusFilter.value !== 'all'
)

const filteredRows = computed<TranslationMatrixRow[]>(() => {
  const rows = matrixData.value?.rows || []
  const query = searchQuery.value.trim().toLowerCase()
  const { include, exclude } = selectedModules.value
  const status = statusFilter.value
  const dirtySet = dirtyKeySet.value

  return rows.filter(row => {
    if (include.length > 0 && !include.includes(row.module)) return false
    if (exclude.length > 0 && exclude.includes(row.module)) return false

    if (status === 'incomplete' && row.is_complete) return false
    if (status === 'complete' && !row.is_complete) return false
    if (status === 'dirty' && !dirtySet.has(`${row.module}.${row.translation_key}`)) return false

    if (query) {
      if (searchBy.value === 'key') {
        const fullKey = `${row.module}.${row.translation_key}`.toLowerCase()
        const matchMod = row.module.toLowerCase().includes(query)
        const matchKey = row.translation_key.toLowerCase().includes(query)
        if (!fullKey.includes(query) && !matchMod && !matchKey) return false
      } else if (searchBy.value === 'text') {
        const matchText = Object.values(row.values || {}).some(v => (v || '').toLowerCase().includes(query))
        if (!matchText) return false
      } else {
        const fullKey = `${row.module}.${row.translation_key}`.toLowerCase()
        const matchKey =
          fullKey.includes(query) ||
          row.module.toLowerCase().includes(query) ||
          row.translation_key.toLowerCase().includes(query)
        const matchText = Object.values(row.values || {}).some(v => (v || '').toLowerCase().includes(query))
        if (!matchKey && !matchText) return false
      }
    }

    return true
  })
})

const {
  paginatedData: visibleRows,
  meta: pagination,
  changePage,
  changePageSize
} = usePagination({
  totalItems: filteredRows,
  storageKey: 'localizationPageSize',
  initialLimit: 50
})

watch(
  [searchQuery, searchBy, selectedModules, statusFilter],
  () => {
    changePage(1)
  },
  { deep: true }
)

function resetFilters(): void {
  searchQuery.value = ''
  searchBy.value = 'all'
  selectedModules.value = { include: [], exclude: [] }
  statusFilter.value = 'all'
}

async function fetchMatrix(): Promise<void> {
  isLoading.value = true
  try {
    const res = await localizationApi.getTranslationMatrix()
    if (res.data) {
      matrixData.value = res.data
    }
  } catch (err: any) {
    toast(err.message || 'Gagal memuat matriks lokalisasi', 'error')
  } finally {
    isLoading.value = false
  }
}

function getCellValue(row: TranslationMatrixRow, localeCode: string): string {
  const fullKey = `${row.module}.${row.translation_key}`
  if (dirtyEdits.value[localeCode]?.[fullKey] !== undefined) {
    return dirtyEdits.value[localeCode][fullKey]
  }
  return row.values[localeCode] || ''
}

function onCellInput(row: TranslationMatrixRow, localeCode: string, value: string): void {
  const fullKey = `${row.module}.${row.translation_key}`
  const original = row.values[localeCode] || ''

  if (!dirtyEdits.value[localeCode]) {
    dirtyEdits.value[localeCode] = {}
  }

  if (value === original) {
    delete dirtyEdits.value[localeCode][fullKey]
  } else {
    dirtyEdits.value[localeCode][fullKey] = value
  }
}

function isCellDirty(row: TranslationMatrixRow, localeCode: string): boolean {
  const fullKey = `${row.module}.${row.translation_key}`
  return dirtyEdits.value[localeCode]?.[fullKey] !== undefined
}

async function saveAllChanges(): Promise<void> {
  if (totalDirtyCount.value === 0 || isSaving.value) return

  isSaving.value = true
  try {
    const promises: Promise<any>[] = []

    for (const locCode in dirtyEdits.value) {
      const keysMap = dirtyEdits.value[locCode]
      const items: Array<{ module: string; translation_key: string; translation_value: string }> = []

      for (const fullKey in keysMap) {
        const dotIdx = fullKey.indexOf('.')
        const mod = dotIdx !== -1 ? fullKey.substring(0, dotIdx) : 'common'
        const k = dotIdx !== -1 ? fullKey.substring(dotIdx + 1) : fullKey

        items.push({
          module: mod,
          translation_key: k,
          translation_value: keysMap[fullKey]
        })
      }

      if (items.length > 0) {
        promises.push(
          localizationApi.saveTranslations({
            locale_code: locCode,
            translations: items
          })
        )
      }
    }

    await Promise.all(promises)
    toast(t('localization.saved_success') || 'Perubahan terjemahan berhasil disimpan', 'success')
    dirtyEdits.value = {}

    // Refresh matrix and update client dictionary
    await fetchMatrix()
    await localeStore.fetchDictionary(localeStore.currentLocale)
  } catch (err: any) {
    toast(err.message || 'Gagal menyimpan terjemahan', 'error')
  } finally {
    isSaving.value = false
  }
}

async function handleAddKey(): Promise<void> {
  const mod = newModule.value.trim()
  const key = newKey.value.trim()

  if (!mod || !key) {
    toast(t('localization.toast_required'), 'warning')
    return
  }

  isSaving.value = true
  try {
    const promises: Promise<any>[] = []
    for (const [locCode, val] of Object.entries(newValues.value)) {
      if (val.trim()) {
        promises.push(
          localizationApi.saveTranslations({
            locale_code: locCode,
            translations: [
              {
                module: mod,
                translation_key: key,
                translation_value: val.trim()
              }
            ]
          })
        )
      }
    }

    await Promise.all(promises)
    toast(t('localization.toast_add_success'), 'success')
    showAddModal.value = false
    newKey.value = ''
    newValues.value = { 'id-ID': '', 'en-US': '' }

    await fetchMatrix()
    await localeStore.fetchDictionary(localeStore.currentLocale)
  } catch (err: any) {
    toast(err.message || t('localization.toast_add_failed'), 'error')
  } finally {
    isSaving.value = false
  }
}

onMounted(() => {
  fetchMatrix()
})

const { Slash } = useMagicKeys()

watch(Slash, pressed => {
  if (!pressed || showAddModal.value) return
  const active = document.activeElement as HTMLElement | null
  if (
    active &&
    (active.tagName === 'INPUT' ||
      active.tagName === 'TEXTAREA' ||
      active.tagName === 'SELECT' ||
      active.isContentEditable)
  ) {
    return
  }
  setTimeout(() => {
    const el = document.getElementById('global-search-input')
    if (el) el.focus()
  }, 10)
})
</script>

<template>
  <div class="p-4 md:p-6 space-y-6">
    <!-- Header -->
    <div class="flex flex-col md:flex-row md:items-center justify-between gap-4">
      <div>
        <div class="flex items-center gap-2">
          <font-awesome-icon icon="fa-solid fa-language" class="text-2xl text-primary" />
          <h1 class="text-2xl font-bold text-text">
            {{ t('localization.title') || 'Manajemen Bahasa & Lokalisasi' }}
          </h1>
        </div>
        <p class="text-sm text-text/60 mt-1">
          {{ t('localization.subtitle') || 'Kelola kamus terjemahan sistem lintas modul dan bahasa secara terpusat.' }}
        </p>
      </div>

      <div class="flex items-center gap-3">
        <button
          @click="fetchMatrix"
          :disabled="isLoading || isSaving"
          class="px-4 py-2 text-sm font-semibold rounded-xl border border-secondary/20 hover:bg-secondary/10 text-text transition-colors flex items-center gap-2"
        >
          <font-awesome-icon icon="fa-solid fa-rotate" :class="{ 'animate-spin': isLoading }" />
          <span>{{ t('common.btn.refresh') }}</span>
        </button>

        <button
          @click="showAddModal = true"
          class="px-4 py-2 text-sm font-semibold rounded-xl bg-secondary/15 hover:bg-secondary/25 text-text transition-colors flex items-center gap-2"
        >
          <font-awesome-icon icon="fa-solid fa-plus" />
          <span>{{ t('localization.add_key') }}</span>
        </button>

        <button
          @click="saveAllChanges"
          :disabled="totalDirtyCount === 0 || isSaving"
          class="px-5 py-2 text-sm font-bold rounded-xl bg-primary text-background hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-md flex items-center gap-2"
        >
          <font-awesome-icon v-if="isSaving" icon="fa-solid fa-spinner" class="animate-spin" />
          <font-awesome-icon v-else icon="fa-solid fa-floppy-disk" />
          <span>
            {{ t('common.btn.save_changes') }}
            <span v-if="totalDirtyCount > 0" class="ml-1 px-1.5 py-0.5 text-xs rounded-full bg-background/20">
              ({{ totalDirtyCount }})
            </span>
          </span>
        </button>
      </div>
    </div>

    <!-- Statistics Cards -->
    <div v-if="matrixData?.stats" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      <div class="p-4 rounded-2xl bg-secondary/5 border border-secondary/20 flex flex-col justify-between">
        <span class="text-xs font-bold uppercase tracking-wider text-text/60">{{ t('localization.total_entries') }}</span>
        <div class="mt-2 flex items-baseline justify-between">
          <span class="text-3xl font-black text-text">{{ matrixData.total_keys }}</span>
          <span class="text-xs text-text/50 font-medium">{{ t('localization.keys_registered') }}</span>
        </div>
      </div>

      <div
        v-for="stat in matrixData.stats"
        :key="stat.locale_code"
        class="p-4 rounded-2xl bg-secondary/5 border border-secondary/20 flex flex-col justify-between"
      >
        <div class="flex items-center justify-between">
          <span class="text-xs font-bold uppercase tracking-wider text-text/60">
            {{ stat.locale_code === 'id-ID' ? 'Bahasa Indonesia (id-ID)' : 'English (en-US)' }}
          </span>
          <span
            class="px-2 py-0.5 text-[11px] font-bold rounded-full"
            :class="stat.percentage === 100 ? 'bg-success/15 text-success' : 'bg-warning/15 text-warning'"
          >
            {{ stat.percentage }}%
          </span>
        </div>
        <div class="mt-2 flex items-baseline justify-between">
          <span class="text-2xl font-bold text-text">
            {{ stat.translated_count }}
            <span class="text-xs font-normal text-text/60">/ {{ matrixData.total_keys }}</span>
          </span>
          <span v-if="stat.missing_count > 0" class="text-xs font-semibold text-warning">
            {{ stat.missing_count }} {{ t('localization.missing') }}
          </span>
          <span v-else class="text-xs font-semibold text-success">
            {{ t('localization.complete') }}
          </span>
        </div>
      </div>
    </div>

    <!-- Filter Toolbar -->
    <div class="flex flex-col sm:flex-row sm:flex-wrap xl:flex-nowrap sm:items-center justify-between gap-3 w-full">
      <div class="flex flex-col sm:flex-row sm:flex-wrap xl:flex-nowrap sm:items-center gap-3 w-full sm:w-auto sm:flex-1 min-w-0">
        <div class="w-full sm:flex-1 sm:min-w-[220px] sm:max-w-md min-w-0">
          <SearchInput
            v-model="searchQuery"
            v-model:search-by="searchBy"
            :search-by-options="searchByOptions"
            input-id="global-search-input"
            :placeholder="t('localization.search_placeholder')"
          />
        </div>

        <div class="w-full sm:w-auto sm:max-w-[200px] shrink-0">
          <TriStateSelect
            v-model="selectedModules"
            :options="moduleOptions"
            :placeholder="t('localization.all_modules')"
            :label-prefix="t('localization.module')"
            :searchable="true"
          />
        </div>

        <div class="w-full sm:w-auto sm:max-w-[210px] shrink-0">
          <BaseSelect
            v-model="statusFilter"
            :options="statusOptions"
            class="w-full h-[42px]"
            :class="[statusFilter !== 'all' ? 'ring-1 ring-primary/50 rounded-lg' : '']"
            :placeholder="t('common.label.status')"
            :label-prefix="t('common.label.status')"
            prefer-placeholder
            label="label"
            track-by="value"
            :searchable="false"
            emit-value
          />
        </div>
      </div>

      <div v-if="matrixData || hasActiveFilters" class="flex items-center justify-end gap-2 shrink-0 sm:ml-auto">
        <span
          v-if="matrixData"
          class="px-3 h-[42px] inline-flex items-center text-xs font-semibold rounded-lg bg-secondary/10 border border-secondary/20 text-text/70 whitespace-nowrap"
        >
          {{ filteredRows.length }} / {{ matrixData.total_keys }}
        </span>

        <button
          v-if="hasActiveFilters"
          type="button"
          @click="resetFilters"
          class="px-3 h-[42px] text-xs font-semibold rounded-lg border border-secondary/20 text-text/70 hover:text-text hover:bg-secondary/10 transition-colors inline-flex items-center gap-1.5 whitespace-nowrap"
        >
          <font-awesome-icon icon="fa-solid fa-rotate-left" />
          <span>{{ t('common.btn.reset') }}</span>
        </button>
      </div>
    </div>

    <!-- Matrix Table -->
    <div class="rounded-2xl border border-secondary/20 overflow-hidden bg-background shadow-sm">
      <div class="overflow-x-auto">
        <table class="w-full text-left border-collapse">
          <thead>
            <tr class="border-b border-secondary/20 bg-secondary/5 text-xs font-bold text-text/60 uppercase">
              <th class="py-3 px-4 w-32">{{ t('localization.module') }}</th>
              <th class="py-3 px-4 w-60">{{ t('localization.translation_key') }}</th>
              <th class="py-3 px-4">Bahasa Indonesia (id-ID)</th>
              <th class="py-3 px-4">English (en-US)</th>
              <th class="py-3 px-4 w-28 text-center">{{ t('common.label.status') }}</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-secondary/10 text-sm">
            <tr v-if="isLoading" class="text-center py-8">
              <td colspan="5" class="py-12 text-text/50">
                <font-awesome-icon icon="fa-solid fa-spinner" class="animate-spin text-2xl mb-2 text-primary" />
                <p>{{ t('localization.loading_dictionary') }}</p>
              </td>
            </tr>
            <tr v-else-if="!filteredRows.length" class="text-center py-8">
              <td colspan="5" class="py-12 text-text/50">
                <font-awesome-icon icon="fa-solid fa-inbox" class="text-3xl mb-2 opacity-40" />
                <p>{{ t('localization.empty_matrix') }}</p>
              </td>
            </tr>
            <tr
              v-else
              v-for="row in visibleRows"
              :key="`${row.module}.${row.translation_key}`"
              class="hover:bg-secondary/5 transition-colors"
            >
              <!-- Module -->
              <td class="py-3 px-4 align-top">
                <span class="px-2 py-0.5 text-xs font-bold rounded-md bg-secondary/15 text-text/80">
                  {{ row.module }}
                </span>
              </td>

              <!-- Key -->
              <td class="py-3 px-4 align-top font-mono text-xs text-text font-semibold break-all">
                {{ row.translation_key }}
              </td>

              <!-- id-ID Input -->
              <td class="py-2 px-4 align-top">
                <input
                  :value="getCellValue(row, 'id-ID')"
                  @input="e => onCellInput(row, 'id-ID', (e.target as HTMLInputElement).value)"
                  type="text"
                  class="w-full px-3 py-1.5 text-sm rounded-lg bg-background border transition-all focus:outline-none focus:border-primary"
                  :class="isCellDirty(row, 'id-ID') ? 'border-primary ring-1 ring-primary/40 bg-primary/5' : 'border-secondary/20'"
                  placeholder="Nilai terjemahan id-ID..."
                />
              </td>

              <!-- en-US Input -->
              <td class="py-2 px-4 align-top">
                <input
                  :value="getCellValue(row, 'en-US')"
                  @input="e => onCellInput(row, 'en-US', (e.target as HTMLInputElement).value)"
                  type="text"
                  class="w-full px-3 py-1.5 text-sm rounded-lg bg-background border transition-all focus:outline-none focus:border-primary"
                  :class="[
                    isCellDirty(row, 'en-US') ? 'border-primary ring-1 ring-primary/40 bg-primary/5' : 'border-secondary/20',
                    !row.values['en-US'] && !isCellDirty(row, 'en-US') ? 'bg-warning/5 border-warning/30' : ''
                  ]"
                  placeholder="[Belum diterjemahkan]"
                />
              </td>

              <!-- Status -->
              <td class="py-3 px-4 align-top text-center">
                <span
                  v-if="row.is_complete"
                  class="px-2 py-0.5 text-[11px] font-bold rounded-full bg-success/15 text-success whitespace-nowrap"
                >
                  {{ t('localization.complete') }}
                </span>
                <span
                  v-else
                  class="px-2 py-0.5 text-[11px] font-bold rounded-full bg-warning/15 text-warning whitespace-nowrap"
                >
                  {{ t('localization.incomplete') }}
                </span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <div v-if="!isLoading && filteredRows.length > 0" class="border-t border-secondary/20 px-4">
        <BasePagination
          :pagination="pagination"
          :show-limit-picker="true"
          @changePage="changePage"
          @update:limit="changePageSize"
          class="bg-transparent mb-0 pb-1"
        />
      </div>
    </div>

    <!-- Modal Tambah Key Baru -->
    <div
      v-if="showAddModal"
      class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
    >
      <div class="w-full max-w-lg bg-background rounded-2xl border border-secondary/20 shadow-2xl p-6 space-y-4">
        <div class="flex items-center justify-between pb-3 border-b border-secondary/20">
          <h2 class="text-lg font-bold text-text flex items-center gap-2">
            <font-awesome-icon icon="fa-solid fa-plus" class="text-primary" />
            <span>{{ t('localization.modal_add_title') }}</span>
          </h2>
          <button
            @click="showAddModal = false"
            class="text-text/50 hover:text-text p-1 transition-colors"
          >
            <font-awesome-icon icon="fa-solid fa-xmark" />
          </button>
        </div>

        <div class="space-y-3">
          <div>
            <label class="block text-xs font-bold text-text/70 uppercase mb-1">{{ t('localization.module') }}</label>
            <input
              v-model="newModule"
              type="text"
              :placeholder="t('localization.module_placeholder')"
              class="w-full px-3 py-2 text-sm rounded-xl bg-background border border-secondary/20 text-text focus:outline-none focus:border-primary"
            />
          </div>

          <div>
            <label class="block text-xs font-bold text-text/70 uppercase mb-1">{{ t('localization.translation_key') }}</label>
            <input
              v-model="newKey"
              type="text"
              :placeholder="t('localization.key_placeholder')"
              class="w-full px-3 py-2 text-sm font-mono rounded-xl bg-background border border-secondary/20 text-text focus:outline-none focus:border-primary"
            />
          </div>

          <div>
            <label class="block text-xs font-bold text-text/70 uppercase mb-1">{{ t('localization.val_id_label') }}</label>
            <input
              v-model="newValues['id-ID']"
              type="text"
              :placeholder="t('localization.val_id_placeholder')"
              class="w-full px-3 py-2 text-sm rounded-xl bg-background border border-secondary/20 text-text focus:outline-none focus:border-primary"
            />
          </div>

          <div>
            <label class="block text-xs font-bold text-text/70 uppercase mb-1">{{ t('localization.val_en_label') }}</label>
            <input
              v-model="newValues['en-US']"
              type="text"
              :placeholder="t('localization.val_en_placeholder')"
              class="w-full px-3 py-2 text-sm rounded-xl bg-background border border-secondary/20 text-text focus:outline-none focus:border-primary"
            />
          </div>
        </div>

        <div class="flex items-center justify-end gap-3 pt-3 border-t border-secondary/20">
          <button
            @click="showAddModal = false"
            class="px-4 py-2 text-sm font-semibold rounded-xl border border-secondary/20 text-text/70 hover:bg-secondary/10 transition-colors"
          >
            {{ t('common.btn.cancel') }}
          </button>
          <button
            @click="handleAddKey"
            :disabled="isSaving"
            class="px-5 py-2 text-sm font-bold rounded-xl bg-primary text-background hover:bg-primary/90 disabled:opacity-50 transition-colors flex items-center gap-2"
          >
            <font-awesome-icon v-if="isSaving" icon="fa-solid fa-spinner" class="animate-spin" />
            <span>{{ t('localization.btn_save_key') }}</span>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

