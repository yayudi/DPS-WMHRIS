<script setup>
import { ref, watch } from 'vue'
import axios from '@/api/axios.js'

const props = defineProps({
  productId: { type: Number, required: true },
})

const history = ref([])
const loading = ref(false)

const fetchHistory = async () => {
  loading.value = true
  try {
    const { data } = await axios.get(`/products/${props.productId}/history`)
    if (data.success) {
      history.value = data.data
    }
  } catch (e) {
    console.error('Gagal load history', e)
  } finally {
    loading.value = false
  }
}

watch(() => props.productId, fetchHistory, { immediate: true })

// Helper format nilai
function formatValue(field, val) {
  if (field === 'price')
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(val)
  if (field === 'weight') return `${val} gr`
  if (field === 'is_package') return val == 1 ? 'Paket' : 'Satuan'
  if (field === 'status') return val // Active / Archived
  return val
}

// Warna Badge dinamis sesuai tema
function getBadgeColor(action) {
  if (action === 'CREATE') return 'bg-success/15 text-success border border-success/20'
  if (action === 'UPDATE') return 'bg-primary/15 text-primary border border-primary/20'
  if (action === 'DELETE') return 'bg-danger/15 text-danger border border-danger/20'
  if (action === 'RESTORE') return 'bg-warning/15 text-warning border border-warning/20'
  return 'bg-secondary/15 text-text/70'
}
</script>

<template>
  <div class="border border-secondary/20 rounded-lg overflow-hidden bg-background mt-4">
    <!-- Header -->
    <div
      class="px-4 py-3 bg-secondary/5 border-b border-secondary/20 font-bold text-sm text-text flex justify-between items-center"
    >
      <span>Audit Log Perubahan</span>
      <button @click="fetchHistory" class="text-xs text-primary hover:underline font-medium">
        Refresh
      </button>
    </div>

    <!-- Loading State -->
    <div v-if="loading" class="p-6 text-center text-xs text-text/50">
      <font-awesome-icon icon="fa-solid fa-circle-notch" spin class="text-lg mb-2 text-primary" />
      <p>Memuat data...</p>
    </div>

    <!-- Empty State -->
    <div v-else-if="history.length === 0" class="p-6 text-center text-xs text-text/40 italic">
      Belum ada riwayat perubahan tercatat.
    </div>

    <!-- Data Table -->
    <div v-else class="max-h-60 overflow-y-auto custom-scrollbar">
      <table class="w-full text-xs text-left">
        <thead
          class="bg-secondary/5 text-text/70 uppercase font-bold sticky top-0 backdrop-blur-sm"
        >
          <tr>
            <th class="px-4 py-2">Waktu</th>
            <th class="px-4 py-2">User</th>
            <th class="px-4 py-2">Aksi</th>
            <th class="px-4 py-2">Field</th>
            <th class="px-4 py-2">Lama -> Baru</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-secondary/10">
          <tr v-for="log in history" :key="log.id" class="hover:bg-secondary/5 transition-colors">
            <!-- Waktu -->
            <td class="px-4 py-2 text-text/70 whitespace-nowrap">
              {{ new Date(log.created_at).toLocaleString('id-ID') }}
            </td>
            <!-- User -->
            <td class="px-4 py-2 font-medium text-text">
              {{ log.nickname || log.user_name || 'System' }}
            </td>
            <!-- Aksi -->
            <td class="px-4 py-2">
              <span
                :class="getBadgeColor(log.action)"
                class="px-1.5 py-0.5 rounded text-[10px] font-bold"
              >
                {{ log.action }}
              </span>
            </td>
            <!-- Field -->
            <td class="px-4 py-2 font-mono text-text/60">{{ log.field }}</td>
            <!-- Nilai -->
            <td class="px-4 py-2">
              <div v-if="log.action === 'CREATE'" class="text-text/40 italic">New Data Created</div>
              <div v-else class="flex items-center gap-2">
                <span class="line-through text-danger/70 opacity-80">{{
                  formatValue(log.field, log.old_value)
                }}</span>
                <font-awesome-icon
                  icon="fa-solid fa-arrow-right"
                  class="text-text/30 text-[10px]"
                />
                <span class="font-bold text-text">{{ formatValue(log.field, log.new_value) }}</span>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<style scoped>
.custom-scrollbar::-webkit-scrollbar {
  width: 6px;
}
.custom-scrollbar::-webkit-scrollbar-track {
  background: transparent;
}
.custom-scrollbar::-webkit-scrollbar-thumb {
  background-color: hsl(var(--color-secondary) / 0.3);
  border-radius: 4px;
}
.custom-scrollbar::-webkit-scrollbar-thumb:hover {
  background-color: hsl(var(--color-secondary) / 0.5);
}
</style>
