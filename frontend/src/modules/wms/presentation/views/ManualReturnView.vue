<script setup>
import { ref, onMounted, toRaw, computed, watch } from 'vue'
import { useMagicKeys, useLocalStorage } from '@vueuse/core'
import { useRouter } from 'vue-router'
import { useToast } from '@/composables/useToast'
import { swalAlert } from '@/composables/useSweetAlert'
import Swal from 'sweetalert2'
import { useReturns } from '../../application/useReturns'
import ProductSearchSelector from '@/modules/wms/presentation/components/transfer/ProductSearchSelector.vue'
import BaseSelect from '@/components/ui/BaseSelect.vue'
import { useMasterDataStore } from '@/stores/masterData'

const conditionOptions = [
  { id: 'GOOD', label: 'Bagus' },
  { id: 'BAD', label: 'Rusak' }
]

const router = useRouter()
const { toast } = useToast()
const { createReturn } = useReturns()

const isLoading = ref(false)
const locations = ref([])

const form = useLocalStorage('draft-mr-form', {
  invoiceId: '',
  items: [{ selectedProduct: null, quantity: 1, condition: 'GOOD', locationId: '', notes: '' }]
})

async function fetchHelpers() {
  try {
    const masterData = useMasterDataStore()
    locations.value = await masterData.getLocations()
  } catch (e) {
    console.error('Gagal load helpers', e)
  }
}

const locationOptions = computed(() => locations.value.map(loc => ({ id: loc.id, label: loc.code })))

function addItemRow() {
  form.value.items.push({
    selectedProduct: null,
    quantity: 1,
    condition: 'GOOD',
    locationId: '',
    notes: ''
  })
  setTimeout(() => {
    window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' })
  }, 100)
}

function removeItemRow(index) {
  if (form.value.items.length > 1) {
    form.value.items.splice(index, 1)
  } else {
    toast('Minimal harus ada 1 barang.', 'warning')
  }
}

async function submitForm() {
  const formData = toRaw(form.value)
  if (!formData.invoiceId || formData.invoiceId.trim() === '') return toast('Nomor Invoice wajib diisi!', 'warning')

  const validItems = []

  for (const [index, item] of formData.items.entries()) {
    if (!item.selectedProduct) return toast(`Baris ke-${index + 1}: Produk belum dipilih!`, 'warning')

    const productId = item.selectedProduct.id || item.selectedProduct.product_id

    if (!item.quantity || item.quantity < 1) return toast(`Baris ke-${index + 1}: Qty minimal 1.`, 'warning')
    if (!item.locationId) return toast(`Baris ke-${index + 1}: Lokasi belum dipilih!`, 'warning')

    // Pisahkan payload sesuai backend controller
    validItems.push({
      reference: formData.invoiceId,
      productId: productId,
      quantity: item.quantity,
      locationId: item.locationId,
      condition: item.condition, // Kirim raw condition (GOOD/BAD)
      notes: item.notes || 'Manual Return' // Kirim notes terpisah
    })
  }

  try {
    isLoading.value = true
    let successCount = 0

    for (const itemPayload of validItems) {
      try {
        await createReturn(itemPayload)
        successCount++
      } catch (err) {
        console.error('Gagal memproses item:', itemPayload, err)
      }
    }

    if (successCount > 0) {
      toast(`Berhasil memproses ${successCount} item. Stok telah bertambah.`, 'success')
      form.value = {
        invoiceId: '',
        items: [{ selectedProduct: null, quantity: 1, condition: 'GOOD', locationId: '', notes: '' }]
      }
      router.go(-1)
    }
  } catch {
    swalAlert('Gagal Memproses', 'Terjadi kesalahan sistem saat menyimpan data', 'error')
  } finally {
    isLoading.value = false
  }
}

async function goBack() {
  const isDirty = form.value.invoiceId.trim() !== '' || form.value.items.length > 1 || form.value.items[0].selectedProduct !== null
  if (isDirty) {
    const result = await Swal.fire({
      title: 'Kembali?',
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
        confirmButton: 'bg-primary hover:opacity-90 text-white font-semibold py-2.5 px-5 rounded-lg mx-2 transition-all',
        denyButton: 'bg-danger hover:opacity-90 text-white font-semibold py-2.5 px-5 rounded-lg mx-2 transition-all',
        cancelButton: 'bg-secondary hover:opacity-90 text-text font-semibold py-2.5 px-5 rounded-lg mx-2 transition-all'
      }
    })

    if (result.isConfirmed) {
      router.go(-1)
    } else if (result.isDenied) {
      form.value = { invoiceId: '', items: [{ selectedProduct: null, quantity: 1, condition: 'GOOD', locationId: '', notes: '' }] }
      router.go(-1)
    }
  } else {
    router.go(-1)
  }
}

onMounted(() => {
  fetchHelpers()
})

// --- LOCAL HOTKEYS ---
const { Alt_S } = useMagicKeys()

watch(Alt_S, pressed => {
  if (pressed && !isLoading.value) {
    submitForm()
  }
})
</script>

<template>
  <div class="min-h-screen flex flex-col bg-background text-text transition-colors duration-300">
    <div class="px-6 py-6 pb-2">
      <div class="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div class="flex items-center gap-4">
          <button
            @click="goBack"
            class="w-10 h-10 flex items-center justify-center rounded-full bg-secondary/50 border border-secondary text-text/80 hover:bg-secondary hover:text-text transition-all shadow-sm"
          >
            <font-awesome-icon icon="fa-solid fa-arrow-left" />
          </button>
          <div>
            <h1 class="text-2xl font-bold text-text">Input Retur Manual</h1>
            <p class="text-sm text-text/50">Barang akan langsung masuk ke stok (Instant Process).</p>
          </div>
        </div>
        <div class="w-full md:w-96">
          <div class="relative group">
            <div class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <span class="text-primary/75 font-bold text-xs">#INV</span>
            </div>
            <input
              v-model="form.invoiceId"
              type="text"
              placeholder="Nomor Invoice / Customer..."
              class="w-full pl-12 pr-4 py-3 bg-secondary/80 border border-secondary rounded-xl text-text font-mono font-bold focus:ring-4 focus:ring-primary/10 focus:border-primary transition-all shadow-sm group-hover:border-primary/50 placeholder-text/30"
            />
          </div>
        </div>
      </div>
    </div>

    <div class="flex-1 px-6 py-6">
      <div class="max-w-7xl mx-auto">
        <div class="bg-secondary/30 rounded-xl shadow-sm overflow-hidden border border-secondary/50">
          <div
            class="hidden md:flex bg-secondary border-b border-primary px-6 py-3 items-center gap-4 text-xs font-bold text-text uppercase tracking-wider"
          >
            <div class="w-8 text-center">#</div>
            <div class="flex-1">Produk</div>
            <div class="w-32">Kondisi</div>
            <div class="w-40">Lokasi Simpan</div>
            <div class="w-24 text-center">Qty</div>
            <div class="w-1/3">Catatan</div>
            <div class="w-10"></div>
          </div>

          <div class="divide-y divide-primary/10 bg-background/50">
            <div
              v-for="(item, index) in form.items"
              :key="index"
              class="group p-4 md:px-6 md:py-4 flex flex-col md:flex-row gap-4 md:items-start hover:bg-secondary/30 transition-colors"
            >
              <div class="hidden md:flex w-8 h-10 items-center justify-center text-sm font-bold text-text/40">
                {{ index + 1 }}
              </div>
              <div class="md:hidden flex items-center gap-2 mb-2">
                <span class="bg-secondary text-text/60 text-[10px] font-bold px-2 py-1 rounded"
                  >Item #{{ index + 1 }}</span
                >
              </div>

              <div class="w-full md:flex-1 min-w-0">
                <ProductSearchSelector v-model="item.selectedProduct" placeholder="Cari SKU atau Nama Barang..." />
                <div v-if="item.selectedProduct" class="md:hidden mt-1.5 text-xs text-success font-medium">
                  <font-awesome-icon icon="fa-solid fa-check-circle" />
                  {{ item.selectedProduct.name }}
                </div>
              </div>

              <div class="flex flex-wrap md:flex-nowrap gap-3 items-start w-full md:w-auto">
                <div class="w-[48%] md:w-32">
                  <BaseSelect
                    v-model="item.condition"
                    :options="conditionOptions"
                    label="label"
                    track-by="id"
                    placeholder="Kondisi"
                    :searchable="false"
                    emit-value
                  />
                </div>

                <div class="w-[48%] md:w-40">
                  <BaseSelect
                    v-model="item.locationId"
                    :options="locationOptions"
                    label="label"
                    track-by="id"
                    placeholder="Pilih Lokasi..."
                    :searchable="true"
                    emit-value
                  />
                </div>

                <div class="w-full md:w-24">
                  <div
                    class="flex items-center border border-secondary rounded-lg overflow-hidden bg-background focus:border-primary focus:ring-1 focus:ring-primary"
                  >
                    <input
                      v-model="item.quantity"
                      type="number"
                      min="1"
                      class="w-full px-3 py-2.5 bg-background border border-secondary rounded-lg text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary text-text placeholder-text/30"
                      placeholder="Qty"
                    />
                  </div>
                </div>

                <div class="w-full md:w-1/3 min-w-[200px]">
                  <input
                    v-model="item.notes"
                    type="text"
                    placeholder="Catatan (Opsional)..."
                    class="w-full px-3 py-2.5 bg-background border border-secondary rounded-lg text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary text-text placeholder-text/30"
                  />
                </div>

                <div class="w-full md:w-10 flex justify-end md:justify-center md:pt-1">
                  <button
                    @click="removeItemRow(index)"
                    class="w-8 h-8 flex items-center justify-center text-text/30 hover:text-danger hover:bg-danger/10 rounded-lg transition-all"
                    title="Hapus baris ini"
                  >
                    <font-awesome-icon icon="fa-solid fa-trash-alt" />
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div v-if="form.items.length === 0" class="py-12 flex flex-col items-center justify-center text-text/40">
            <div class="w-16 h-16 bg-secondary/50 rounded-full flex items-center justify-center mb-3">
              <font-awesome-icon icon="fa-solid fa-box-open" class="text-2xl text-text/30" />
            </div>
            <p class="text-sm">Belum ada barang yang ditambahkan.</p>
            <button @click="addItemRow" class="mt-4 text-primary font-bold text-sm hover:underline">
              + Tambah Barang Pertama
            </button>
          </div>

          <div class="bg-secondary/20 border-t border-secondary p-3">
            <button
              @click="addItemRow"
              class="w-full py-3 border-2 border-dashed border-secondary rounded-xl text-text/60 font-bold text-sm hover:border-primary hover:text-primary hover:bg-primary/5 transition-all flex items-center justify-center gap-2"
            >
              <font-awesome-icon icon="fa-solid fa-plus-circle" /> Tambah Baris Baru
            </button>
          </div>
        </div>
      </div>
    </div>

    <div
      class="fixed bottom-0 left-0 w-full bg-background/90 backdrop-blur-sm border-t border-secondary/50 py-4 px-6 z-30"
    >
      <div class="max-w-7xl mx-auto flex items-center justify-between">
        <div class="hidden md:flex flex-col">
          <span class="text-xs text-text/50 font-bold uppercase">Total Item</span>
          <span class="text-xl font-bold text-text"
            >{{ form.items.length }} <span class="text-sm font-normal text-text/50">Baris</span></span
          >
        </div>
        <div class="flex gap-4 w-full md:w-auto">
          <button
            @click="goBack"
            class="flex-1 md:flex-none px-6 py-3 rounded-xl border border-secondary text-text/70 font-bold hover:bg-secondary/50 transition-all"
          >
            Batal
          </button>
          <button
            @click="submitForm"
            :disabled="isLoading"
            class="flex-1 md:flex-none md:w-64 bg-primary text-secondary px-6 py-3 rounded-xl font-bold text-lg hover:bg-primary/90 shadow-lg shadow-primary/20 flex items-center justify-center gap-2 transition-all disabled:opacity-70 disabled:cursor-not-allowed group"
          >
            <span v-if="isLoading">Memproses...</span><span v-else>Simpan Retur</span
            ><font-awesome-icon v-if="isLoading" icon="fa-solid fa-spinner" spin /><font-awesome-icon
              v-else
              icon="fa-solid fa-check"
            />
            <kbd v-if="!isLoading" class="hidden md:inline-block ml-1 px-1.5 py-0.5 text-[10px] bg-secondary/20 text-secondary border border-secondary/30 rounded font-mono shadow-sm group-hover:bg-secondary/30 transition-colors">Alt+S</kbd>
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
