<!-- frontend/src/components/picking/PickingEditModal.vue -->
<script setup>
import { ref, watch, computed } from 'vue'
import BaseModal from '@/components/ui/BaseModal.vue'
import { searchProducts } from '@/api/helpers/products.js'
import { updatePickingItems } from '@/api/helpers/picking.js'
import { useToast } from '@/composables/useToast.js'
import { swalConfirm } from '@/composables/useSweetAlert.js'

const props = defineProps({
  show: { type: Boolean, default: false },
  inv: { type: Object, default: () => ({}) }
})

const emit = defineEmits(['close', 'saved'])
const { toast } = useToast()

const editableItems = ref([])
const isSaving = ref(false)

// State untuk Pencarian Produk Baru
const searchQuery = ref('')
const searchResults = ref([])
const isSearching = ref(false)
const nextCursor = ref(null)
const isLoadingMore = ref(false)
let searchTimeout = null

// Ekstrak semua item dari inv (baik dari inv.locations maupun inv.items)
const extractItems = invoice => {
  if (!invoice) return []
  const list = []
  if (invoice.locations) {
    Object.values(invoice.locations).forEach(locItems => {
      locItems.forEach(it => {
        list.push({
          id: it.id,
          productId: it.product_id || it.productId,
          sku: it.sku || it.original_sku,
          productName: it.product_name || it.name || '-',
          quantity: Number(it.quantity || 1),
          price: Number(it.price || 0)
        })
      })
    })
  } else if (invoice.items) {
    invoice.items.forEach(it => {
      list.push({
        id: it.id,
        productId: it.product_id || it.productId,
        sku: it.sku || it.original_sku,
        productName: it.product_name || it.name || '-',
        quantity: Number(it.quantity || 1),
        price: Number(it.price || 0)
      })
    })
  }
  return list
}

// Inisialisasi data saat modal dibuka
watch(
  () => props.show,
  isShown => {
    if (isShown) {
      editableItems.value = extractItems(props.inv)
      searchQuery.value = ''
      searchResults.value = []
      nextCursor.value = null
    } else {
      editableItems.value = []
      searchQuery.value = ''
      searchResults.value = []
      nextCursor.value = null
    }
  }
)

// Search handler dengan debounce 300ms
const onSearchInput = () => {
  clearTimeout(searchTimeout)
  const q = searchQuery.value.trim()
  if (!q) {
    searchResults.value = []
    nextCursor.value = null
    return
  }

  isSearching.value = true
  nextCursor.value = null
  searchTimeout = setTimeout(async () => {
    try {
      const res = await searchProducts(q, null, 1, 10, true)
      if (res && res.data) {
        searchResults.value = res.data.filter(p => Number(p.current_stock) > 0)
        nextCursor.value = res.nextCursor || null
      } else if (Array.isArray(res)) {
        searchResults.value = res.filter(p => Number(p.current_stock) > 0)
        nextCursor.value = null
      } else {
        searchResults.value = []
        nextCursor.value = null
      }
    } catch (err) {
      console.error('Gagal mencari produk:', err)
      searchResults.value = []
      nextCursor.value = null
    } finally {
      isSearching.value = false
    }
  }, 300)
}

// Infinite scroll: muat halaman berikutnya saat scroll ke bawah
const loadMoreProducts = async () => {
  if (!nextCursor.value || isLoadingMore.value) return
  const q = searchQuery.value.trim()
  if (!q) return

  isLoadingMore.value = true
  try {
    const res = await searchProducts(q, null, nextCursor.value, 10, true)
    const newItems = (res?.data || (Array.isArray(res) ? res : [])).filter(p => Number(p.current_stock) > 0)
    const existingIds = new Set(searchResults.value.map(p => p.id))
    const uniqueItems = newItems.filter(p => !existingIds.has(p.id))
    searchResults.value.push(...uniqueItems)
    nextCursor.value = res?.nextCursor || null
  } catch (err) {
    console.error('Gagal memuat halaman produk berikutnya:', err)
  } finally {
    isLoadingMore.value = false
  }
}

// Event handler scroll pada dropdown
const onDropdownScroll = e => {
  const el = e.target
  if (el.scrollTop + el.clientHeight >= el.scrollHeight - 50) {
    if (nextCursor.value && !isLoadingMore.value) {
      loadMoreProducts()
    }
  }
}

// Tambah produk dari hasil pencarian
const addProduct = prod => {
  const existing = editableItems.value.find(it => it.productId === prod.id || it.sku === prod.sku)
  if (existing) {
    existing.quantity += 1
    toast(`Kuantitas SKU ${prod.sku} ditambah menjadi ${existing.quantity}`, 'info')
  } else {
    editableItems.value.push({
      productId: prod.id,
      sku: prod.sku,
      productName: prod.name,
      quantity: 1,
      price: prod.price || 0
    })
    toast(`Produk ${prod.sku} ditambahkan ke pesanan`, 'success')
  }
  searchQuery.value = ''
  searchResults.value = []
}

// Ubah kuantitas
const updateQty = (index, delta) => {
  const current = editableItems.value[index].quantity
  const next = current + delta
  if (next >= 1) {
    editableItems.value[index].quantity = next
  }
}

// Hapus baris item
const removeItem = async index => {
  if (editableItems.value.length <= 1) {
    toast('Pesanan harus memiliki minimal 1 produk. Gunakan fitur Void jika ingin membatalkan pesanan.', 'warning')
    return
  }
  const item = editableItems.value[index]
  const confirmed = await swalConfirm(`Hapus SKU "${item.sku}" dari pesanan ini?`)
  if (confirmed) {
    editableItems.value.splice(index, 1)
  }
}

// Total kuantitas dan total SKU
const totalQty = computed(() => editableItems.value.reduce((acc, it) => acc + Number(it.quantity || 0), 0))

// Simpan perubahan ke backend
const onSave = async () => {
  if (editableItems.value.length === 0) {
    toast('Pesanan harus memiliki minimal 1 produk.', 'warning')
    return
  }

  // Validasi seluruh qty > 0
  for (const it of editableItems.value) {
    if (!it.quantity || Number(it.quantity) < 1) {
      toast(`Kuantitas untuk SKU ${it.sku} harus minimal 1 pcs.`, 'warning')
      return
    }
  }

  isSaving.value = true
  try {
    const payload = editableItems.value.map(it => ({
      productId: it.productId,
      sku: it.sku,
      quantity: Number(it.quantity),
      price: Number(it.price || 0)
    }))

    const res = await updatePickingItems(props.inv.id, payload)
    toast(res.message || 'Item pesanan berhasil diperbarui!', 'success')
    emit('saved')
    emit('close')
  } catch (err) {
    console.error('Gagal memperbarui item pesanan:', err)
    toast(err.message || 'Gagal menyimpan perubahan item pesanan.', 'error')
  } finally {
    isSaving.value = false
  }
}
</script>

<template>
  <Teleport to="body">
    <BaseModal
      :show="show"
      @close="emit('close')"
      :title="`Ubah Produk & Kuantitas: ${inv?.invoice || inv?.original_invoice_id || ''}`"
      maxWidth="max-w-2xl"
    >
      <div class="space-y-4">
        <!-- Info Header Pesanan -->
        <div
          class="bg-secondary/10 border border-secondary/20 rounded-lg p-3 flex flex-wrap items-center justify-between gap-2 text-xs"
        >
          <div>
            <span class="text-text/50">Customer:</span>
            <span class="font-bold text-text ml-1">{{ inv?.customer_name || '-' }}</span>
          </div>
          <div>
            <span class="text-text/50">Marketplace:</span>
            <span class="font-bold text-text ml-1">{{ inv?.source || '-' }}</span>
          </div>
          <div>
            <span class="text-text/50">Total:</span>
            <span class="font-black text-primary ml-1">{{ editableItems.length }} SKU ({{ totalQty }} pcs)</span>
          </div>
        </div>

        <!-- Section Tambah Produk Baru -->
        <div class="space-y-1 relative">
          <label class="text-xs font-bold text-text/70 flex items-center gap-1.5">
            <font-awesome-icon icon="fa-solid fa-plus-circle" class="text-primary" />
            Tambah Produk Baru ke Pesanan:
          </label>
          <div class="relative">
            <input
              type="text"
              v-model="searchQuery"
              @input="onSearchInput"
              placeholder="Cari SKU atau nama produk pengganti/tambahan..."
              class="w-full bg-background border border-secondary/30 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/40 pr-8 transition-colors"
            />
            <span class="absolute right-3 top-2.5 text-text/40 text-xs">
              <font-awesome-icon
                :icon="isSearching ? 'fa-solid fa-spinner' : 'fa-solid fa-search'"
                :spin="isSearching"
              />
            </span>
          </div>

          <!-- Dropdown Hasil Pencarian Autocomplete -->
          <div
            v-if="searchResults.length > 0"
            @scroll.passive="onDropdownScroll"
            class="absolute left-0 right-0 top-full mt-1 bg-background border border-secondary/20 rounded-lg shadow-xl max-h-56 overflow-y-auto z-50 divide-y divide-secondary/10"
          >
            <div
              v-for="p in searchResults"
              :key="p.id"
              @click="addProduct(p)"
              class="p-2.5 hover:bg-primary/10 cursor-pointer flex items-center justify-between text-xs transition-colors"
            >
              <div class="min-w-0 pr-2">
                <div class="font-bold text-text truncate">{{ p.sku }}</div>
                <div class="text-[11px] text-text/60 truncate">{{ p.name }}</div>
              </div>
              <div class="shrink-0 flex items-center gap-2">
                <span
                  v-if="p.current_stock !== undefined"
                  class="text-[10px] px-1.5 py-0.5 rounded font-bold"
                  :class="p.current_stock > 0 ? 'bg-success/15 text-success' : 'bg-secondary/20 text-text/50'"
                >
                  Stok: {{ p.current_stock }}
                </span>
              </div>
            </div>

            <!-- Loading indicator saat infinite scroll -->
            <div
              v-if="isLoadingMore"
              class="p-2.5 text-center text-xs text-text/50 flex items-center justify-center gap-1.5 bg-secondary/10 font-medium"
            >
              <font-awesome-icon icon="fa-solid fa-spinner" spin />
              <span>Memuat produk lainnya...</span>
            </div>
            <!-- Tombol manual jika user ingin klik langsung -->
            <div
              v-else-if="nextCursor"
              @click.stop="loadMoreProducts"
              class="p-2 text-center text-xs text-primary font-bold hover:bg-primary/10 cursor-pointer bg-secondary/5 transition-colors flex items-center justify-center gap-1.5"
            >
              <font-awesome-icon icon="fa-solid fa-chevron-down" />
              <span>Muat lebih banyak...</span>
            </div>
            <div v-else-if="searchResults.length > 0" class="p-1.5 text-center text-[10px] text-text/40 bg-secondary/5">
              Semua hasil telah dimuat ({{ searchResults.length }} produk)
            </div>
          </div>
        </div>

        <!-- Tabel Daftar Item -->
        <div class="border border-secondary/20 rounded-lg overflow-hidden bg-background">
          <div
            class="bg-secondary/20 px-3 py-2 text-xs font-bold text-text/70 flex justify-between items-center border-b border-secondary/20"
          >
            <span>Daftar Item Pesanan</span>
            <span class="text-[11px] font-normal text-text/50">Klik +/- atau edit angka kuantitas</span>
          </div>

          <div class="max-h-72 overflow-y-auto divide-y divide-secondary/10">
            <div
              v-for="(item, idx) in editableItems"
              :key="item.sku + idx"
              class="p-3 flex items-center justify-between gap-3 hover:bg-secondary/5 transition-colors"
            >
              <!-- Info Produk -->
              <div class="min-w-0 flex-1">
                <div class="font-bold text-xs text-text flex items-center gap-2">
                  {{ item.sku }}
                </div>
                <div class="text-[11px] text-text/60 line-clamp-1">
                  {{ item.productName }}
                </div>
              </div>

              <!-- Kontrol Kuantitas -->
              <div class="flex items-center gap-2 shrink-0">
                <div
                  class="flex items-center border border-secondary/30 rounded-lg overflow-hidden bg-background shadow-sm"
                >
                  <button
                    type="button"
                    @click="updateQty(idx, -1)"
                    :disabled="item.quantity <= 1"
                    class="px-2.5 py-1 text-xs hover:bg-secondary/20 text-text/70 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    <font-awesome-icon icon="fa-solid fa-minus" />
                  </button>
                  <input
                    type="number"
                    v-model.number="item.quantity"
                    min="1"
                    class="w-14 text-center py-1 text-xs font-bold bg-transparent text-text border-x border-secondary/30 focus:outline-none focus:bg-primary/5"
                  />
                  <button
                    type="button"
                    @click="updateQty(idx, 1)"
                    class="px-2.5 py-1 text-xs hover:bg-secondary/20 text-text/70 transition-colors"
                  >
                    <font-awesome-icon icon="fa-solid fa-plus" />
                  </button>
                </div>
                <span class="text-[10px] text-text/40">pcs</span>

                <!-- Tombol Hapus Baris -->
                <button
                  type="button"
                  @click="removeItem(idx)"
                  class="p-1.5 text-danger/70 hover:text-danger hover:bg-danger/10 rounded transition-colors ml-1"
                  title="Hapus item ini"
                >
                  <font-awesome-icon icon="fa-solid fa-trash-can" />
                </button>
              </div>
            </div>
          </div>
        </div>

        <!-- Action Footer -->
        <div class="flex justify-end items-center gap-2 pt-2 border-t border-secondary/10">
          <button
            type="button"
            @click="emit('close')"
            :disabled="isSaving"
            class="px-4 py-2 rounded-lg border border-secondary/30 text-xs font-bold text-text/70 hover:bg-secondary/20 transition-colors disabled:opacity-50"
          >
            Batal
          </button>
          <button
            type="button"
            @click="onSave"
            :disabled="isSaving || editableItems.length === 0"
            class="px-4 py-2 rounded-lg bg-primary text-white text-xs font-bold hover:bg-primary/90 flex items-center gap-1.5 shadow-sm transition-colors disabled:opacity-50"
          >
            <font-awesome-icon :icon="isSaving ? 'fa-solid fa-spinner' : 'fa-solid fa-floppy-disk'" :spin="isSaving" />
            {{ isSaving ? 'Menyimpan...' : 'Simpan Perubahan' }}
          </button>
        </div>
      </div>
    </BaseModal>
  </Teleport>
</template>
