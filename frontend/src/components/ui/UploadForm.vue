<!-- components/UploadForm.vue -->
<script setup>
import { ref } from 'vue'

// Menerima 'loading' sebagai prop dari parent
const props = defineProps({
  accept: {
    type: String,
    default: '.json,.csv',
  },
  submitLabel: {
    type: String,
    default: 'Upload',
  },
  loading: {
    type: Boolean,
    default: false,
  },
})

const emit = defineEmits(['submit'])

const file = ref(null)
const fileInput = ref(null)

function onFileChange(e) {
  file.value = e.target.files[0] || null
}

function handleSubmit() {
  if (!file.value) return
  const formData = new FormData()
  // Pastikan nama field 'csvFile' sesuai dengan yang diharapkan oleh backend
  formData.append('csvFile', file.value)

  emit('submit', formData)

  // Reset input setelah submit
  if (fileInput.value) {
    fileInput.value.value = ''
  }
  file.value = null
}
</script>

<template>
  <form
    @submit.prevent="handleSubmit"
    enctype="multipart/form-data"
    class="flex items-center gap-4 w-full sm:w-auto"
  >
    <input
      ref="fileInput"
      type="file"
      :accept="accept"
      class="block w-full text-sm text-text/80 file:mr-2 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-primary/10 file:text-primary hover:file:bg-primary/20 transition-colors cursor-pointer"
      @change="onFileChange"
    />

    <!-- Tombol sekarang menggunakan prop 'loading' -->
    <button
      type="submit"
      :disabled="loading || !file"
      class="bg-primary hover:bg-primary/90 text-white px-4 py-2 rounded-md font-semibold text-sm whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
    >
      <font-awesome-icon v-if="loading" icon="fa-solid fa-spinner" class="animate-spin" />
      <font-awesome-icon v-else icon="fa-solid fa-upload" />
      <span>{{ loading ? 'Uploading...' : submitLabel }}</span>
    </button>
  </form>
</template>
