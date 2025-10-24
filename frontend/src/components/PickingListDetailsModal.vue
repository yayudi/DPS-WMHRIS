<script setup>
import { ref, watch } from 'vue'
import Modal from '@/components/Modal.vue'
import { useToast } from '@/composables/UseToast.js'
import { fetchPickingListDetails } from '@/api/helpers/picking.js' // Helper baru

const props = defineProps({
  show: Boolean,
  list: Object, // Menerima objek riwayat dari WMSPickingListView
})

const emit = defineEmits(['close', 'void-confirmed'])
const { show: showToast } = useToast()

const items = ref([])
const loading = ref(false)
const error = ref(null)

// Fungsi untuk memuat detail item saat modal dibuka
async function loadDetails() {
  if (!props.list) return
  loading.value = true
  error.value = null
  try {
    const response = await fetchPickingListDetails(props.list.id)
    items.value = response.data
  } catch (err) {
    error.value = 'Gagal memuat detail item.'
    showToast(error.value, 'error')
  } finally {
    loading.value = false
  }
}

// Watcher untuk memicu pemuatan data saat modal ditampilkan
watch(
  () => props.show,
  (isShown) => {
    if (isShown) {
      loadDetails()
    }
  },
)

// Fungsi untuk menangani konfirmasi pembatalan
function handleVoid() {
  if (
    confirm(
      `Apakah Anda yakin ingin membatalkan (void) transaksi ini? Stok akan dikembalikan ke lokasi semula.`,
    )
  ) {
    emit('void-confirmed', props.list.id)
  }
}
</script>

<template>
  <Modal :show="show" @close="emit('close')" :title="`Detail Picking List #${list?.id}`">
    <div class="space-y-4">
      <!-- Informasi Header -->
      <div v-if="list" class="grid grid-cols-3 gap-4 text-sm bg-secondary/10 p-3 rounded-lg">
        <div>
          <div class="text-xs text-text/70">Waktu Proses</div>
          <div class="font-semibold">{{ new Date(list.created_at).toLocaleString('id-ID') }}</div>
        </div>
        <div>
          <div class="text-xs text-text/70">Sumber</div>
          <div class="font-semibold">{{ list.source }}</div>
        </div>
        <div>
          <div class="text-xs text-text/70">Oleh</div>
          <div class="font-semibold">{{ list.username }}</div>
        </div>
      </div>

      <!-- Tabel Detail Item -->
      <div class="max-h-[40vh] overflow-y-auto">
        <div v-if="loading" class="text-center p-8">Memuat detail...</div>
        <div v-else-if="error" class="text-center p-8 text-accent">{{ error }}</div>
        <table v-else class="min-w-full text-xs">
          <thead class="bg-secondary/10 uppercase text-text/70 sticky top-0">
            <tr>
              <th class="p-2 text-left">SKU</th>
              <th class="p-2 text-left">Nama Produk</th>
              <th class="p-2 text-center">Jumlah</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-secondary/20">
            <tr v-for="item in items" :key="item.sku">
              <td class="p-2 font-mono">{{ item.sku }}</td>
              <td class="p-2">{{ item.name }}</td>
              <td class="p-2 text-center font-bold">{{ item.qty }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <template #footer>
      <button @click="emit('close')" class="btn-secondary">Tutup</button>
      <div class="flex-grow"></div>
      <!-- Tombol Void hanya muncul jika statusnya COMPLETED -->
      <button
        v-if="list?.status === 'COMPLETED'"
        @click="handleVoid"
        class="px-4 py-2 bg-accent text-white rounded-lg text-sm font-semibold hover:bg-accent/90"
      >
        Batalkan Transaksi (Void)
      </button>
    </template>
  </Modal>
</template>

<style scoped>
.btn-secondary {
  @apply px-4 py-2 bg-secondary/20 text-text/80 rounded-lg text-sm font-semibold;
}
</style>
