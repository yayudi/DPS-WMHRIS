<!-- frontend/src/components/wms/shared/HistoryModal.vue -->
<script setup>
import { ref, watch } from 'vue'
import Modal from '@/components/ui/Modal.vue'
import { fetchStockHistory } from '@/api/helpers/stock.js'

const props = defineProps({
  show: Boolean,
  product: Object,
})

const emit = defineEmits(['close'])

const history = ref([])
const pagination = ref({})
const loading = ref(false)
const error = ref(null)
const currentPage = ref(1)

async function loadHistory(page) {
  if (!props.product) return
  loading.value = true
  error.value = null
  try {
    const response = await fetchStockHistory(props.product.id, page)
    history.value = response.data
    pagination.value = response.pagination
    currentPage.value = response.pagination.page
  } catch (err) {
    error.value = 'Gagal memuat riwayat stok.'
  } finally {
    loading.value = false
  }
}

watch(
  () => props.show,
  (newValue) => {
    if (newValue) {
      loadHistory(1)
    }
  },
)
</script>

<template>
  <Modal :show="show" @close="emit('close')" :title="`Riwayat Stok: ${product?.name}`">
    <div class="max-h-[80vh] overflow-y-auto">
      <div v-if="loading" class="text-center p-8">Memuat riwayat...</div>
      <div v-else-if="error" class="text-center p-8 text-accent">{{ error }}</div>
      <div v-else-if="history.length === 0" class="text-center p-8 text-text/60">
        Tidak ada riwayat pergerakan.
      </div>
      <table v-else class="min-w-full text-sm">
        <thead class="bg-secondary/10 text-xs uppercase text-text/70">
          <tr>
            <th class="p-2 text-left">Tanggal</th>
            <th class="p-2 text-left">Tipe</th>
            <th class="p-2 text-center">Jumlah</th>
            <th class="p-2 text-left">Dari</th>
            <th class="p-2 text-left">Ke</th>
            <th class="p-2 text-left">Oleh</th>
            <th class="p-2 text-left">Catatan</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-secondary/20">
          <tr v-for="item in history" :key="item.id" class="hover:bg-primary/5">
            <td class="p-2 whitespace-nowrap">
              {{ new Date(item.created_at).toLocaleString('id-ID') }}
            </td>
            <td class="p-2">{{ item.movement_type }}</td>
            <td class="p-2 text-center font-bold">{{ item.quantity }}</td>
            <td class="p-2 font-mono">{{ item.from_location || '-' }}</td>
            <td class="p-2 font-mono">{{ item.to_location || '-' }}</td>
            <td class="p-2">{{ item.user }}</td>
            <td class="p-2 text-xs text-text/80">{{ item.notes }}</td>
          </tr>
        </tbody>
      </table>
    </div>
    <!-- Paginasi Sederhana -->
    <div
      v-if="pagination.total > pagination.limit"
      class="flex justify-between items-center mt-4 text-sm"
    >
      <button
        @click="loadHistory(currentPage - 1)"
        :disabled="currentPage <= 1"
        class="px-3 py-1 rounded bg-secondary/20 disabled:opacity-50"
      >
        Sebelumnya
      </button>
      <span
        >Halaman {{ currentPage }} dari {{ Math.ceil(pagination.total / pagination.limit) }}</span
      >
      <button
        @click="loadHistory(currentPage + 1)"
        :disabled="currentPage * pagination.limit >= pagination.total"
        class="px-3 py-1 rounded bg-secondary/20 disabled:opacity-50"
      >
        Berikutnya
      </button>
    </div>
  </Modal>
</template>
