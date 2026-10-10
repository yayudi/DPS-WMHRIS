<script setup>
import { ref, watch, onMounted } from 'vue'
import { useLocalStorage } from '@vueuse/core'
import { useToast } from '@/composables/useToast'
import { fetchMyLocations } from '@/api/helpers/user'
import { useMasterDataStore } from '@/stores/masterData'
import { stockRequestApi } from '@/modules/wms/infrastructure/stockRequest.api'
import ProductSearchAddForm from '@/modules/wms/presentation/components/transfer/ProductSearchAddForm.vue'
import BatchItemList from '@/modules/wms/presentation/components/transfer/BatchItemList.vue'
import { swalConfirm } from '@/composables/useSweetAlert'
import Swal from 'sweetalert2'

defineProps({
  isOpen: {
    type: Boolean,
    required: true
  }
})

const emit = defineEmits(['close', 'request-created'])
const { toast } = useToast()
const isLoading = ref(false)
const myLocations = ref([])
const allLocations = ref([])
const fromLocationId = useLocalStorage('draft-sr-from', null)
const toLocationId = useLocalStorage('draft-sr-to', null)
const notes = useLocalStorage('draft-sr-notes', '')
const type = useLocalStorage('draft-sr-type', 'TRANSFER')
const batchList = useLocalStorage('draft-sr-batch', [])

onMounted(async () => {
  try {
    const masterData = useMasterDataStore()
    const [myLocs, allLocs] = await Promise.all([fetchMyLocations(), masterData.getLocations()])
    myLocations.value = myLocs
    allLocations.value = allLocs
  } catch (error) {
    console.error(error)
  }
})

// Auto-select toLocation if user only has 1 location
watch(
  () => myLocations.value,
  newLocs => {
    if (newLocs.length === 1 && !toLocationId.value) {
      toLocationId.value = newLocs[0].id
    }
  }
)

let isRevertingFromLoc = false
watch(fromLocationId, async (newVal, oldVal) => {
  if (isRevertingFromLoc) {
    isRevertingFromLoc = false
    return
  }
  if (batchList.value.length > 0 && newVal && oldVal && newVal !== oldVal) {
    const isConfirmed = await swalConfirm(
      'Reset Daftar Produk?',
      'Mengubah lokasi asal akan mereset seluruh daftar produk yang sudah dipilih. Yakin?',
      'Ya, Reset',
      'Batal'
    )
    if (isConfirmed) {
      batchList.value = []
    } else {
      isRevertingFromLoc = true
      fromLocationId.value = oldVal
    }
  }
})

let isRevertingToLoc = false
watch(toLocationId, async (newVal, oldVal) => {
  if (isRevertingToLoc) {
    isRevertingToLoc = false
    return
  }
  if (batchList.value.length > 0 && newVal && oldVal && newVal !== oldVal) {
    const isConfirmed = await swalConfirm(
      'Reset Daftar Produk?',
      'Mengubah lokasi tujuan akan mereset seluruh daftar produk yang sudah dipilih. Yakin?',
      'Ya, Reset',
      'Batal'
    )
    if (isConfirmed) {
      batchList.value = []
    } else {
      isRevertingToLoc = true
      toLocationId.value = oldVal
    }
  }
})

function handleAddProduct({ product, quantity }) {
  if (!product || !quantity || quantity <= 0) {
    toast('Pilih produk dan masukkan kuantitas yang valid (Lebih dari 0).', 'warning')
    return
  }
  const existing = batchList.value.find(item => item.sku === product.sku)
  if (existing) {
    existing.quantity += quantity
  } else {
    batchList.value.push({
      _id: Date.now() + Math.random(),
      productId: product.id,
      sku: product.sku,
      name: product.name,
      quantity: quantity
    })
  }
}

function removeFromBatch(index) {
  batchList.value.splice(index, 1)
}

function duplicateFromBatch(index) {
  const item = batchList.value[index]
  if (item) {
    batchList.value.splice(index + 1, 0, { ...item, _id: Date.now() + Math.random() })
  }
}

async function submitRequest() {
  if (type.value === 'TRANSFER') {
    if (!fromLocationId.value || !toLocationId.value) return
    if (fromLocationId.value === toLocationId.value) return
  } else if (type.value === 'STOCK_OPNAME') {
    if (!toLocationId.value) return
  }
  if (batchList.value.length === 0) {
    return
  }

  isLoading.value = true
  try {
    const payload = {
      type: type.value,
      fromLocationId: type.value === 'TRANSFER' && fromLocationId.value ? Number(fromLocationId.value) : null,
      toLocationId: toLocationId.value ? Number(toLocationId.value) : null,
      notes: notes.value,
      items: batchList.value.map(i => ({
        productId: Number(i.productId),
        quantity: Number(i.quantity)
      }))
    }

    await stockRequestApi.createStockRequest(payload)
    toast('Permintaan stok berhasil dibuat', 'success')
    emit('request-created')
    clearDraft()
    emit('close')
  } catch (error) {
    console.error(error) // Auto-added to prevent unused var
  } finally {
    isLoading.value = false
  }
}

function clearDraft() {
  fromLocationId.value = null
  notes.value = ''
  type.value = 'TRANSFER'
  batchList.value = []
  if (myLocations.value.length > 1) {
    toLocationId.value = null
  }
}

async function closeModal() {
  if (batchList.value.length > 0 || notes.value.trim() !== '') {
    const result = await Swal.fire({
      title: 'Tutup Form?',
      text: 'Form belum selesai. Simpan sebagai draf atau hapus seluruh isian?',
      icon: 'question',
      showDenyButton: true,
      showCancelButton: true,
      confirmButtonText: 'Simpan Draf',
      denyButtonText: 'Hapus Isian',
      cancelButtonText: 'Batal',
      customClass: {
        popup: 'bg-background text-text rounded-xl shadow-2xl border border-secondary/50',
        title: 'text-text font-bold',
        htmlContainer: 'text-text opacity-90',
        confirmButton:
          'bg-primary hover:opacity-90 text-white font-semibold py-2.5 px-5 rounded-lg mx-2 transition-all',
        denyButton: 'bg-danger hover:opacity-90 text-white font-semibold py-2.5 px-5 rounded-lg mx-2 transition-all',
        cancelButton: 'bg-secondary hover:opacity-90 text-text font-semibold py-2.5 px-5 rounded-lg mx-2 transition-all'
      }
    })

    if (result.isConfirmed) {
      emit('close')
    } else if (result.isDenied) {
      clearDraft()
      emit('close')
    }
  } else {
    emit('close')
  }
}
</script>

<template>
  <Teleport to="body">
    <div v-if="isOpen" class="fixed inset-0 flex items-center justify-center p-4 bg-text/50 backdrop-blur-sm">
      <div
        class="bg-background border border-secondary/20 rounded-xl shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden animate-fade-in"
      >
        <!-- Header -->
        <div class="px-6 py-4 border-b border-secondary/20 flex justify-between items-center bg-secondary/5">
          <h3 class="text-lg font-bold text-text flex items-center gap-2">
            <font-awesome-icon icon="fa-solid fa-file-invoice" class="text-primary" />
            Buat Permintaan Stok Baru
          </h3>
          <button @click="closeModal" class="text-text/50 hover:text-danger transition-colors">
            <font-awesome-icon icon="fa-solid fa-xmark" class="text-xl" />
          </button>
        </div>

        <!-- Body -->
        <div class="p-4 md:p-5 overflow-y-auto space-y-4 md:space-y-5 custom-scrollbar">
          <!-- Lokasi & Notes -->
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4 bg-secondary/5 p-4 rounded-xl border border-secondary/20">
            <div class="space-y-4">
              <div>
                <label class="block text-xs font-bold text-text/60 uppercase mb-1.5">Tipe Permintaan</label>
                <select
                  v-model="type"
                  class="w-full p-2.5 bg-background border border-secondary/30 rounded-lg text-sm text-text focus:ring-1 focus:ring-primary outline-none"
                >
                  <option value="TRANSFER">Transfer Stok</option>
                  <option value="STOCK_OPNAME">Stock Opname</option>
                </select>
              </div>

              <div v-if="type === 'TRANSFER'">
                <label class="block text-xs font-bold text-text/60 uppercase mb-1.5">Minta Dari Lokasi (Asal)</label>
                <select
                  v-model="fromLocationId"
                  class="w-full p-2.5 bg-background border border-secondary/30 rounded-lg text-sm text-text focus:ring-1 focus:ring-primary outline-none"
                >
                  <option :value="null" disabled>Pilih Lokasi Asal</option>
                  <option v-for="loc in allLocations" :key="loc.id" :value="loc.id">
                    {{ loc.code }} - {{ loc.name }}
                  </option>
                </select>
              </div>

              <div>
                <label class="block text-xs font-bold text-text/60 uppercase mb-1.5">
                  {{ type === 'TRANSFER' ? 'Kirim Ke Lokasi (Tujuan)' : 'Lokasi Opname' }}
                </label>
                <select
                  v-model="toLocationId"
                  class="w-full p-2.5 bg-background border border-secondary/30 rounded-lg text-sm text-text focus:ring-1 focus:ring-primary outline-none"
                >
                  <option :value="null" disabled>Pilih Lokasi</option>
                  <!-- Untuk opname, operator bebas pilih semua lokasi -->
                  <option v-for="loc in type === 'TRANSFER' ? myLocations : allLocations" :key="loc.id" :value="loc.id">
                    {{ loc.code }} - {{ loc.name }}
                  </option>
                </select>
              </div>
            </div>

            <div>
              <label class="block text-xs font-bold text-text/60 uppercase mb-1.5">Catatan / Alasan</label>
              <textarea
                v-model="notes"
                rows="3"
                class="w-full p-3 bg-background border border-secondary/30 rounded-lg text-sm text-text focus:ring-1 focus:ring-primary outline-none resize-none placeholder:text-text/30"
                placeholder="Contoh: Stok untuk event akhir pekan..."
              ></textarea>
            </div>
          </div>

          <div class="border-t border-secondary/20 pt-4">
            <h4 class="text-sm font-bold text-text/80 uppercase mb-3">Daftar Produk</h4>

            <!-- Pakai komponen yg sama dgn Batch Adjustment -->
            <ProductSearchAddForm
              :active-tab="type"
              :search-location-id="type === 'TRANSFER' ? fromLocationId : toLocationId"
              :disabled="type === 'TRANSFER' ? !fromLocationId || isLoading : !toLocationId || isLoading"
              @add-product="handleAddProduct"
            />

            <BatchItemList
              class="mt-3"
              :items="batchList"
              :active-tab="type"
              @remove-item="removeFromBatch"
              @duplicate-item="duplicateFromBatch"
            />
          </div>
        </div>

        <!-- Footer -->
        <div class="px-6 py-4 border-t border-secondary/20 bg-secondary/5 flex justify-end gap-3">
          <button
            @click="closeModal"
            class="px-5 py-2.5 rounded-lg text-sm font-bold text-text/70 bg-background border border-secondary/30 hover:bg-secondary/10 transition-colors"
          >
            Batal
          </button>
          <button
            @click="submitRequest"
            :disabled="isLoading || batchList.length === 0 || !toLocationId || (type === 'TRANSFER' && !fromLocationId)"
            class="px-5 py-2.5 bg-primary text-secondary rounded-lg text-sm font-bold disabled:opacity-50 flex items-center gap-2 hover:bg-primary/90 transition-colors"
          >
            <font-awesome-icon v-if="isLoading" icon="fa-solid fa-spinner" class="animate-spin" />
            <font-awesome-icon v-else icon="fa-solid fa-paper-plane" />
            Kirim Permintaan
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.animate-fade-in {
  animation: fadeIn 0.3s ease-out forwards;
}
@keyframes fadeIn {
  from {
    opacity: 0;
    transform: scale(0.98);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}
.custom-scrollbar::-webkit-scrollbar {
  width: 6px;
}
.custom-scrollbar::-webkit-scrollbar-track {
  background: transparent;
}
.custom-scrollbar::-webkit-scrollbar-thumb {
  background-color: var(--color-secondary, #cbd5e1);
  border-radius: 20px;
}
</style>
