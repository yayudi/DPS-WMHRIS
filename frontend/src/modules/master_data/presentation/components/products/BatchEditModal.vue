<script setup lang="ts">
import { ref, watch, computed } from 'vue'

import BaseModal from '@/core/presentation/components/ui/BaseModal.vue'
import BaseTabs from '@/core/presentation/components/ui/BaseTabs.vue'
import ImportJobHistory from '@/core/presentation/components/shared/ImportJobHistory.vue'
import JobHistoryTable, { type JobItem } from '@/core/presentation/components/ui/JobHistoryTable.vue'
import TriStateSelect from '@/core/presentation/components/ui/TriStateSelect.vue'
import { useDownloadStore } from '@/core/presentation/stores/downloadStore'
import { useI18n } from '@/core/presentation/composables/useI18n'

const downloadStore = useDownloadStore()
const { t } = useI18n()

const props = withDefaults(
  defineProps<{
    isOpen: boolean
    isExporting?: boolean
    isImporting?: boolean
    entityType?: 'product' | 'package'
    title?: string
    exportJobType?: string
    importJobType?: string
    showColumnsSelector?: boolean
  }>(),
  {
    isExporting: false,
    isImporting: false,
    entityType: 'product'
  }
)

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'export', payload: any): void
  (e: 'import', payload: FormData): void
}>()

// Dynamic Titles & Job Types
const modalTitle = computed(
  () => props.title || (props.entityType === 'package' ? t('master_data.batch_edit.modal_title_package') : t('master_data.batch_edit.modal_title_product'))
)

const effectiveExportJobType = computed(
  () => props.exportJobType || (props.entityType === 'package' ? 'EXPORT_PACKAGES' : 'PRODUCT_MASTER')
)

const effectiveImportJobTypes = computed(() => {
  if (props.importJobType) return [props.importJobType]
  return props.entityType === 'package'
    ? ['IMPORT_PACKAGES', 'IMPORT_PACKAGES_DRY_RUN']
    : ['BATCH_EDIT_PRODUCT', 'BATCH_EDIT_PRODUCT_DRY_RUN']
})

const shouldShowColumns = computed(() =>
  props.showColumnsSelector !== undefined ? props.showColumnsSelector : props.entityType !== 'package'
)

// Tabs
const activeTab = ref('export')
const tabOptions = computed(() => [
  { value: 'export', label: t('master_data.batch_edit.tab_download'), icon: 'fa-solid fa-download' },
  { value: 'import', label: t('master_data.batch_edit.tab_upload'), icon: 'fa-solid fa-upload' },
  { value: 'logs', label: t('master_data.batch_edit.tab_history'), icon: 'fa-solid fa-history' }
])

const exportFormat = ref('xlsx')
const includeImages = ref(false)
const fileInput = ref<HTMLInputElement | null>(null)
const selectedFile = ref<File | null>(null)
const isDryRun = ref(false)
const importNotes = ref('')

// --- Export Columns Logic ---
const availableColumns = computed(() => [
  { key: 'name', label: t('common.label.product_name') },
  { key: 'category_id', label: t('common.label.category') },
  { key: 'price', label: t('master_data.batch_edit.col_price') },
  { key: 'is_package', label: t('master_data.batch_edit.col_package_type') },
  { key: 'weight', label: t('master_data.batch_edit.col_weight') },
  { key: 'length', label: t('master_data.batch_edit.col_length') },
  { key: 'width', label: t('master_data.batch_edit.col_width') },
  { key: 'height', label: t('master_data.batch_edit.col_height') },
  { key: 'is_active', label: t('master_data.batch_edit.col_status') }
])

const selectedColumnsState = ref({
  include: ['name', 'category_id', 'price', 'is_package', 'weight', 'length', 'width', 'height', 'is_active'],
  exclude: [] as string[]
})

// --- Export Jobs Logic ---
const exportJobs = computed<JobItem[]>(() => {
  return (downloadStore.jobs as JobItem[])
    .filter(job => (job.job_type || job.type) === effectiveExportJobType.value)
    .slice(0, 5)
})
const loadingExports = ref(false)

watch(
  () => props.isOpen,
  newVal => {
    if (newVal) {
      const showLoading = downloadStore.jobs.length === 0
      if (showLoading) loadingExports.value = true
      downloadStore.fetchJobs().finally(() => {
        if (showLoading) loadingExports.value = false
      })
    }
  }
)

// Actions
const handleExport = () => {
  if (props.entityType === 'package') {
    emit('export', { format: exportFormat.value })
  } else {
    const finalColumns = ['sku', ...selectedColumnsState.value.include]
    emit('export', {
      format: exportFormat.value,
      includeImages: includeImages.value,
      columns: finalColumns
    })
  }
}

const handleFileSelect = (event: Event) => {
  const target = event.target as HTMLInputElement
  const file = target.files?.[0]
  if (file) selectedFile.value = file
}

const handleDrop = (event: DragEvent) => {
  const file = event.dataTransfer?.files?.[0]
  if (file) selectedFile.value = file
}

const handleImport = () => {
  if (!selectedFile.value) return
  const formData = new FormData()
  formData.append('file', selectedFile.value)
  formData.append('dryRun', String(isDryRun.value))
  if (importNotes.value.trim()) {
    formData.append('notes', importNotes.value.trim())
  }
  emit('import', formData)

  // Clear file input to prevent double upload
  selectedFile.value = null
  importNotes.value = ''
  if (fileInput.value) fileInput.value.value = ''
}

const close = () => {
  emit('close')
  selectedFile.value = null
  importNotes.value = ''
  activeTab.value = 'export'
}
</script>

<template>
  <BaseModal :show="isOpen" @close="close" :title="modalTitle" maxWidth="max-w-4xl">
    <div class="flex flex-col h-[750px] md:h-[650px]">
      <!-- TABS -->
      <div class="mb-6 shrink-0 mt-2">
        <BaseTabs :tabs="tabOptions" v-model="activeTab" class="w-full shadow-sm" />
      </div>

      <!-- MAIN CONTENT AREA -->
      <div class="flex-1 overflow-hidden flex flex-col">
        <!-- STEP 1: EXPORT -->
        <div v-if="activeTab === 'export'" class="flex-1 flex flex-col h-full overflow-hidden">
          <p class="text-sm text-text/70 mb-4 shrink-0 font-medium">
            {{ t('master_data.batch_edit.export_hint') }}
          </p>

          <div class="grid grid-cols-2 gap-4 mb-6 shrink-0">
            <label
              class="flex items-center gap-4 p-4 border-2 rounded-2xl cursor-pointer transition-all hover:bg-success/5 hover:border-success/50"
              :class="
                exportFormat === 'xlsx' ? 'border-success bg-success/5 shadow-sm' : 'border-secondary/20 bg-background'
              "
            >
              <input type="radio" v-model="exportFormat" value="xlsx" class="hidden" />
              <div class="w-12 h-12 rounded-full bg-success/10 flex items-center justify-center shrink-0">
                <font-awesome-icon icon="fa-solid fa-file-excel" class="text-2xl text-success" />
              </div>
              <div>
                <div class="font-bold text-text text-sm">Excel (.xlsx)</div>
                <div class="text-[11px] text-text/50 font-medium mt-0.5">{{ t('master_data.batch_edit.excel_recommended') }}</div>
              </div>
            </label>

            <label
              class="flex items-center gap-4 p-4 border-2 rounded-2xl cursor-pointer transition-all hover:bg-primary/5 hover:border-primary/50"
              :class="
                exportFormat === 'csv' ? 'border-primary bg-primary/5 shadow-sm' : 'border-secondary/20 bg-background'
              "
            >
              <input type="radio" v-model="exportFormat" value="csv" class="hidden" />
              <div class="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                <font-awesome-icon icon="fa-solid fa-file-csv" class="text-2xl text-primary" />
              </div>
              <div>
                <div class="font-bold text-text text-sm">CSV (.csv)</div>
                <div class="text-[11px] text-text/50 font-medium mt-0.5">{{ t('master_data.batch_edit.csv_universal') }}</div>
              </div>
            </label>
          </div>

          <div
            v-if="shouldShowColumns"
            class="mb-4 flex items-center justify-between p-4 bg-primary/5 rounded-xl border border-primary/20 shrink-0"
          >
            <div>
              <div class="font-semibold text-text text-sm">{{ t('master_data.batch_edit.include_images_title') }}</div>
              <div class="text-[12px] text-text/60 font-medium">
                {{ t('master_data.batch_edit.include_images_desc') }}
              </div>
            </div>
            <label class="relative inline-flex items-center cursor-pointer shrink-0">
              <input type="checkbox" v-model="includeImages" class="sr-only peer" />
              <div
                class="w-11 h-6 bg-secondary peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-secondary after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-primary after:border-primary after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary peer-checked:after:bg-secondary"
              ></div>
            </label>
          </div>

          <!-- COLUMN SELECTION -->
          <div v-if="shouldShowColumns" class="mb-6 shrink-0 bg-background border border-secondary/20 rounded-xl p-4">
            <h6 class="font-bold text-sm text-text mb-2 flex items-center gap-2">
              {{ t('master_data.batch_edit.exported_columns') }}
              <span class="text-[11px] font-normal text-text/50 bg-secondary/10 px-2 py-0.5 rounded"
                >{{ t('master_data.batch_edit.sku_default_note') }}</span
              >
            </h6>
            <TriStateSelect
              v-model="selectedColumnsState"
              :options="availableColumns"
              label="label"
              trackBy="key"
              :placeholder="t('master_data.batch_edit.select_columns_placeholder')"
              :searchable="false"
            />
          </div>

          <!-- LIST EXPORT JOBS -->
          <div
            class="flex-1 overflow-y-auto custom-scrollbar mb-6 scrollbar-thin border-2 border-secondary/10 rounded-2xl p-4 bg-secondary/5 flex flex-col"
          >
            <h5 class="font-bold text-sm mb-4 text-text flex items-center gap-2 shrink-0">
              <font-awesome-icon icon="fa-solid fa-clock-rotate-left" class="text-primary" />
              {{ t('master_data.batch_edit.export_history_title') }}
            </h5>

            <JobHistoryTable
              :jobs="exportJobs"
              :loading="loadingExports"
              :empty-text="t('master_data.batch_edit.export_history_empty')"
              layout="list"
            />
          </div>

          <div class="mt-auto shrink-0">
            <button
              @click="handleExport"
              :disabled="isExporting"
              class="w-full px-5 py-4 bg-primary text-secondary rounded-2xl font-bold hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-primary/20 transition-all flex justify-center items-center gap-2 text-[15px]"
            >
              <font-awesome-icon v-if="isExporting" icon="fa-solid fa-spinner" spin />
              <font-awesome-icon v-else icon="fa-solid fa-file-export" />
              <span>{{ isExporting ? t('master_data.batch_edit.btn_processing') : t('master_data.batch_edit.btn_new_export') }}</span>
            </button>
            <p class="text-xs text-center mt-3.5 text-text/50 font-medium">
              {{ t('master_data.batch_edit.export_bg_note') }}
            </p>
          </div>
        </div>

        <!-- STEP 2: IMPORT -->
        <div v-if="activeTab === 'import'" class="flex-1 flex flex-col h-full overflow-hidden">
          <p class="text-sm text-text/70 mb-4 shrink-0 font-medium">
            {{ t('master_data.batch_edit.import_hint', { entity: entityType === 'package' ? 'paket' : 'produk' }) }}
          </p>

          <div
            class="flex-1 border-2 border-dashed border-secondary/40 rounded-3xl flex flex-col items-center justify-center py-4 px-8 text-center cursor-pointer hover:border-primary/50 hover:bg-primary/5 transition-all group relative mb-6"
            @click="fileInput?.click()"
            @dragover.prevent
            @drop.prevent="handleDrop"
          >
            <input type="file" ref="fileInput" class="hidden" accept=".xlsx, .csv" @change="handleFileSelect" />

            <div
              class="w-16 h-16 rounded-2xl bg-secondary/10 flex items-center justify-center mb-3 group-hover:scale-110 group-hover:bg-primary/10 transition-all text-text/40 group-hover:text-primary"
            >
              <font-awesome-icon icon="fa-solid fa-cloud-arrow-up" class="text-2xl" />
            </div>

            <h4 class="font-bold text-base text-text mb-1">
              {{ selectedFile ? selectedFile.name : t('master_data.batch_edit.drop_or_select') }}
            </h4>
            <p class="text-xs text-text/50 max-w-sm mb-3">
              {{ t('master_data.batch_edit.drop_format_note') }}
            </p>

            <div
              v-if="selectedFile"
              class="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-success/10 text-success text-xs font-semibold"
            >
              <font-awesome-icon icon="fa-solid fa-check" />
              <span>{{ t('master_data.batch_edit.file_selected', { size: (selectedFile.size / 1024).toFixed(1) }) }}</span>
            </div>
          </div>

          <!-- Notes -->
          <div class="mb-4 shrink-0">
            <label class="block text-xs font-bold text-text mb-1.5">
              {{ t('master_data.batch_edit.import_notes_label') }} <span class="text-text/40 font-normal">({{ t('common.label.optional') }})</span>
            </label>
            <input
              type="text"
              v-model="importNotes"
              :placeholder="t('master_data.batch_edit.import_notes_placeholder')"
              class="w-full px-3 py-2 text-xs border border-secondary/20 rounded-xl bg-background text-text focus:outline-none focus:border-primary transition-colors"
            />
          </div>

          <div
            class="mb-6 flex items-center justify-between p-4 bg-secondary/5 rounded-2xl border border-secondary/20 shrink-0"
          >
            <div>
              <div class="font-bold text-text text-sm">{{ t('master_data.batch_edit.dry_run_title') }}</div>
              <div class="text-xs text-text/50 mt-0.5">
                {{ t('master_data.batch_edit.dry_run_desc') }}
              </div>
            </div>
            <label class="relative inline-flex items-center cursor-pointer">
              <input type="checkbox" v-model="isDryRun" class="sr-only peer" />
              <div
                class="w-11 h-6 bg-secondary peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-secondary after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-primary after:border-primary after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary peer-checked:after:bg-secondary"
              ></div>
            </label>
          </div>

          <div class="mt-auto shrink-0">
            <button
              @click="handleImport"
              :disabled="!selectedFile || isImporting"
              class="w-full px-5 py-4 bg-primary text-secondary rounded-2xl font-bold hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-primary/20 transition-all flex justify-center items-center gap-2 text-[15px]"
            >
              <font-awesome-icon v-if="isImporting" icon="fa-solid fa-spinner" spin />
              <font-awesome-icon v-else icon="fa-solid fa-cloud-arrow-up" />
              <span>{{ isImporting ? t('master_data.batch_edit.btn_uploading') : t('master_data.batch_edit.btn_start_import') }}</span>
            </button>
            <p class="text-xs text-center mt-3.5 text-text/50 font-medium">
              {{ t('master_data.batch_edit.import_bg_note') }}
            </p>
          </div>
        </div>

        <!-- STEP 3: LOGS -->
        <div v-if="activeTab === 'logs'" class="flex-1 flex flex-col h-full overflow-hidden">
          <ImportJobHistory :job-types="effectiveImportJobTypes" />
        </div>
      </div>
    </div>
  </BaseModal>
</template>
