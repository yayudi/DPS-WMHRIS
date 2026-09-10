<!-- frontend/src/components/shared/GlobalJobManager.vue -->
<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { useDownloadStore } from '@/stores/downloadStore.js'
import { useUploadStore } from '@/stores/uploadStore.js'
import { useFirebaseSync } from '@/composables/useFirebaseSync.js'
import { formatFileName } from '@/utils/formatters.js'
import dayjs from 'dayjs'
import { useDownload } from '@/composables/useDownload.js'

const downloadStore = useDownloadStore()
const uploadStore = useUploadStore()
const { openDownloadUrl } = useDownload()

const activeTab = ref('download') // 'download' | 'upload'

const isExpanded = computed(() => downloadStore.isExpanded || uploadStore.isExpanded)

const pendingCount = computed(() => downloadStore.pendingCount + uploadStore.pendingCount)

const toggleWidget = () => {
  if (isExpanded.value) {
    downloadStore.isExpanded = false
    uploadStore.isExpanded = false
  } else {
    if (activeTab.value === 'download') {
      downloadStore.isExpanded = true
    } else {
      uploadStore.isExpanded = true
    }
  }
}

// Auto-switch tabs if stores are expanded externally
watch(
  () => downloadStore.isExpanded,
  newVal => {
    if (newVal) activeTab.value = 'download'
  }
)
watch(
  () => uploadStore.isExpanded,
  newVal => {
    if (newVal) activeTab.value = 'upload'
  }
)

// Unified Firebase Listener
useFirebaseSync(
  ['BACKGROUND_JOBS'],
  [
    'EXPORT_COMPLETED',
    'EXPORT_FAILED',
    'EXPORT_STARTED',
    'JOB_PROGRESS',
    'IMPORT_COMPLETED'
  ],
  signal => {
    // Download signals
    if (signal.action === 'EXPORT_COMPLETED' || signal.action === 'EXPORT_FAILED' || signal.action === 'EXPORT_STARTED') {
      downloadStore.fetchJobs()
    }
    // Upload signals
    if (signal.action === 'JOB_PROGRESS' || signal.action === 'IMPORT_COMPLETED') {
      uploadStore.fetchJobs()
    }
  }
)

onMounted(() => {
  downloadStore.fetchJobs()
  uploadStore.fetchJobs()
})

const formatStatus = status => {
  const map = {
    PENDING: 'Menunggu',
    PROCESSING: 'Memproses',
    COMPLETED: 'Selesai',
    COMPLETED_WITH_ERRORS: 'Selesai (Parsial)',
    FAILED: 'Gagal'
  }
  return map[status] || status
}

const getStatusClass = status => {
  const map = {
    PENDING: 'text-warning bg-warning/10',
    PROCESSING: 'text-accent bg-accent/10',
    COMPLETED: 'text-success bg-success/10',
    COMPLETED_WITH_ERRORS: 'text-warning bg-warning/10',
    FAILED: 'text-danger bg-danger/10'
  }
  return map[status] || 'text-text/60 bg-secondary/10'
}

const formatDate = date => dayjs(date).format('DD MMM YYYY, HH:mm')

const recentDownloads = computed(() => downloadStore.jobs.slice(0, 5))
const recentUploads = computed(() => uploadStore.jobs.slice(0, 5))

const getErrorUrl = job => {
  try {
    if (!job.errorLog) return null
    const log = typeof job.errorLog === 'string' ? JSON.parse(job.errorLog) : job.errorLog
    if (!log.download_url) return null
    let baseUrl = import.meta.env.VITE_API_BASE_URL || ''
    baseUrl = baseUrl.replace(/\/api$/, '')
    baseUrl = baseUrl.replace(/\/$/, '')
    return `${baseUrl}${log.download_url}`
  } catch {
    return null
  }
}
</script>

<template>
  <div class="fixed bottom-6 right-6 z-[6000] flex flex-col items-end pointer-events-none">
    <!-- Expanded Panel -->
    <transition
      enter-active-class="transition ease-out duration-300 transform origin-bottom-right"
      enter-from-class="opacity-0 scale-90 translate-y-4"
      enter-to-class="opacity-100 scale-100 translate-y-0"
      leave-active-class="transition ease-in duration-200 transform origin-bottom-right"
      leave-from-class="opacity-100 scale-100 translate-y-0"
      leave-to-class="opacity-0 scale-90 translate-y-4"
    >
      <div
        v-if="isExpanded"
        class="w-80 md:w-96 bg-background rounded-2xl shadow-2xl border border-secondary/20 mb-4 overflow-hidden pointer-events-auto flex flex-col h-[450px]"
      >
        <!-- Header -->
        <div class="px-4 py-3 bg-secondary/5 border-b border-secondary/10 flex justify-between items-center shrink-0">
          <div class="flex items-center gap-2">
            <font-awesome-icon icon="fa-solid fa-up-down" class="text-primary" />
            <h3 class="font-bold text-sm text-text">Pusat Aktivitas</h3>
          </div>
          <div class="flex items-center gap-2">
            <span v-if="downloadStore.pendingCount > 0 || uploadStore.pendingCount > 0" class="flex h-2 w-2">
              <span class="animate-ping absolute inline-flex h-2 w-2 rounded-full bg-primary opacity-75"></span>
              <span class="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
            </span>
            <button
              @click="toggleWidget()"
              class="text-text/50 hover:text-text transition-colors p-1 rounded hover:bg-secondary/10"
            >
              <font-awesome-icon icon="fa-solid fa-minus" />
            </button>
          </div>
        </div>

        <!-- Tabs -->
        <div class="flex border-b border-secondary/10 bg-secondary/5">
          <button
            @click="activeTab = 'download'"
            class="flex-1 py-2 text-xs font-bold transition-colors border-b-2"
            :class="
              activeTab === 'download'
                ? 'border-primary text-primary'
                : 'border-transparent text-text/50 hover:text-text/80 hover:bg-secondary/10'
            "
          >
            <font-awesome-icon icon="fa-solid fa-cloud-arrow-down" class="mr-1.5" />
            Unduhan
            <span
              v-if="downloadStore.pendingCount > 0"
              class="ml-1 px-1.5 py-0.5 rounded-full bg-primary text-secondary text-[9px]"
              >{{ downloadStore.pendingCount }}</span
            >
          </button>
          <button
            @click="activeTab = 'upload'"
            class="flex-1 py-2 text-xs font-bold transition-colors border-b-2"
            :class="
              activeTab === 'upload'
                ? 'border-primary text-primary'
                : 'border-transparent text-text/50 hover:text-text/80 hover:bg-secondary/10'
            "
          >
            <font-awesome-icon icon="fa-solid fa-cloud-arrow-up" class="mr-1.5" />
            Unggahan
            <span
              v-if="uploadStore.pendingCount > 0"
              class="ml-1 px-1.5 py-0.5 rounded-full bg-primary text-secondary text-[9px]"
              >{{ uploadStore.pendingCount }}</span
            >
          </button>
        </div>

        <!-- Download List -->
        <div v-show="activeTab === 'download'" class="flex-1 overflow-y-auto custom-scrollbar p-2">
          <div v-if="recentDownloads.length === 0" class="py-8 text-center text-text/40">
            <font-awesome-icon icon="fa-solid fa-folder-open" class="text-3xl mb-2 opacity-50" />
            <p class="text-xs font-medium">Belum ada riwayat unduhan.</p>
          </div>

          <div v-else class="space-y-1">
            <div
              v-for="job in recentDownloads"
              :key="job.id"
              class="p-3 rounded-xl hover:bg-secondary/5 transition-colors border border-transparent hover:border-secondary/10 group"
            >
              <div class="flex justify-between items-start mb-1.5">
                <div class="flex items-center gap-2">
                  <span
                    class="px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider"
                    :class="getStatusClass(job.status)"
                  >
                    {{ formatStatus(job.status) }}
                  </span>
                </div>
                <span class="text-[10px] text-text/40 font-medium">{{ formatDate(job.created_at) }}</span>
              </div>

              <div class="text-xs font-bold text-text truncate mb-2" :title="job.file_path">
                {{ formatFileName(job.file_path, job.type) }}
              </div>

              <div class="flex justify-between items-center">
                <span class="text-[10px] text-text/50 capitalize">{{ job.type.replace(/_/g, ' ').toLowerCase() }}</span>

                <a
                  v-if="job.status === 'COMPLETED' && job.download_url"
                  href="#"
                  @click.prevent="openDownloadUrl(job.download_url)"
                  class="px-3 py-1.5 bg-primary/10 text-primary hover:bg-primary hover:text-secondary rounded-lg text-xs font-bold transition-all flex items-center gap-1.5"
                >
                  <font-awesome-icon icon="fa-solid fa-download" /> Unduh
                </a>
                <span
                  v-else-if="job.status === 'FAILED'"
                  class="text-[10px] text-danger font-medium truncate max-w-[120px]"
                  :title="job.error_message"
                >
                  {{ job.error_message || 'Gagal' }}
                </span>
                <span v-else-if="job.status === 'PROCESSING' || job.status === 'PENDING'" class="text-xs text-text/40">
                  <font-awesome-icon icon="fa-solid fa-circle-notch" spin />
                </span>
              </div>
            </div>
          </div>
        </div>

        <!-- Upload List -->
        <div v-show="activeTab === 'upload'" class="flex-1 overflow-y-auto custom-scrollbar p-2">
          <div v-if="recentUploads.length === 0" class="py-8 text-center text-text/40">
            <font-awesome-icon icon="fa-solid fa-file-excel" class="text-3xl mb-2 opacity-50" />
            <p class="text-xs font-medium">Belum ada riwayat unggahan.</p>
          </div>

          <div v-else class="space-y-1">
            <div
              v-for="job in recentUploads"
              :key="job.id"
              class="p-3 rounded-xl hover:bg-secondary/5 transition-colors border border-transparent hover:border-secondary/10 group"
            >
              <div class="flex justify-between items-start mb-1.5">
                <div class="flex items-center gap-2">
                  <span
                    class="px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider"
                    :class="getStatusClass(job.status)"
                  >
                    {{ formatStatus(job.status) }}
                  </span>
                  <span
                    v-if="(job.job_type || '').endsWith('_DRY_RUN')"
                    class="text-[9px] bg-secondary/20 text-text/60 px-1.5 rounded"
                  >
                    DRY RUN
                  </span>
                </div>
                <span class="text-[10px] text-text/40 font-medium">{{ formatDate(job.created_at) }}</span>
              </div>

              <div class="text-xs font-bold text-text truncate mb-1">
                {{ job.original_filename || 'Memproses file...' }}
              </div>

              <div v-if="job.notes" class="text-[10px] text-text/60 italic mb-2 border-l-2 border-primary/30 pl-1.5 truncate" :title="job.notes">
                {{ job.notes }}
              </div>

              <!-- Progress Bar -->
              <div v-if="job.status === 'PROCESSING'" class="mt-2 mb-2">
                <div class="flex justify-between text-[10px] text-text/60 mb-1">
                  <span>Progres</span>
                  <span>{{ job.progress || 0 }}%</span>
                </div>
                <div class="w-full bg-secondary/20 rounded-full h-1.5">
                  <div
                    class="bg-primary h-1.5 rounded-full transition-all duration-500"
                    :style="{ width: `${job.progress || 0}%` }"
                  ></div>
                </div>
              </div>

              <div class="flex justify-between items-center mt-2">
                <span class="text-[10px] text-text/50 truncate max-w-[150px]" :title="job.log_summary">
                  {{ job.log_summary || 'Memproses...' }}
                </span>

                <a
                  v-if="getErrorUrl(job)"
                  :href="getErrorUrl(job)"
                  target="_blank"
                  class="px-2 py-1 bg-danger/10 text-danger hover:bg-danger hover:text-secondary rounded text-[10px] font-bold transition-all flex items-center gap-1"
                >
                  <font-awesome-icon icon="fa-solid fa-download" /> Error Log
                </a>
              </div>
            </div>
          </div>
        </div>

        <!-- Footer link -->
        <div class="px-4 py-2 bg-secondary/5 border-t border-secondary/10 text-center shrink-0">
          <span class="text-[10px] text-text/50 font-medium">Menampilkan 5 aktivitas terakhir.</span>
        </div>
      </div>
    </transition>

    <!-- Floating Bubble Button -->
    <button
      @click="toggleWidget()"
      class="pointer-events-auto w-14 h-14 bg-background border-2 border-secondary/20 rounded-full shadow-xl flex items-center justify-center text-text hover:border-primary/50 hover:text-primary transition-all relative group"
      :class="{ 'ring-2 ring-primary ring-offset-2 ring-offset-background': isExpanded }"
    >
      <font-awesome-icon icon="fa-solid fa-up-down" class="text-xl" />

      <!-- Badge for active jobs -->
      <span
        v-if="pendingCount > 0"
        class="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-secondary text-[10px] font-bold border-2 border-background shadow-sm"
      >
        {{ pendingCount }}
      </span>

      <!-- Tooltip -->
      <div
        v-if="!isExpanded"
        class="absolute right-full mr-4 top-1/2 -translate-y-1/2 px-3 py-1.5 bg-text text-background text-xs font-bold rounded-lg opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none"
      >
        Pusat Aktivitas
      </div>
    </button>
  </div>
</template>
