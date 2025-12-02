<!-- frontend\src\components\SaleReturnTab.vue -->
<script setup>
import { ref, onMounted, computed } from 'vue'
import { useRouter } from 'vue-router' // [NEW] Import Router
import { useToast } from '@/composables/UseToast.js'
import api from '@/api/axios'
import Modal from '@/components/Modal.vue'
import { FontAwesomeIcon } from '@fortawesome/vue-fontawesome'

const router = useRouter()
const { show } = useToast()

// --- STATE ---
const pendingReturns = ref([])
const locations = ref([])
const isLoading = ref(false)
const searchQuery = ref('')

// Modal State (Hanya untuk proses validasi, bukan input baru)
const showProcessModal = ref(false)

// Form Data: Process (Single Item)
const processForm = ref({
  itemId: null,
  itemData: null,
  targetLocationId: '',
  condition: 'GOOD',
  notes: '',
})

// --- FETCH DATA ---
async function fetchReturns() {
  isLoading.value = true
  try {
    const res = await api.get('/return/pending')
    pendingReturns.value = res.data.data
  } catch (e) {
    console.error(e)
  } finally {
    isLoading.value = false
  }
}

async function fetchHelpers() {
  try {
    const locRes = await api.get('/locations')
    locations.value = locRes.data.data || locRes.data
  } catch (e) {
    console.error('Gagal load helpers', e)
  }
}

// --- ACTIONS ---

// [NEW] Navigasi ke Halaman Input Manual (Full Page)
function goToManualPage() {
  router.push({ name: 'ManualReturn' })
}

function openProcessModal(item) {
  processForm.value = {
    itemId: item.id,
    itemData: item,
    targetLocationId: '',
    condition: 'GOOD',
    notes: '',
  }
  showProcessModal.value = true
}

async function submitProcess() {
  if (!processForm.value.targetLocationId) return show('Pilih lokasi tujuan!', 'warning')

  try {
    await api.post('/return/approve', {
      itemId: processForm.value.itemId,
      targetLocationId: processForm.value.targetLocationId,
      condition: processForm.value.condition,
      notes: processForm.value.notes,
    })
    show('Retur berhasil diproses. Stok bertambah.', 'success')
    showProcessModal.value = false
    fetchReturns()
  } catch (e) {
    show(e.response?.data?.message || 'Gagal memproses.', 'error')
  }
}

// --- COMPUTED ---
const filteredReturns = computed(() => {
  if (!searchQuery.value) return pendingReturns.value
  const q = searchQuery.value.toLowerCase()
  return pendingReturns.value.filter(
    (i) =>
      i.original_invoice_id.toLowerCase().includes(q) ||
      i.product_name.toLowerCase().includes(q) ||
      i.original_sku.toLowerCase().includes(q),
  )
})

onMounted(() => {
  fetchReturns()
  fetchHelpers()
})
</script>

<template>
  <div class="space-y-6 animate-fade-in">
    <!-- HEADER & CONTROLS -->
    <div
      class="flex flex-col md:flex-row justify-between gap-4 items-center bg-secondary/50 p-4 rounded-xl border border-secondary"
    >
      <div class="w-full md:w-auto flex-1">
        <input
          v-model="searchQuery"
          type="text"
          placeholder="Cari Invoice, SKU, atau Nama Barang..."
          class="w-full md:max-w-md px-4 py-2 rounded-lg bg-background border border-secondary/30 focus:border-primary outline-none"
        />
      </div>

      <!-- Tombol Pindah ke Halaman Manual -->
      <button
        @click="goToManualPage"
        class="bg-primary text-background px-4 py-2 rounded-lg font-bold hover:bg-primary/90 transition-all flex items-center gap-2 shadow-lg shadow-primary/20"
      >
        <font-awesome-icon icon="fa-solid fa-plus" /> Input Manual
      </button>
    </div>

    <!-- TABEL ANTRIAN RETUR -->
    <div class="bg-secondary/30 rounded-xl border border-secondary overflow-hidden shadow-sm">
      <table class="w-full text-left text-sm">
        <thead class="bg-secondary/20 text-primary uppercase text-xs font-bold">
          <tr>
            <th class="p-4">Invoice</th>
            <th class="p-4">Produk</th>
            <th class="p-4 text-center">Qty</th>
            <th class="p-4">Sumber</th>
            <th class="p-4 text-right">Aksi</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-secondary/10">
          <tr
            v-for="item in filteredReturns"
            :key="item.id"
            class="hover:bg-secondary/10 transition-colors"
          >
            <td class="p-4 font-mono font-bold">{{ item.original_invoice_id }}</td>
            <td class="p-4">
              <div class="font-bold">{{ item.original_sku }}</div>
              <div class="text-xs text-text/60">{{ item.product_name }}</div>
            </td>
            <td class="p-4 text-center font-bold text-lg">{{ item.quantity }}</td>
            <td class="p-4">
              <span
                class="px-2 py-1 rounded text-[10px] font-bold border"
                :class="{
                  'bg-success/10 text-success border-success/20': item.source === 'Tokopedia',
                  'bg-warning/10 text-warning border-warning/20': item.source === 'Shopee',
                  'bg-secondary/10 text-text/60 border-secondary': item.source === 'Offline',
                }"
              >
                {{ item.source }}
              </span>
            </td>
            <td class="p-4 text-right">
              <button
                @click="openProcessModal(item)"
                class="bg-success text-background px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-success/90 shadow-md shadow-success/20 flex items-center gap-2 ml-auto"
              >
                <font-awesome-icon icon="fa-solid fa-check" /> Proses
              </button>
            </td>
          </tr>
          <tr v-if="filteredReturns.length === 0">
            <td colspan="5" class="p-12 text-center text-text/40 italic">
              Tidak ada antrian retur.
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- MODAL PROSES (VALIDASI) -->
    <!-- Modal ini tetap ada untuk memproses item yang sudah masuk antrian -->
    <Modal
      :show="showProcessModal"
      @close="showProcessModal = false"
      title="Proses & Validasi Retur"
    >
      <div class="space-y-4">
        <div class="bg-secondary/10 p-3 rounded-lg text-sm border border-secondary">
          <p class="font-bold">{{ processForm.itemData?.product_name }}</p>
          <p class="text-xs mt-1">
            Invoice: {{ processForm.itemData?.original_invoice_id }} | Qty:
            {{ processForm.itemData?.quantity }}
          </p>
        </div>

        <div>
          <label class="text-xs font-bold uppercase text-text/50">Kondisi Barang</label>
          <div class="flex gap-2 mt-1">
            <button
              @click="processForm.condition = 'GOOD'"
              class="flex-1 py-2 rounded-lg border transition-all font-bold text-sm flex items-center justify-center gap-2"
              :class="
                processForm.condition === 'GOOD'
                  ? 'bg-success text-background border-success'
                  : 'bg-transparent border-secondary/30 text-text/50'
              "
            >
              <font-awesome-icon icon="fa-solid fa-thumbs-up" /> Bagus
            </button>
            <button
              @click="processForm.condition = 'BAD'"
              class="flex-1 py-2 rounded-lg border transition-all font-bold text-sm flex items-center justify-center gap-2"
              :class="
                processForm.condition === 'BAD'
                  ? 'bg-danger text-background border-danger'
                  : 'bg-transparent border-secondary/30 text-text/50'
              "
            >
              <font-awesome-icon icon="fa-solid fa-thumbs-down" /> Rusak
            </button>
          </div>
        </div>

        <div>
          <label class="text-xs font-bold uppercase text-text/50">Simpan Ke Lokasi</label>
          <select
            v-model="processForm.targetLocationId"
            class="w-full mt-1 px-3 py-2 bg-background border border-secondary/30 rounded-lg outline-none focus:border-primary"
          >
            <option value="" disabled>Pilih Lokasi...</option>
            <option v-for="loc in locations" :key="loc.id" :value="loc.id">
              {{ loc.code }} - {{ loc.name }}
            </option>
          </select>
        </div>

        <div>
          <label class="text-xs font-bold uppercase text-text/50">Catatan (Opsional)</label>
          <input
            v-model="processForm.notes"
            type="text"
            class="w-full mt-1 px-3 py-2 bg-background border border-secondary/30 rounded-lg outline-none focus:border-primary"
          />
        </div>

        <button
          @click="submitProcess"
          class="w-full bg-primary text-background py-3 rounded-xl font-bold hover:bg-primary/90 mt-4"
        >
          Simpan & Update Stok
        </button>
      </div>
    </Modal>
  </div>
</template>

<style scoped>
.animate-fade-in {
  animation: fadeIn 0.4s ease-out forwards;
}
@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
</style>
