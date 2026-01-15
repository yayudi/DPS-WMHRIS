<!-- frontend\src\components\picking\JobErrorModal.vue -->
<script setup>
import { ref, watch, computed } from 'vue'
import Modal from '@/components/ui/Modal.vue' // ✅ Import Modal Generic Anda

const props = defineProps({
  show: Boolean,
  job: Object,
  apiBaseUrl: {
    type: String,
    default: 'http://localhost:3000',
  },
})

const emit = defineEmits(['close'])

const errorList = ref([])
const downloadUrl = ref('')
const filename = computed(() => props.job?.original_filename || 'File Import')

// Watcher: Parsing logic tetap sama (sudah robust)
watch(
  () => props.job,
  (newJob) => {
    errorList.value = []
    downloadUrl.value = ''

    if (!newJob || !newJob.error_log) return

    try {
      let raw = newJob.error_log

      // Handle double stringify edge-case
      if (typeof raw === 'string') {
        try {
          raw = JSON.parse(raw)
        } catch (e) {}
      }
      if (typeof raw === 'string') {
        try {
          raw = JSON.parse(raw)
        } catch (e) {}
      }

      // Mapping Data
      if (Array.isArray(raw)) {
        errorList.value = raw
      } else if (raw && typeof raw === 'object') {
        if (Array.isArray(raw.errors)) errorList.value = raw.errors
        if (raw.download_url) downloadUrl.value = raw.download_url
      }
    } catch (e) {
      console.error('Error parsing log:', e)
    }
  },
  { immediate: true },
)

function close() {
  emit('close')
}
</script>

<template>
  <Modal :show="show" @close="close" :title="`Laporan Error: ${filename}`">
    <div class="flex flex-col gap-6 max-h-[60vh] overflow-y-auto custom-scrollbar pr-2">
      <div
        v-if="downloadUrl"
        class="bg-warning/10 border border-warning/20 rounded-xl p-4 flex flex-col gap-3"
      >
        <div class="flex items-start gap-3">
          <div class="bg-warning/20 p-2 rounded-lg text-warning-dark">
            <font-awesome-icon icon="fa-solid fa-triangle-exclamation" />
          </div>
          <div>
            <h4 class="text-warning-dark font-bold text-sm">Tindakan Diperlukan</h4>
            <p class="text-xs text-warning-dark/80 mt-1 leading-relaxed">
              Sebagian data gagal diproses. Sistem telah membuat file Excel perbaikan.
            </p>
          </div>
        </div>

        <a
          :href="`${apiBaseUrl}${downloadUrl}`"
          target="_blank"
          class="w-full text-center bg-warning hover:bg-warning-hover text-white text-sm font-bold px-4 py-2.5 rounded-lg shadow-sm transition-colors flex items-center justify-center gap-2"
        >
          <font-awesome-icon icon="fa-solid fa-file-excel" />
          Download File Perbaikan
        </a>
      </div>

      <div>
        <h5 class="text-xs font-bold text-text/50 uppercase tracking-wider mb-3">
          Preview Error ({{ errorList.length }})
        </h5>

        <div class="border border-secondary/20 rounded-lg overflow-hidden">
          <table class="w-full text-left text-sm">
            <thead class="bg-secondary/10 text-xs text-text/60">
              <tr>
                <th class="p-3 w-16 text-center border-b border-secondary/10">Baris</th>
                <th class="p-3 border-b border-secondary/10">Pesan Error</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-secondary/10">
              <tr
                v-for="(err, idx) in errorList"
                :key="idx"
                class="hover:bg-secondary/5 transition-colors"
              >
                <td class="p-3 text-center font-mono text-xs text-text/50 bg-secondary/5">
                  {{ err.row || '-' }}
                </td>
                <td class="p-3">
                  <div class="flex flex-col">
                    <span
                      class="font-bold text-xs text-text/80 mb-0.5"
                      v-if="err.sku && err.sku !== 'UNKNOWN'"
                    >
                      {{ err.sku }}
                    </span>
                    <span class="text-xs text-danger leading-relaxed">
                      {{ err.message || err.error }}
                    </span>
                  </div>
                </td>
              </tr>
              <tr v-if="errorList.length === 0">
                <td colspan="2" class="p-4 text-center text-text/40 italic text-xs">
                  Tidak ada preview error tersedia.
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <template #footer>
      <button
        @click="close"
        class="px-4 py-2 text-sm font-medium text-text/60 hover:text-text hover:bg-secondary/10 rounded-lg transition-colors"
      >
        Tutup
      </button>
    </template>
  </Modal>
</template>

<style scoped>
/* Scrollbar halus untuk wrapper konten */
.custom-scrollbar::-webkit-scrollbar {
  width: 4px;
}
.custom-scrollbar::-webkit-scrollbar-track {
  background: transparent;
}
.custom-scrollbar::-webkit-scrollbar-thumb {
  background: rgba(0, 0, 0, 0.1);
  border-radius: 10px;
}
.custom-scrollbar::-webkit-scrollbar-thumb:hover {
  background: rgba(0, 0, 0, 0.2);
}
</style>
