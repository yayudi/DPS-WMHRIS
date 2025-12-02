<script setup>
import { ref, onMounted, computed, toRaw } from 'vue'
import { useToast } from '@/composables/UseToast.js'
import api from '@/api/axios'
import Modal from '@/components/Modal.vue'
import ProductSearchSelector from '@/components/transfer/ProductSearchSelector.vue'
import { FontAwesomeIcon } from '@fortawesome/vue-fontawesome' // Pastikan import ini ada jika pakai icon

const { show } = useToast()

// --- STATE ---
const pendingReturns = ref([])
const locations = ref([])
const isLoading = ref(false)
const searchQuery = ref('')

// Modal States
const showProcessModal = ref(false)
const showManualModal = ref(false)

// Form Data: Process (Single Item)
const processForm = ref({
  itemId: null,
  itemData: null,
  targetLocationId: '',
  condition: 'GOOD',
  notes: '',
})

// [MODIFIED] Form Data: Manual Input (Multi Item)
const manualForm = ref({
  invoiceId: '',
  // Default mulai dengan 1 baris kosong
  items: [{ selectedProduct: null, quantity: 1, notes: '' }],
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

// [NEW] Helper untuk menambah baris item
function addManualItemRow() {
  manualForm.value.items.push({
    selectedProduct: null,
    quantity: 1,
    notes: '',
  })
}

// [NEW] Helper untuk menghapus baris item
function removeManualItemRow(index) {
  if (manualForm.value.items.length > 1) {
    manualForm.value.items.splice(index, 1)
  } else {
    show('Minimal harus ada 1 barang.', 'warning')
  }
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

// [MODIFIED] Submit Manual (Multi Item Logic)
async function submitManual() {
  const formData = toRaw(manualForm.value)
  console.log('Submitting Batch Return:', formData)

  // 1. Validasi Invoice (Header)
  if (!formData.invoiceId || formData.invoiceId.trim() === '') {
    return show('Nomor Invoice wajib diisi!', 'warning')
  }

  // 2. Validasi Item Loop
  const validItems = []

  for (const [index, item] of formData.items.entries()) {
    // Cek Produk
    if (!item.selectedProduct) {
      return show(`Baris ke-${index + 1}: Produk belum dipilih!`, 'warning')
    }

    // Cek ID Produk
    const productId = item.selectedProduct.id || item.selectedProduct.product_id
    if (!productId) {
      return show(`Baris ke-${index + 1}: Data produk korup.`, 'error')
    }

    // Cek Qty
    if (!item.quantity || item.quantity < 1) {
      return show(`Baris ke-${index + 1}: Qty minimal 1.`, 'warning')
    }

    // Masukkan ke array payload bersih
    validItems.push({
      invoiceId: formData.invoiceId, // Pakai invoice yg sama untuk semua item
      productId: productId,
      quantity: item.quantity,
      notes: item.notes,
    })
  }

  try {
    isLoading.value = true

    // Kirim request secara paralel (Promise.all)
    // Strategi ini dipilih agar BACKEND TIDAK PERLU DIUBAH (tetap terima per item)
    // Jika backend sudah support bulk insert, ganti ini dengan 1 request array.
    const promises = validItems.map((payload) => api.post('/return/manual-entry', payload))

    await Promise.all(promises)

    show(`Berhasil mendaftarkan ${validItems.length} item ke antrian retur.`, 'success')
    showManualModal.value = false

    // Reset Form
    manualForm.value = {
      invoiceId: '',
      items: [{ selectedProduct: null, quantity: 1, notes: '' }],
    }
    fetchReturns()
  } catch (e) {
    console.error('Submit Batch Error:', e)
    const msg = e.response?.data?.message || 'Gagal input sebagian/seluruh data.'
    show(msg, 'error')
  } finally {
    isLoading.value = false
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
    <div
      class="flex flex-col md:flex-row justify-between gap-4 items-center bg-secondary/50 p-4 rounded-xl border border-secondary/20"
    >
      <div class="w-full md:w-auto flex-1">
        <input
          v-model="searchQuery"
          type="text"
          placeholder="Cari Invoice, SKU, atau Nama Barang..."
          class="w-full md:max-w-md px-4 py-2 rounded-lg bg-background border border-secondary/30 focus:border-primary outline-none"
        />
      </div>
      <button
        @click="showManualModal = true"
        class="bg-primary text-white px-4 py-2 rounded-lg font-bold hover:bg-primary/90 transition-all flex items-center gap-2 shadow-lg shadow-primary/20"
      >
        <font-awesome-icon icon="fa-solid fa-plus" /> Input Manual
      </button>
    </div>

    <div class="bg-secondary/30 rounded-xl border border-secondary/20 overflow-hidden shadow-sm">
      <table class="w-full text-left text-sm">
        <thead class="bg-secondary/20 text-text/60 uppercase text-xs font-bold">
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
                  'bg-secondary/10 text-text/60 border-secondary/20': item.source === 'Offline',
                }"
              >
                {{ item.source }}
              </span>
            </td>
            <td class="p-4 text-right">
              <button
                @click="openProcessModal(item)"
                class="bg-success text-white px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-success/90 shadow-md shadow-success/20 flex items-center gap-2 ml-auto"
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

    <Modal
      :show="showProcessModal"
      @close="showProcessModal = false"
      title="Proses & Validasi Retur"
    >
      <div class="space-y-4">
        <div class="bg-secondary/10 p-3 rounded-lg text-sm border border-secondary/20">
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
                  ? 'bg-success text-white border-success'
                  : 'bg-transparent border-secondary/30 text-text/50'
              "
            >
              <font-awesome-icon icon="fa-solid fa-thumbs-up" /> Bagus / Layak Jual
            </button>
            <button
              @click="processForm.condition = 'BAD'"
              class="flex-1 py-2 rounded-lg border transition-all font-bold text-sm flex items-center justify-center gap-2"
              :class="
                processForm.condition === 'BAD'
                  ? 'bg-danger text-white border-danger'
                  : 'bg-transparent border-secondary/30 text-text/50'
              "
            >
              <font-awesome-icon icon="fa-solid fa-thumbs-down" /> Rusak / BS
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
          <p class="text-[10px] text-text/40 mt-1">
            *Pilih rak display untuk barang bagus, atau rak reject untuk barang rusak.
          </p>
        </div>

        <div>
          <label class="text-xs font-bold uppercase text-text/50">Catatan (Opsional)</label>
          <input
            v-model="processForm.notes"
            type="text"
            placeholder="Alasan retur..."
            class="w-full mt-1 px-3 py-2 bg-background border border-secondary/30 rounded-lg outline-none focus:border-primary"
          />
        </div>

        <button
          @click="submitProcess"
          class="w-full bg-primary text-white py-3 rounded-xl font-bold hover:bg-primary/90 mt-4"
        >
          Simpan & Update Stok
        </button>
      </div>
    </Modal>

    <Modal
      :show="showManualModal"
      @close="showManualModal = false"
      title="Input Retur Manual"
      maxWidth="max-w-3xl"
    >
      <div class="flex flex-col h-full max-h-[80vh]">
        <div class="px-1 pb-4 mb-2 border-b border-secondary/10">
          <div
            class="flex flex-col sm:flex-row gap-4 items-start sm:items-center bg-blue-50/50 p-3 rounded-lg border border-blue-100"
          >
            <div class="min-w-[120px]">
              <label class="text-[10px] font-bold uppercase text-blue-800 tracking-wider"
                >Nomor Invoice</label
              >
            </div>
            <input
              v-model="manualForm.invoiceId"
              type="text"
              placeholder="Scan atau ketik INV/..."
              class="flex-1 w-full bg-white border border-blue-200 rounded px-3 py-1.5 text-sm font-mono font-bold focus:ring-2 focus:ring-blue-400 outline-none placeholder:font-sans placeholder:font-normal"
            />
          </div>
        </div>

        <div class="flex-1 overflow-y-auto pr-2 custom-scrollbar space-y-2">
          <div
            v-if="manualForm.items.length > 0"
            class="hidden md:flex px-3 text-[10px] font-bold text-text/40 uppercase tracking-wide pb-1"
          >
            <div class="w-8 text-center">#</div>
            <div class="flex-1 px-2">Produk</div>
            <div class="w-20 px-2 text-center">Qty</div>
            <div class="w-1/3 px-2">Catatan</div>
            <div class="w-8"></div>
          </div>

          <div
            v-for="(item, index) in manualForm.items"
            :key="index"
            class="group relative bg-white border border-secondary/20 rounded-lg p-2 hover:border-primary/50 hover:shadow-sm transition-all flex flex-col md:flex-row gap-3 items-start md:items-center"
          >
            <div
              class="hidden md:flex w-8 h-8 items-center justify-center bg-secondary/10 rounded-full text-xs font-bold text-text/50"
            >
              {{ index + 1 }}
            </div>

            <div
              class="md:hidden absolute -top-2 -left-2 w-6 h-6 bg-secondary text-white text-[10px] flex items-center justify-center rounded-full shadow-sm z-10"
            >
              {{ index + 1 }}
            </div>

            <div class="w-full md:flex-1 min-w-0">
              <ProductSearchSelector
                v-model="item.selectedProduct"
                placeholder="Cari SKU / Nama Barang..."
                class="text-sm"
              />
              <div
                v-if="item.selectedProduct"
                class="md:hidden mt-1 text-[10px] text-green-600 truncate"
              >
                <font-awesome-icon icon="fa-solid fa-check" /> {{ item.selectedProduct.name }}
              </div>
            </div>

            <div class="flex w-full md:w-auto gap-2 items-center">
              <div class="w-20 md:w-20 shrink-0">
                <div class="md:hidden text-[10px] font-bold mb-1 text-text/40">QTY</div>
                <input
                  v-model="item.quantity"
                  type="number"
                  min="1"
                  class="w-full text-center bg-secondary/5 border border-secondary/20 rounded px-2 py-1.5 text-sm font-bold focus:border-primary outline-none"
                />
              </div>

              <div class="flex-1 md:w-[33%] md:flex-none">
                <div class="md:hidden text-[10px] font-bold mb-1 text-text/40">CATATAN</div>
                <input
                  v-model="item.notes"
                  type="text"
                  placeholder="Ket. kondisi..."
                  class="w-full bg-secondary/5 border border-secondary/20 rounded px-3 py-1.5 text-sm focus:border-primary outline-none"
                />
              </div>

              <button
                @click="removeManualItemRow(index)"
                class="w-8 h-8 flex items-center justify-center text-text/30 hover:text-danger hover:bg-danger/10 rounded-lg transition-all"
                title="Hapus baris"
              >
                <font-awesome-icon icon="fa-solid fa-trash-alt" />
              </button>
            </div>
          </div>
        </div>

        <div class="pt-4 mt-2 border-t border-secondary/10 space-y-3">
          <button
            @click="addManualItemRow"
            class="w-full py-2 border border-dashed border-secondary/30 rounded-lg text-text/50 text-sm font-bold hover:bg-secondary/5 hover:border-primary/50 hover:text-primary transition-all flex items-center justify-center gap-2"
          >
            <font-awesome-icon icon="fa-solid fa-plus" /> Tambah Baris Baru
          </button>

          <button
            @click="submitManual"
            :disabled="isLoading"
            class="w-full bg-primary text-white py-3 rounded-xl font-bold shadow-lg shadow-primary/20 hover:bg-primary/90 transition-all flex justify-between px-6 items-center"
          >
            <span class="text-xs font-normal opacity-80"
              >Total {{ manualForm.items.length }} Item</span
            >
            <div class="flex items-center gap-2">
              <span v-if="isLoading">Memproses...</span>
              <span v-else>Simpan Retur</span>
              <font-awesome-icon v-if="isLoading" icon="fa-solid fa-spinner" spin />
              <font-awesome-icon v-else icon="fa-solid fa-paper-plane" />
            </div>
          </button>
        </div>
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

/* Scrollbar tipis untuk list item */
.custom-scrollbar::-webkit-scrollbar {
  width: 4px;
}
.custom-scrollbar::-webkit-scrollbar-track {
  background: transparent;
}
.custom-scrollbar::-webkit-scrollbar-thumb {
  background: rgba(0, 0, 0, 0.1);
  border-radius: 4px;
}
</style>
