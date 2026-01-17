<!-- frontend/src/components/ui/UploadForm.vue -->
<script setup>
import { ref } from 'vue'

// Menerima 'loading' sebagai prop dari parent
const props = defineProps({
  accept: {
    type: String,
    default: '.json,.csv,.xlsx,.xls',
  },
  submitLabel: {
    type: String,
    default: 'Upload',
  },
  loading: {
    type: Boolean,
    default: false,
  },
  multiple: {
    type: Boolean,
    default: false,
  },
  showDryRun: {
    type: Boolean,
    default: false,
  },
})

const emit = defineEmits(['submit'])

const fileInputRef = ref(null)
const files = ref([])
const isDragging = ref(false)
const isDryRun = ref(false)

function triggerFileSelect() {
  fileInputRef.value?.click()
}

function handleFileChange(e) {
  processFiles(e.target.files)
}

function onDrop(e) {
  isDragging.value = false
  processFiles(e.dataTransfer.files)
}

function processFiles(fileList) {
  if (!fileList || fileList.length === 0) return

  if (props.multiple) {
    files.value = Array.from(fileList)
  } else {
    // Single file mode: replace array with single item
    files.value = [fileList[0]]
  }
}

function removeFile(index) {
  files.value.splice(index, 1)
  if (files.value.length === 0 && fileInputRef.value) {
    fileInputRef.value.value = ''
  }
}

function handleSubmit() {
  if (files.value.length === 0) return

  const formData = new FormData()

  // Logic FormData
  if (props.multiple) {
    files.value.forEach((f) => formData.append('files', f))
  } else {
    // Default 'csvFile' untuk backward compatibility dengan controller absensi lama
    formData.append('csvFile', files.value[0])
  }

  // Append Dry Run Flag
  if (props.showDryRun && isDryRun.value) {
    formData.append('dryRun', 'true')
  }

  emit('submit', formData)
}
</script>

<template>
  <div class="w-full space-y-4">
    <!-- Dropzone Area -->
    <div @click="triggerFileSelect" @dragover.prevent="isDragging = true" @dragleave.prevent="isDragging = false"
      @drop.prevent="onDrop" :class="[
        'relative border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all duration-200 group',
        isDragging
          ? 'border-primary bg-primary/5 scale-[1.01]'
          : 'border-secondary/30 hover:border-primary/50 hover:bg-secondary/5 bg-background',
      ]">
      <input ref="fileInputRef" type="file" :accept="accept" :multiple="multiple" class="hidden"
        @change="handleFileChange" />

      <div class="flex flex-col items-center justify-center gap-3 py-2">
        <!-- Icon -->
        <div class="w-12 h-12 rounded-full flex items-center justify-center transition-colors" :class="files.length > 0
            ? 'bg-success/10 text-success'
            : 'bg-primary/10 text-primary group-hover:bg-primary/20'
          ">
          <font-awesome-icon :icon="files.length > 0 ? 'fa-solid fa-file-circle-check' : 'fa-solid fa-cloud-arrow-up'
            " class="text-xl" />
        </div>

        <!-- Text -->
        <div class="space-y-1">
          <p class="text-sm font-bold text-text/80">
            {{ files.length > 0 ? `${files.length} File Dipilih` : 'Klik atau Tarik File ke Sini' }}
          </p>
          <p class="text-[10px] text-text/40 uppercase font-bold tracking-wider">
            Format: {{ accept }}
          </p>
        </div>
      </div>
    </div>

    <!-- File List Preview -->
    <div v-if="files.length > 0" class="space-y-2 max-h-32 overflow-y-auto custom-scrollbar">
      <div v-for="(f, i) in files" :key="i"
        class="flex items-center gap-3 p-2 bg-secondary/5 border border-secondary/10 rounded-lg text-xs group hover:bg-secondary/10 transition-colors">
        <font-awesome-icon :icon="f.name.endsWith('.csv') ? 'fa-solid fa-file-csv' : 'fa-solid fa-file-excel'"
          class="text-text/40 text-lg ml-1" />
        <div class="flex-1 min-w-0">
          <div class="font-semibold text-text/80 truncate">{{ f.name }}</div>
          <div class="text-[10px] text-text/40 font-mono">{{ (f.size / 1024).toFixed(0) }} KB</div>
        </div>
        <button @click.stop="removeFile(i)"
          class="p-1.5 hover:bg-danger/10 text-text/30 hover:text-danger rounded transition-colors" title="Hapus"
          type="button">
          <font-awesome-icon icon="fa-solid fa-xmark" />
        </button>
      </div>
    </div>

    <!-- Options & Actions -->
    <div class="pt-2 space-y-4">
      <!-- Dry Run Checkbox -->
      <div v-if="showDryRun && files.length > 0" class="flex items-center gap-2 px-1">
        <div class="relative flex items-center">
          <input type="checkbox" id="dryRunCheckGeneric" v-model="isDryRun"
            class="peer h-4 w-4 cursor-pointer appearance-none rounded border border-secondary/40 checked:bg-primary checked:border-primary transition-all" />
          <font-awesome-icon icon="fa-solid fa-check"
            class="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-[10px] text-secondary opacity-0 peer-checked:opacity-100" />
        </div>
        <label for="dryRunCheckGeneric" class="text-xs text-text/70 cursor-pointer select-none font-medium">
          Mode Simulasi <span class="text-text/40 font-normal">(Cek validasi tanpa simpan)</span>
        </label>
      </div>

      <!-- Submit Button -->
      <button type="button" @click="handleSubmit" :disabled="loading || files.length === 0" :class="[
        'w-full px-6 py-3.5 rounded-xl font-bold shadow-lg hover:-translate-y-0.5 active:translate-y-0 active:shadow-sm disabled:opacity-50 disabled:shadow-none disabled:translate-y-0 disabled:cursor-not-allowed transition-all duration-200 flex items-center justify-center gap-3',
        isDryRun
          ? 'bg-secondary text-text hover:bg-secondary/80 shadow-secondary/20'
          : 'bg-primary text-secondary hover:bg-primary/90 shadow-primary/20 hover:shadow-primary/40',
      ]">
        <font-awesome-icon v-if="loading" icon="fa-solid fa-circle-notch" class="animate-spin text-lg" />
        <span class="text-sm tracking-wide">{{
          loading
            ? isDryRun
              ? 'Simulasi...'
              : 'Mengupload...'
            : isDryRun
              ? 'CEK VALIDASI'
              : submitLabel
        }}</span>
      </button>
    </div>
  </div>
</template>
