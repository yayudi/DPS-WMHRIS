<!-- frontend\src\views\WMSBatchLogView.vue -->
<script setup>
import { ref } from 'vue'
import { fetchBatchLogs } from '@/api/helpers/stock.js'
import { useToast } from '@/composables/UseToast.js'

const { show } = useToast()
const startDate = ref('')
const endDate = ref('')
const logs = ref([])
const loading = ref(false)
const hasSearched = ref(false)

async function handleSearch() {
  if (startDate.value && endDate.value) {
    loading.value = true
    hasSearched.value = true
    try {
      logs.value = await fetchBatchLogs(startDate.value, endDate.value)
    } catch (err) {
      show('Gagal memuat data log.', 'error')
    } finally {
      loading.value = false
    }
  } else {
    show('Silakan pilih tanggal mulai dan selesai.', 'warning')
  }
}
</script>

<template>
  <div class="p-6">
    <div class="flex justify-between items-center mb-4">
      <h2 class="text-2xl font-bold text-text">Batch Movement Log</h2>
    </div>

    <div class="bg-background rounded-xl shadow-md border border-secondary/20 p-6 space-y-6">
      <!-- Filter Tanggal -->
      <div class="flex items-end gap-4 p-4 bg-secondary/10 rounded-lg">
        <div class="flex-1">
          <label for="startDate" class="block text-sm font-medium text-text/90 mb-1"
            >Tanggal Mulai</label
          >
          <input
            type="date"
            id="startDate"
            v-model="startDate"
            class="w-full bg-background border-2 border-primary/30 text-text text-sm rounded-lg p-2"
          />
        </div>
        <div class="flex-1">
          <label for="endDate" class="block text-sm font-medium text-text/90 mb-1"
            >Tanggal Selesai</label
          >
          <input
            type="date"
            id="endDate"
            v-model="endDate"
            class="w-full bg-background border-2 border-primary/30 text-text text-sm rounded-lg p-2"
          />
        </div>
        <button
          @click="handleSearch"
          :disabled="loading"
          class="px-4 py-2 bg-primary text-white rounded-lg text-sm disabled:opacity-50"
        >
          {{ loading ? 'Mencari...' : 'Tampilkan Log' }}
        </button>
      </div>

      <!-- Hasil Log -->
      <div class="max-h-[70vh] overflow-y-auto">
        <div v-if="loading" class="text-center p-8">Memuat data log...</div>
        <div v-else-if="logs.length === 0 && hasSearched" class="text-center p-8 text-text/60">
          Tidak ada pergerakan stok pada rentang tanggal tersebut.
        </div>
        <div v-else-if="!hasSearched" class="text-center p-8 text-text/60">
          Pilih rentang tanggal dan klik "Tampilkan Log" untuk melihat riwayat.
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
              <th class="p-2 text-left">Catatan</th>
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
              <td class="p-2 text-text/80">{{ log.notes }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>
