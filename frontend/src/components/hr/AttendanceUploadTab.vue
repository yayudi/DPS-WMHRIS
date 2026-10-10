<script setup>
import { ref } from 'vue'
import { useToast } from '@/composables/useToast'
import { useJobHistory } from '@/composables/useJobHistory'
import { useAttendance } from '@/modules/hr/application/useAttendance'
import UploadForm from '@/components/ui/UploadForm.vue'

const { toast } = useToast()
const emit = defineEmits(['view-errors', 'switch-tab'])
const { importJobHistory, isHistoryLoading, fetchJobHistory, handleVoidJob, getProgress } =
  useJobHistory('IMPORT_ATTENDANCE')
const isUploading = ref(false)

async function handleUpload(formData) {
  isUploading.value = true
  toast('Mengupload file...', 'info')
  try {
    const response = await useAttendance().uploadAbsensiFile(formData)

    if (response.success) {
      // Trigger refresh segera setelah upload
      fetchJobHistory()

      if (response.jobId) {
        toast(response.message || 'File masuk antrian background.', 'success')
      } else if (response.processed) {
        toast('Upload berhasil! Menampilkan data terbaru.', 'success')
        // Legacy: jika proses sinkron, bisa switch tab
        emit('switch-tab', 'summary')
      }
    } else {
      throw new Error(response.message || 'Terjadi kesalahan di server.')
    }
  } catch (error) {
    console.error('Upload error:', error)
    toast('Gagal mengupload file', 'error')
  } finally {
    isUploading.value = false
  }
}
</script>

<template>
  <div class="grid grid-cols-1 xl:grid-cols-3 gap-8 animate-fade-in">
    <!-- KOLOM KIRI: FORM UPLOAD -->
    <div class="xl:col-span-1 space-y-6">
      <div class="bg-secondary/30 border border-secondary/20 rounded-2xl p-6 shadow-sm">
        <h3 class="text-lg font-bold mb-6 flex items-center gap-2 text-text">
          <span class="bg-primary/20 text-primary p-2 rounded-lg text-sm">
            <font-awesome-icon icon="fa-solid fa-upload" />
          </span>
          Formulir Import Absensi
        </h3>

        <UploadForm
          @submit="handleUpload"
          :loading="isUploading"
          accept=".csv,.xlsx,.xls"
          submit-label="Mulai Import"
          :show-dry-run="true"
        />
      </div>

      <!-- Info Box -->
      <div class="bg-primary/5 border border-primary/20 rounded-xl p-4 text-xs text-primary leading-relaxed">
        <div class="font-bold mb-1 flex items-center gap-2">
          <font-awesome-icon icon="fa-solid fa-circle-info" /> Catatan Sistem:
        </div>
        File yang diupload akan diproses di background. Anda bisa menutup halaman ini, proses import tidak akan
        terhenti. Pantau status di tabel riwayat.
      </div>
    </div>

    <!-- KOLOM KANAN: RIWAYAT PROSES -->
    <div
      class="xl:col-span-2 bg-secondary/30 border border-secondary/20 rounded-2xl overflow-hidden flex flex-col h-[650px] shadow-sm"
    >
      <div class="p-5 border-b border-secondary/20 bg-secondary/5 flex justify-between items-center backdrop-blur-sm">
        <h3 class="font-bold flex items-center gap-2 text-text">
          <font-awesome-icon icon="fa-solid fa-clock-rotate-left" class="text-text/40" />
          Riwayat Proses
        </h3>
        <div class="flex items-center gap-3">
          <font-awesome-icon
            v-if="isHistoryLoading"
            icon="fa-solid fa-circle-notch"
            class="animate-spin text-primary"
          />
        </div>
      </div>

      <div class="flex-1 overflow-y-auto custom-scrollbar relative">
        <table class="w-full text-left border-collapse">
          <thead class="bg-secondary/20 text-xs uppercase text-text/50 font-bold sticky top-0 backdrop-blur-md z-10">
            <tr>
              <th class="p-4 font-bold tracking-wider w-[140px]">Waktu</th>
              <th class="p-4 font-bold tracking-wider">File / Info</th>
              <th class="p-4 font-bold tracking-wider text-right w-[180px]">Status</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-secondary/10 text-sm">
            <tr v-if="importJobHistory.length === 0 && !isHistoryLoading">
              <td colspan="3" class="p-12 text-center text-text/40 italic flex flex-col items-center gap-2">
                <font-awesome-icon icon="fa-solid fa-folder-open" class="text-2xl opacity-20" />
                Belum ada riwayat import absensi.
              </td>
            </tr>
            <tr v-for="job in importJobHistory" :key="job.id" class="hover:bg-secondary/10 transition-colors group">
              <!-- Waktu -->
              <td class="p-4 whitespace-nowrap text-text/70 font-mono text-[11px] align-top">
                <div class="font-bold">
                  {{ new Date(job.created_at || job.createdAt).toLocaleDateString('id-ID') }}
                </div>
                <div>
                  {{
                    new Date(job.created_at || job.createdAt).toLocaleTimeString('id-ID', {
                      hour: '2-digit',
                      minute: '2-digit'
                    })
                  }}
                </div>
              </td>

              <!-- File Info -->
              <td class="p-4 align-top">
                <div class="flex items-start justify-between gap-2">
                  <div>
                    <div class="font-bold text-text text-sm break-all">
                      {{ job.original_filename }}
                    </div>
                    <div class="text-xs text-text/50 mt-1 flex items-center gap-1">
                      <span
                        class="uppercase bg-secondary/20 px-1.5 py-0.5 rounded text-[10px] font-bold tracking-wider"
                      >
                        {{ (job.job_type || job.jobType || '').replace('IMPORT_ATTENDANCE_', '') }}
                      </span>
                      <span v-if="job.notes" class="italic opacity-70">- {{ job.notes }}</span>
                    </div>
                  </div>
                </div>

                <!-- PROGRESS BAR -->
                <div v-if="job.status === 'PROCESSING'" class="mt-3">
                  <div class="flex justify-between text-[10px] font-bold text-text/60 mb-1">
                    <span>Memproses data...</span>
                    <span
                      >{{ getProgress(job) }}% ({{ job.processed_records || 0 }} / {{ job.total_records || '?' }})</span
                    >
                  </div>
                  <div class="w-full bg-secondary/20 rounded-full h-1.5 overflow-hidden">
                    <div
                      class="bg-primary h-1.5 rounded-full transition-all duration-500 ease-out relative overflow-hidden"
                      :style="{ width: `${getProgress(job)}%` }"
                    >
                      <div
                        class="absolute inset-0 bg-background/30 animate-[shimmer_1s_infinite] w-full transform -skew-x-12"
                      ></div>
                    </div>
                  </div>
                </div>

                <!-- Summary Text -->
                <div
                  v-if="job.log_summary && job.status !== 'PROCESSING'"
                  class="mt-2 text-xs text-text/60 bg-secondary/5 p-2 rounded border border-secondary/10 whitespace-pre-line"
                >
                  {{ job.log_summary }}
                </div>
              </td>

              <!-- Status Badge -->
              <td class="p-4 text-right align-top">
                <div class="flex flex-col items-end gap-2">
                  <span
                    v-if="job.status === 'COMPLETED'"
                    class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-bold bg-success/10 text-success border border-success/20 shadow-sm"
                  >
                    <font-awesome-icon icon="fa-solid fa-check" /> SELESAI
                  </span>
                  <span
                    v-else-if="job.status === 'FAILED' || job.status === 'COMPLETED_WITH_ERRORS'"
                    @click="$emit('view-errors', job)"
                    class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-bold bg-danger/10 text-danger border border-danger/20 cursor-pointer hover:bg-danger/20 transition-colors shadow-sm"
                  >
                    <font-awesome-icon icon="fa-solid fa-triangle-exclamation" />
                    {{ job.status === 'FAILED' ? 'GAGAL' : 'ADA MASALAH' }}
                  </span>
                  <span
                    v-else-if="job.status === 'VOID'"
                    class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-bold bg-secondary/20 text-text/60 border border-secondary/30"
                  >
                    <font-awesome-icon icon="fa-solid fa-ban" /> VOID
                  </span>
                  <span
                    v-else
                    class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-primary/10 text-primary border border-primary/20 animate-pulse"
                  >
                    <font-awesome-icon icon="fa-solid fa-circle-notch" class="animate-spin" />
                    PROSES
                  </span>
                  <button
                    v-if="job.status === 'PENDING'"
                    @click="handleVoidJob(job)"
                    class="text-[10px] text-danger/80 hover:text-danger font-medium flex items-center gap-1 hover:bg-danger/10 p-1 rounded transition-colors"
                  >
                    <font-awesome-icon icon="fa-solid fa-xmark" /> Void
                  </button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>

<style scoped>
@keyframes shimmer {
  0% {
    transform: translateX(-100%);
  }
  100% {
    transform: translateX(100%);
  }
}
</style>
