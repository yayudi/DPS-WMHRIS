<!-- frontend\src\components\fulfilment\FulfilmentListDetailsModal.vue -->
<script setup>
import { ref, watch } from 'vue'
import BaseModal from '@/components/ui/BaseModal.vue'
import { fetchFulfilmentDetails } from '@/api/helpers/fulfilment.js' // Helper baru
import { useMobile } from '@/composables/useMobile.js'

const { isMobile } = useMobile()

const props = defineProps({
  show: Boolean,
  item: Object // Menerima objek riwayat dari WMSFulfilmentListView
})

const emit = defineEmits(['close', 'void-confirmed'])

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
    const response = await fetchFulfilmentDetails(props.item.id)
    if (response.success && Array.isArray(response.data)) {
      items.value = response.data
    } else {
      items.value = [] // Set array kosong jika format salah
      throw new Error(response.message || 'Format data detail tidak sesuai.')
    }
  } catch (e) {
    console.error(e)
    error.value = 'Gagal memuat detail item.'
  } finally {
    loading.value = false
  }
}

// Watcher untuk memicu pemuatan data saat modal ditampilkan
watch(
  () => props.show,
  isShown => {
    if (isShown) {
      loadDetails()
    } else {
      // Reset state saat modal ditutup
      items.value = []
      error.value = null
      loading.value = false
    }
  }
)

// Fungsi untuk menangani konfirmasi pembatalan
function handleVoid() {
  if (!props.item?.id) return
  emit('void-confirmed', props.item.id)
}
</script>

<template>
  <BaseModal :show="show" @close="emit('close')" :title="`Detail Fulfilment #${item?.id}`">
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
        <table v-else class="text-xs" :class="isMobile ? 'w-full block' : 'min-w-full'">
          <thead class="bg-secondary/10 uppercase text-text/70 z-10" :class="isMobile ? 'hidden' : 'sticky top-0'">
            <tr>
              <th class="p-2 text-left">SKU</th>
              <th class="p-2 text-left">Nama Produk</th>
              <th class="p-2 text-center">Jumlah</th>
            </tr>
          </thead>
          <tbody :class="isMobile ? 'block' : 'divide-y divide-secondary/20'">
            <!-- Loop 'itemDetail' agar tidak konflik nama dengan prop 'item' -->
            <tr
              v-for="itemDetail in items"
              :key="itemDetail.sku"
              class="transition-colors"
              :class="isMobile ? 'block mb-3 p-3 bg-background/50 rounded-xl border border-secondary/20 shadow-sm' : ''"
            >
              <td
                :class="
                  isMobile ? 'flex justify-between items-center py-1.5 border-b border-secondary/10' : 'p-2 font-mono'
                "
              >
                <span v-if="isMobile" class="text-text/60 text-xs uppercase font-semibold">SKU</span>
                <span class="font-mono">{{ itemDetail.sku }}</span>
              </td>
              <td :class="isMobile ? 'flex justify-between items-center py-1.5 border-b border-secondary/10' : 'p-2'">
                <span v-if="isMobile" class="text-text/60 text-xs uppercase font-semibold">Produk</span>
                <span>{{ itemDetail.name }}</span>
              </td>
              <td :class="isMobile ? 'flex justify-between items-center py-1.5' : 'p-2 text-center font-bold'">
                <span v-if="isMobile" class="text-text/60 text-xs uppercase font-semibold">Jumlah</span>
                <span class="font-bold">{{ itemDetail.qty }}</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <template #footer>
      <button
        @click="emit('close')"
        class="px-4 py-2 bg-secondary/30 text-text/90 rounded-lg text-sm font-semibold hover:bg-secondary/40"
      >
        Tutup
      </button>
      <div class="flex-grow"></div>
      <!-- Tombol Void hanya muncul jika statusnya COMPLETED -->
      <button
        v-if="item?.status === 'COMPLETED'"
        @click="handleVoid"
        class="px-4 py-2 bg-accent text-secondary rounded-lg text-sm font-semibold hover:bg-accent/90"
      >
        Batalkan Transaksi (Void)
      </button>
    </template>
  </BaseModal>
</template>
