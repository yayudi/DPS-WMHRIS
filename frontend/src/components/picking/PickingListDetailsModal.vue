<!-- frontend\src\components\picking\PickingListDetailsModal.vue -->
<script setup>
import { ref, watch } from 'vue'
import Modal from '@/components/ui/Modal.vue'
import { useToast } from '@/composables/useToast.js'
import { fetchPickingDetails } from '@/api/helpers/picking.js' // Helper baru

const props = defineProps({
  show: Boolean,
  item: Object, // Menerima objek riwayat dari WMSPickingListView
})

const emit = defineEmits(['close', 'void-confirmed'])
const { show: showToast } = useToast()

const items = ref([])
const loading = ref(false)
const error = ref(null)

// Fungsi untuk memuat detail item saat modal dibuka
async function loadDetails() {
  if (!props.item?.id) {
    // Cek props.item.id
    items.value = [] // Kosongkan jika item tidak valid
    return
  }
  loading.value = true
  error.value = null
  try {
    const response = await fetchPickingDetails(props.item.id)
    if (response.success && Array.isArray(response.data)) {
      items.value = response.data
    } else {
      items.value = [] // Set array kosong jika format salah
      throw new Error(response.message || 'Format data detail tidak sesuai.')
    }
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
    } else {
      // Reset state saat modal ditutup
      items.value = []
      error.value = null
      loading.value = false
    }
  },
)

// Fungsi untuk menangani konfirmasi pembatalan
function handleVoid() {
  if (!props.item?.id) return
  emit('void-confirmed', props.item.id)
}
</script>

<template>
  <Modal :show="show" @close="emit('close')" :title="`Detail Picking List #${item?.id}`">
    <div class="space-y-4">
      <!-- Informasi Header -->
      <div v-if="item" class="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm bg-secondary/10 p-3 rounded-lg">
        <div>
          <div class="text-xs text-text/70">Waktu Proses</div>
          <div class="font-semibold">{{ new Date(item.created_at).toLocaleString('id-ID') }}</div>
        </div>
        <div>
          <div class="text-xs text-text/70">Sumber</div>
          <div class="font-semibold">{{ item.source }}</div>
        </div>
        <div>
          <div class="text-xs text-text/70">Oleh</div>
          <div class="font-semibold">{{ item.username }}</div>
        </div>
      </div>

      <!-- Tabel Detail Item -->
      <div class="max-h-[40vh] overflow-y-auto border border-secondary/20 rounded-lg">
        <div v-if="loading" class="text-center p-8 text-text/70 italic">Memuat detail...</div>
        <div v-else-if="error" class="text-center p-8 text-accent">{{ error }}</div>
        <!-- Pastikan items adalah array sebelum v-for -->
        <div v-else-if="!items || items.length === 0" class="text-center p-8 text-text/60 italic">
          Tidak ada detail item.
        </div>
        <table v-else class="min-w-full text-xs">
          <thead class="bg-secondary/10 uppercase text-text/70 sticky top-0 z-10">
            <tr>
              <th class="p-2 text-left">SKU</th>
              <th class="p-2 text-left">Nama Produk</th>
              <th class="p-2 text-center">Jumlah</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-secondary/20">
            <!-- Loop 'itemDetail' agar tidak konflik nama dengan prop 'item' -->
            <tr v-for="itemDetail in items" :key="itemDetail.sku">
              <td class="p-2 font-mono">{{ itemDetail.sku }}</td>
              <td class="p-2">{{ itemDetail.name }}</td>
              <td class="p-2 text-center font-bold">{{ itemDetail.qty }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <template #footer>
      <button @click="emit('close')"
        class="px-4 py-2 bg-secondary/30 text-text/90 rounded-lg text-sm font-semibold hover:bg-secondary/40">
        Tutup
      </button>
      <div class="flex-grow"></div>
      <!-- Tombol Void hanya muncul jika statusnya COMPLETED -->
      <button v-if="item?.status === 'COMPLETED'" @click="handleVoid"
        class="px-4 py-2 bg-accent text-secondary rounded-lg text-sm font-semibold hover:bg-accent/90">
        Batalkan Transaksi (Void)
      </button>
    </template>
  </Modal>
</template>
