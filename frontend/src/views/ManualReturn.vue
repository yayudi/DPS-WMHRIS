<!-- frontend\src\views\ManualReturn.vue -->
<script setup>
import { ref, onMounted, toRaw } from 'vue'
import { useRouter } from 'vue-router'
import { useToast } from '@/composables/UseToast.js'
import api from '@/api/axios'
import ProductSearchSelector from '@/components/transfer/ProductSearchSelector.vue'
import { FontAwesomeIcon } from '@fortawesome/vue-fontawesome'

const router = useRouter()
const { show } = useToast()

// --- STATE ---
const isLoading = ref(false)
const locations = ref([])

// Form Data
const form = ref({
  invoiceId: '',
  items: [{ selectedProduct: null, quantity: 1, condition: 'GOOD', locationId: '', notes: '' }],
})

// --- FETCH HELPERS ---
async function fetchHelpers() {
  try {
    const locRes = await api.get('/locations')
    locations.value = locRes.data.data || locRes.data
  } catch (e) {
    console.error('Gagal load helpers', e)
  }
}

// --- ACTIONS ---
function addItemRow() {
  form.value.items.push({
    selectedProduct: null,
    quantity: 1,
    condition: 'GOOD',
    locationId: '',
    notes: '',
  })
  // Scroll ke bawah otomatis
  setTimeout(() => {
    window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' })
  }, 100)
}

function removeItemRow(index) {
  if (form.value.items.length > 1) {
    form.value.items.splice(index, 1)
  } else {
    show('Minimal harus ada 1 barang.', 'warning')
  }
}

// [LOGIKA BARU: AUTO-PROCESS]
async function submitForm() {
  const formData = toRaw(form.value)
  if (!formData.invoiceId || formData.invoiceId.trim() === '')
    return show('Nomor Invoice wajib diisi!', 'warning')

  // 1. Validasi Input di Awal
  const validItems = []
  for (const [index, item] of formData.items.entries()) {
    if (!item.selectedProduct)
      return show(`Baris ke-${index + 1}: Produk belum dipilih!`, 'warning')
    const productId = item.selectedProduct.id || item.selectedProduct.product_id
    if (!productId) return show(`Baris ke-${index + 1}: Data produk korup.`, 'error')
    if (!item.quantity || item.quantity < 1)
      return show(`Baris ke-${index + 1}: Qty minimal 1.`, 'warning')
    if (!item.locationId) return show(`Baris ke-${index + 1}: Lokasi belum dipilih!`, 'warning')

    validItems.push({
      invoiceId: formData.invoiceId,
      productId: productId,
      quantity: item.quantity,
      condition: item.condition,
      targetLocationId: item.locationId,
      notes: item.notes,
    })
  }

  try {
    isLoading.value = true

    // 2. Eksekusi Berurutan (Create -> Approve) untuk setiap item
    // Kita gunakan for...of agar bisa await satu per satu (lebih aman daripada Promise.all untuk transaksi sekuensial)
    let successCount = 0

    for (const itemPayload of validItems) {
      try {
        // Create Ticket (Status: PENDING)
        const createRes = await api.post('/return/manual-entry', itemPayload)

        // Ambil ID item yang baru dibuat dari respon backend
        // Struktur respon biasanya: res.data.data.id atau res.data.id
        const newItem = createRes.data.data || createRes.data
        const newItemId = newItem?.id || newItem?.insertId // Handle variasi respon mysql/node

        if (newItemId) {
          // Auto Approve (Status: COMPLETED & Stok Bertambah)
          await api.post('/return/approve', {
            itemId: newItemId,
            targetLocationId: itemPayload.targetLocationId,
            condition: itemPayload.condition,
            notes: itemPayload.notes,
          })
          successCount++
        } else {
          console.warn('Gagal auto-approve: ID item tidak dikembalikan oleh backend.')
        }
      } catch (err) {
        console.error('Gagal memproses item:', itemPayload, err)
        // Lanjutkan ke item berikutnya meskipun satu gagal (Partial Success)
      }
    }

    if (successCount > 0) {
      show(`Berhasil menyimpan & memproses ${successCount} item.`, 'success')
      router.go(-1)
    } else {
      show('Gagal memproses data. Cek koneksi.', 'error')
    }
  } catch (e) {
    console.error('Submit Error:', e)
    show(e.response?.data?.message || 'Terjadi kesalahan sistem.', 'error')
  } finally {
    isLoading.value = false
  }
}

function goBack() {
  router.go(-1)
}

onMounted(() => {
  fetchHelpers()
})
</script>

<template>
  <div class="min-h-screen bg-gray-50 flex flex-col">
    <!-- 1. PAGE HEADER (Transparent, Blending) -->
    <div class="px-6 py-6 pb-2">
      <div
        class="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-4"
      >
        <!-- Title & Breadcrumb Style -->
        <div class="flex items-center gap-4">
          <button
            @click="goBack"
            class="w-10 h-10 flex items-center justify-center rounded-full bg-white border border-gray-200 text-gray-500 hover:bg-gray-100 hover:text-gray-800 transition-all shadow-sm"
          >
            <font-awesome-icon icon="fa-solid fa-arrow-left" />
          </button>
          <div>
            <h1 class="text-2xl font-bold text-gray-800">Input Retur Manual</h1>
            <p class="text-sm text-gray-500">Barang akan langsung masuk ke stok (Auto-Approve).</p>
          </div>
        </div>

        <!-- Invoice Input (Header Style) -->
        <div class="w-full md:w-96">
          <div class="relative group">
            <div class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <span class="text-gray-400 font-bold text-xs">#INV</span>
            </div>
            <input
              v-model="form.invoiceId"
              type="text"
              placeholder="Nomor Invoice / Customer..."
              class="w-full pl-12 pr-4 py-3 bg-white border border-gray-300 rounded-xl text-gray-800 font-mono font-bold focus:ring-4 focus:ring-primary/10 focus:border-primary transition-all shadow-sm group-hover:border-primary/50"
            />
          </div>
        </div>
      </div>
    </div>

    <!-- 2. MAIN CONTENT (Wide Table Layout) -->
    <div class="flex-1 px-6 py-6 pb-32">
      <div class="max-w-7xl mx-auto">
        <!-- Table Container -->
        <div class="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
          <!-- Table Header -->
          <div
            class="hidden md:flex bg-gray-50/50 border-b border-gray-200 px-6 py-3 items-center gap-4 text-xs font-bold text-gray-500 uppercase tracking-wider"
          >
            <div class="w-8 text-center">#</div>
            <div class="flex-1">Produk</div>
            <div class="w-32">Kondisi</div>
            <div class="w-40">Lokasi Simpan</div>
            <div class="w-24 text-center">Qty</div>
            <div class="w-1/3">Catatan</div>
            <div class="w-10"></div>
          </div>

          <!-- Table Body -->
          <div class="divide-y divide-gray-100">
            <div
              v-for="(item, index) in form.items"
              :key="index"
              class="group p-4 md:px-6 md:py-4 flex flex-col md:flex-row gap-4 md:items-start hover:bg-gray-50 transition-colors"
            >
              <!-- Nomor Urut -->
              <div
                class="hidden md:flex w-8 h-10 items-center justify-center text-sm font-bold text-gray-400"
              >
                {{ index + 1 }}
              </div>
              <div class="md:hidden flex items-center gap-2 mb-2">
                <span class="bg-gray-100 text-gray-500 text-[10px] font-bold px-2 py-1 rounded"
                  >Item #{{ index + 1 }}</span
                >
              </div>

              <!-- 1. Produk -->
              <div class="w-full md:flex-1 min-w-0">
                <ProductSearchSelector
                  v-model="item.selectedProduct"
                  placeholder="Cari SKU atau Nama Barang..."
                />
                <!-- Mobile Feedback -->
                <div
                  v-if="item.selectedProduct"
                  class="md:hidden mt-1.5 text-xs text-green-600 font-medium"
                >
                  <font-awesome-icon icon="fa-solid fa-check-circle" />
                  {{ item.selectedProduct.name }}
                </div>
              </div>

              <!-- Wrapper Fields Baris 2 (Mobile) -->
              <div class="flex flex-wrap md:flex-nowrap gap-3 items-start w-full md:w-auto">
                <!-- 2. Kondisi -->
                <div class="w-[48%] md:w-32">
                  <div class="relative">
                    <select
                      v-model="item.condition"
                      class="w-full pl-3 pr-8 py-2.5 bg-white border border-gray-300 rounded-lg text-sm font-bold appearance-none outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                      :class="
                        item.condition === 'GOOD'
                          ? 'text-green-600 border-green-200 bg-green-50/30'
                          : 'text-red-600 border-red-200 bg-red-50/30'
                      "
                    >
                      <option value="GOOD">Bagus</option>
                      <option value="BAD">Rusak</option>
                    </select>
                    <div
                      class="absolute inset-y-0 right-3 flex items-center pointer-events-none text-gray-400"
                    >
                      <font-awesome-icon icon="fa-solid fa-chevron-down" size="xs" />
                    </div>
                  </div>
                </div>

                <!-- 3. Lokasi -->
                <div class="w-[48%] md:w-40">
                  <div class="relative">
                    <select
                      v-model="item.locationId"
                      class="w-full pl-3 pr-8 py-2.5 bg-white border border-gray-300 rounded-lg text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary appearance-none"
                    >
                      <option value="" disabled>Pilih Lokasi...</option>
                      <option v-for="loc in locations" :key="loc.id" :value="loc.id">
                        {{ loc.code }}
                      </option>
                    </select>
                    <div
                      class="absolute inset-y-0 right-3 flex items-center pointer-events-none text-gray-400"
                    >
                      <font-awesome-icon icon="fa-solid fa-map-marker-alt" size="xs" />
                    </div>
                  </div>
                </div>

                <!-- 4. Qty -->
                <div class="w-full md:w-24">
                  <div
                    class="flex items-center border border-gray-300 rounded-lg overflow-hidden bg-white"
                  >
                    <input
                      v-model="item.quantity"
                      type="number"
                      min="1"
                      class="w-full text-center py-2.5 text-sm font-bold outline-none focus:bg-gray-50"
                      placeholder="Qty"
                    />
                  </div>
                </div>

                <!-- 5. Catatan -->
                <div class="w-full md:w-1/3 min-w-[200px]">
                  <input
                    v-model="item.notes"
                    type="text"
                    placeholder="Catatan (Opsional)..."
                    class="w-full px-3 py-2.5 bg-white border border-gray-300 rounded-lg text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                  />
                </div>

                <!-- 6. Hapus -->
                <div class="w-full md:w-10 flex justify-end md:justify-center md:pt-1">
                  <button
                    @click="removeItemRow(index)"
                    class="w-8 h-8 flex items-center justify-center text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                    title="Hapus baris ini"
                  >
                    <font-awesome-icon icon="fa-solid fa-trash-alt" />
                  </button>
                </div>
              </div>
            </div>
          </div>

          <!-- Empty State -->
          <div
            v-if="form.items.length === 0"
            class="py-12 flex flex-col items-center justify-center text-gray-400"
          >
            <div class="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mb-3">
              <font-awesome-icon icon="fa-solid fa-box-open" class="text-2xl text-gray-300" />
            </div>
            <p class="text-sm">Belum ada barang yang ditambahkan.</p>
            <button @click="addItemRow" class="mt-4 text-primary font-bold text-sm hover:underline">
              + Tambah Barang Pertama
            </button>
          </div>

          <!-- Add Row Action -->
          <div class="bg-gray-50 border-t border-gray-200 p-3">
            <button
              @click="addItemRow"
              class="w-full py-3 border-2 border-dashed border-gray-300 rounded-xl text-gray-500 font-bold text-sm hover:border-primary hover:text-primary hover:bg-white transition-all flex items-center justify-center gap-2"
            >
              <font-awesome-icon icon="fa-solid fa-plus-circle" /> Tambah Baris Baru
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- 3. FOOTER ACTIONS -->
    <div
      class="fixed bottom-0 left-0 w-full bg-white/90 backdrop-blur-sm border-t border-gray-200 py-4 px-6 z-30"
    >
      <div class="max-w-7xl mx-auto flex items-center justify-between">
        <div class="hidden md:flex flex-col">
          <span class="text-xs text-gray-500 font-bold uppercase">Total Item</span>
          <span class="text-xl font-bold text-gray-800"
            >{{ form.items.length }}
            <span class="text-sm font-normal text-gray-500">Baris</span></span
          >
        </div>

        <div class="flex gap-4 w-full md:w-auto">
          <button
            @click="goBack"
            class="flex-1 md:flex-none px-6 py-3 rounded-xl border border-gray-300 text-gray-600 font-bold hover:bg-gray-50 transition-all"
          >
            Batal
          </button>

          <button
            @click="submitForm"
            :disabled="isLoading"
            class="flex-1 md:flex-none md:w-64 bg-primary text-white px-6 py-3 rounded-xl font-bold text-lg hover:bg-primary/90 shadow-lg shadow-primary/20 flex items-center justify-center gap-2 transition-all disabled:opacity-70 disabled:cursor-not-allowed"
          >
            <span v-if="isLoading">Memproses...</span>
            <span v-else>Simpan & Auto-Approve</span>
            <font-awesome-icon v-if="isLoading" icon="fa-solid fa-spinner" spin />
            <font-awesome-icon v-else icon="fa-solid fa-bolt" />
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.transition-all {
  transition-property: all;
  transition-timing-function: cubic-bezier(0.4, 0, 0.2, 1);
  transition-duration: 200ms;
}
</style>
