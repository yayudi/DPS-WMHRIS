<template>
  <BaseModal :show="isOpen" @close="close" :title="title" maxWidth="max-w-md">
    <div class="space-y-5">
      <!-- Info Box -->
      <div class="bg-primary/10 text-primary p-4 rounded-lg text-sm border border-primary/20">
        <slot name="instructions">
          <p class="font-bold mb-2 flex items-center gap-2">
            <font-awesome-icon icon="fa-solid fa-file-csv" /> Panduan Import:
          </p>
          <ul class="list-disc list-inside opacity-90 space-y-1">
            <li v-for="item in instructions" :key="item">{{ item }}</li>
          </ul>
        </slot>
        <div v-if="templateUrl" class="mt-3 pt-3 border-t border-primary/20">
          <button @click="downloadTemplate" class="font-bold hover:underline inline-flex items-center gap-1">
            <font-awesome-icon icon="fa-solid fa-download" /> Download Template
          </button>
        </div>
      </div>

      <!-- File Input -->
      <div
        class="border-2 border-dashed border-secondary/40 rounded-3xl flex flex-col items-center justify-center py-6 px-8 text-center cursor-pointer hover:border-primary/50 hover:bg-primary/5 transition-all group relative"
        @click="$refs.fileInput.click()"
        @dragover.prevent
        @drop.prevent="handleDrop"
      >
        <input type="file" ref="fileInput" class="hidden" :accept="accept" @change="handleFileSelect" />

        <div v-if="selectedFile" class="z-10 flex flex-col items-center">
          <div
            class="w-16 h-16 bg-success/10 rounded-full flex items-center justify-center mb-4 text-success shadow-inner"
          >
            <font-awesome-icon icon="fa-solid fa-file-circle-check" class="text-3xl" />
          </div>
          <p class="font-bold text-lg text-text max-w-[250px] truncate">
            {{ selectedFile.name }}
          </p>
          <p class="text-sm text-text/50 mt-1 font-medium">{{ (selectedFile.size / 1024).toFixed(1) }} KB</p>
          <div
            class="mt-4 px-4 py-1.5 bg-background rounded-full text-xs font-bold text-text/70 border border-secondary/20 shadow-sm group-hover:text-primary group-hover:border-primary/30 transition-colors"
          >
            Klik untuk mengganti file
          </div>
        </div>

        <div v-else class="z-10 flex flex-col items-center">
          <div
            class="w-20 h-20 bg-secondary/10 rounded-full flex items-center justify-center mb-4 text-text/30 group-hover:bg-primary/10 group-hover:text-primary transition-all duration-300"
          >
            <font-awesome-icon
              icon="fa-solid fa-cloud-arrow-up"
              class="text-4xl group-hover:-translate-y-1 transition-transform"
            />
          </div>
          <p class="font-bold text-text text-lg mb-1">Pilih File atau Drag & Drop</p>
          <p class="text-sm text-text/50 font-medium">Mendukung format file {{ accept }}</p>
        </div>
      </div>

      <!-- Extra Fields Slot (e.g. Dry Run toggle) -->
      <slot name="extra-fields"></slot>

      <!-- Notes -->
      <div>
        <label class="block text-sm font-bold text-text mb-1.5">Catatan <span class="text-text/40 font-normal">(opsional)</span></label>
        <textarea
          v-model="userNotes"
          rows="2"
          placeholder="Tulis catatan untuk upload ini..."
          class="w-full px-3 py-2 border border-secondary/30 rounded-lg bg-background text-text text-sm outline-none focus:border-primary transition-colors resize-none placeholder:text-text/30"
        ></textarea>
      </div>

      <!-- Error Message -->
      <div v-if="errorMessage" class="bg-danger/10 text-danger px-4 py-3 rounded-lg text-sm flex items-start gap-3">
        <font-awesome-icon icon="fa-solid fa-circle-exclamation" class="mt-0.5 shrink-0" />
        <span>{{ errorMessage }}</span>
      </div>

      <!-- Jobs History -->
      <div v-if="jobType" class="pt-4 border-t border-secondary/20">
        <h4 class="font-bold text-text mb-3 flex items-center justify-between">
          <span>Riwayat Proses</span>
        </h4>

        <div v-if="isLoadingJobs && jobs.length === 0" class="flex justify-center py-4">
          <font-awesome-icon icon="fa-solid fa-spinner" spin class="text-primary text-xl" />
        </div>
        <div v-else-if="jobs.length === 0" class="text-center py-6 bg-secondary/10 rounded-lg">
          <p class="text-sm text-text/50">Belum ada riwayat unggahan.</p>
        </div>
        <div v-else class="space-y-3">
          <div
            v-for="job in jobs"
            :key="job.id"
            class="p-3 border rounded-lg flex flex-col gap-2 transition-colors"
            :class="
              job.status === 'COMPLETED'
                ? 'bg-success/5 border-success/20'
                : job.status === 'COMPLETED_WITH_ERRORS'
                  ? 'bg-warning/5 border-warning/20'
                  : ['ERROR', 'FAILED'].includes(job.status)
                    ? 'bg-danger/5 border-danger/20'
                    : 'bg-primary/5 border-primary/20'
            "
          >
            <div class="flex justify-between items-start">
              <div>
                <div class="font-bold text-sm text-text">{{ job.originalFilename || 'File Upload' }}</div>
                <div class="text-xs text-text/60">{{ new Date(job.createdAt).toLocaleString() }}</div>
              </div>
              <div>
                <span
                  v-if="job.status === 'PENDING'"
                  class="px-2 py-1 text-[10px] font-bold uppercase tracking-wider rounded-md bg-secondary/20 text-text/70 border border-secondary/30 flex items-center gap-1.5"
                >
                  <font-awesome-icon icon="fa-solid fa-hourglass-half" />
                  Menunggu
                </span>
                <span
                  v-else-if="job.status === 'PROCESSING'"
                  class="px-2 py-1 text-[10px] font-bold uppercase tracking-wider rounded-md bg-primary/10 text-primary border border-primary/30 flex items-center gap-1.5 animate-pulse"
                >
                  <font-awesome-icon icon="fa-solid fa-spinner" spin />
                  Memproses
                </span>
                <span
                  v-else-if="job.status === 'COMPLETED'"
                  class="px-2 py-1 text-[10px] font-bold uppercase tracking-wider rounded-md bg-success/10 text-success border border-success/30 flex items-center gap-1.5"
                >
                  <font-awesome-icon icon="fa-solid fa-check-circle" />
                  Selesai
                </span>
                <span
                  v-else-if="job.status === 'COMPLETED_WITH_ERRORS'"
                  class="px-2 py-1 text-[10px] font-bold uppercase tracking-wider rounded-md bg-warning/10 text-warning border border-warning/30 flex items-center gap-1.5"
                >
                  <font-awesome-icon icon="fa-solid fa-triangle-exclamation" />
                  Parsial
                </span>
                <span
                  v-else-if="['ERROR', 'FAILED'].includes(job.status)"
                  class="px-2 py-1 text-[10px] font-bold uppercase tracking-wider rounded-md bg-danger/10 text-danger border border-danger/30 flex items-center gap-1.5"
                >
                  <font-awesome-icon icon="fa-solid fa-circle-exclamation" />
                  Gagal
                </span>
              </div>
            </div>

            <div
              v-if="job.summary"
              class="text-xs text-text/80 bg-background/50 p-2 rounded border border-secondary/10"
            >
              {{ job.summary }}
            </div>

            <!-- Jika error, download log -->
            <div v-if="job.status === 'ERROR' && job.errorLog" class="mt-1">
              <a
                :href="job.errorLog"
                download
                class="text-xs text-danger hover:underline inline-flex items-center gap-1"
              >
                <font-awesome-icon icon="fa-solid fa-file-excel" /> Download Log Error
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Footer -->
    <template #footer>
      <div class="flex justify-end gap-3 w-full">
        <button
          @click="close"
          class="px-4 py-2 rounded-lg font-medium text-text opacity-70 hover:opacity-100 hover:bg-secondary/10 transition-all"
        >
          Batal
        </button>
        <button
          @click="upload"
          :disabled="!selectedFile || isUploading"
          class="px-5 py-2 bg-primary text-secondary rounded-lg shadow-lg shadow-primary/30 font-bold hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center gap-2"
        >
          <font-awesome-icon v-if="isUploading" icon="fa-solid fa-spinner" spin />
          <font-awesome-icon v-else icon="fa-solid fa-file-import" />
          <span>{{ isUploading ? 'Mengunggah...' : 'Mulai Import' }}</span>
        </button>
      </div>
    </template>
  </BaseModal>
</template>

<script setup>
import { ref, watch, computed } from 'vue'
import BaseModal from '@/components/ui/BaseModal.vue'
import { useUploadStore } from '@/stores/uploadStore'
import { useToast } from '@/composables/useToast'
import { useDownload } from '@/composables/useDownload'
import { useUpload } from '@/composables/useUpload'

const props = defineProps({
  isOpen: Boolean,
  title: { type: String, default: 'Import File' },
  templateUrl: { type: String, default: '' },
  templateFilename: { type: String, default: 'Template.xlsx' },
  uploadUrl: { type: String, required: true },
  uploadFieldName: { type: String, default: 'file' },
  additionalData: { type: Object, default: () => ({}) },
  instructions: { type: Array, default: () => ['Gunakan Template Excel yang disediakan'] },
  accept: { type: String, default: '.xlsx, .xls, .csv' },
  jobType: { type: String, default: '' } // Contoh: 'LINK_MEDIA_EXCEL'
})

const emit = defineEmits(['close', 'success'])
const { toast } = useToast()
const { downloadFile } = useDownload()
const { uploadFile } = useUpload()
const uploadStore = useUploadStore()

const fileInput = ref(null)
const selectedFile = ref(null)
const isUploading = ref(false)
const errorMessage = ref('')
const userNotes = ref('')

const isLoadingJobs = computed(() => uploadStore.jobs.length === 0 && !uploadStore.isExpanded)
const jobs = computed(() => {
  return uploadStore.jobs.filter(j => j.jobType === props.jobType).slice(0, 5)
})

const downloadTemplate = async () => {
  if (!props.templateUrl) return
  try {
    await downloadFile(props.templateUrl, props.templateFilename)
  } catch (e) {
    console.error(e)
  }
}

const handleFileSelect = event => {
  const file = event.target.files[0]
  if (file) selectedFile.value = file
}

const handleDrop = event => {
  const file = event.dataTransfer.files[0]
  if (file) selectedFile.value = file
}

const upload = async () => {
  if (!selectedFile.value) return

  isUploading.value = true
  errorMessage.value = ''

  try {
    const mergedData = { ...props.additionalData }
    if (userNotes.value.trim()) {
      mergedData.notes = mergedData.notes
        ? `${mergedData.notes} | ${userNotes.value.trim()}`
        : userNotes.value.trim()
    }
    const res = await uploadFile(props.uploadUrl, selectedFile.value, props.uploadFieldName, mergedData)
    
    // Asumsi standar API sukses mengembalikan success: true
    if (res.data && res.data.success !== false) {
      toast(res.data.message || 'File berhasil diunggah. Proses import berjalan di background.', 'success')
      emit('success')
      if (props.jobType) fetchJobs()
      else close()
    } else {
      errorMessage.value = res.data.message || 'Gagal mengunggah file.'
    }
  } catch (error) {
    console.error(error)
    errorMessage.value = error.response?.data?.message || 'Gagal mengunggah file.'
  } finally {
    isUploading.value = false
  }
}

const fetchJobs = async () => {
  if (!props.isOpen || !props.jobType) return
  await uploadStore.fetchJobs()
}

watch(
  () => props.isOpen,
  newVal => {
    if (newVal) {
      selectedFile.value = null
      errorMessage.value = ''
      if (props.jobType && uploadStore.jobs.length === 0) {
        fetchJobs()
      }
    }
  }
)

const close = () => {
  selectedFile.value = null
  errorMessage.value = ''
  userNotes.value = ''
  emit('close')
}
</script>
