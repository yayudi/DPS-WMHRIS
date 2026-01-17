<script setup>
import { ref } from 'vue'
import Modal from '@/components/ui/Modal.vue'
import DateRangeFilter from '@/components/ui/DateRangeFilter.vue'
import { fetchBatchLogs } from '@/api/helpers/stock.js' // Impor fungsi API baru

const props = defineProps({
  show: Boolean,
})

const emit = defineEmits(['close'])

// State lokal dikelola sepenuhnya di dalam modal
const startDate = ref('')
const endDate = ref('')
const logs = ref([])
const loading = ref(false)
const error = ref(null)
const hasSearched = ref(false) // Untuk melacak apakah pencarian sudah dilakukan

/**
 * Fungsi ini dipanggil saat tombol "Tampilkan" diklik.
 * Ia akan memanggil API dan mengisi tabel log di dalam modal ini.
 */
async function handleApply() {
  if (startDate.value && endDate.value) {
    loading.value = true
    error.value = null
    hasSearched.value = true
    try {
      logs.value = await fetchBatchLogs(startDate.value, endDate.value)
    } catch (err) {
      error.value = 'Gagal memuat data log.'
    } finally {
      loading.value = false
    }
  }
}

/**
 * Mereset semua state lokal di dalam modal.
 */
function handleReset() {
  startDate.value = ''
  endDate.value = ''
  logs.value = []
  hasSearched.value = false
}
</script>

<template>
  <Modal :show="show" @close="emit('close')" title="Lihat Log Batch Pergerakan Stok">
    <div class="space-y-4">
      <!-- Bagian Filter -->
      <div class="flex items-end gap-4 p-4 bg-secondary/10 rounded-lg">
        <div class="flex-1">
          <DateRangeFilter v-model:startDate="startDate" v-model:endDate="endDate" class="w-full" />
        </div>
        <button @click="handleApply" :disabled="!startDate || !endDate || loading"
          class="px-4 py-2 bg-primary text-secondary rounded-lg text-sm disabled:opacity-50">
          {{ loading ? 'Memuat...' : 'Tampilkan' }}
        </button>
        <button @click="handleReset" class="px-4 py-2 bg-secondary/20 text-text/80 rounded-lg text-sm">
          Reset
        </button>
      </div>

      <!-- Bagian Hasil (Tabel Log) -->
      <div class="max-h-[70vh] overflow-y-auto border-t border-secondary/20">
        <div v-if="loading" class="text-center p-8">
          <font-awesome-icon icon="fa-solid fa-spinner" class="animate-spin text-primary text-xl" />
        </div>
        <div v-else-if="error" class="text-center p-8 text-accent">{{ error }}</div>
        <div v-else-if="logs.length === 0 && hasSearched" class="text-center p-8 text-text/60">
          Tidak ada pergerakan stok pada rentang tanggal tersebut.
        </div>
        <div v-else-if="!hasSearched" class="text-center p-8 text-text/60">
          Pilih rentang tanggal dan klik "Tampilkan" untuk melihat log.
        </div>
        <table v-else class="min-w-full text-xs">
          <thead class="bg-secondary/10 uppercase text-text/70 sticky top-0">
            <tr>
              <th class="p-2 text-left">Waktu</th>
              <th class="p-2 text-left">Produk</th>
              <th class="p-2 text-center">Jml</th>
              <th class="p-2 text-left">Tipe</th>
              <th class="p-2 text-left">Dari</th>
              <th class="p-2 text-left">Ke</th>
              <th class="p-2 text-left">Oleh</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-secondary/20">
            <tr v-for="log in logs" :key="log.id" class="hover:bg-primary/5">
              <td class="p-2 whitespace-nowrap">
                {{
                  new Date(log.created_at).toLocaleString('id-ID', {
                    dateStyle: 'short',
                    timeStyle: 'medium',
                  })
                }}
              </td>
              <td class="p-2">
                <div class="font-semibold">{{ log.product_name }}</div>
                <div class="font-mono text-text/70">{{ log.sku }}</div>
              </td>
              <td class="p-2 text-center font-bold">{{ log.quantity }}</td>
              <td class="p-2">{{ log.movement_type }}</td>
              <td class="p-2 font-mono">{{ log.from_location || '-' }}</td>
              <td class="p-2 font-mono">{{ log.to_location || '-' }}</td>
              <td class="p-2">{{ log.user }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </Modal>
</template>
