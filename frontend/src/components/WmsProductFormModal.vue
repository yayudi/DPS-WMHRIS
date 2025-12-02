<script setup>
import { ref, watch } from 'vue'
import axios from '@/api/axios.js'
import { useToast } from '@/composables/UseToast.js'
import { formatCurrency } from '@/utils/formatters.js'

const props = defineProps({
  show: Boolean,
  mode: { type: String, default: 'create' }, // 'create' or 'edit'
  productData: { type: Object, default: () => ({}) },
})

const emit = defineEmits(['close', 'refresh'])
const { show: toast } = useToast()

const form = ref({
  sku: '',
  name: '',
  price: 0,
  is_package: false,
})

const components = ref([]) // Array of { id, sku, name, quantity }
const componentSearch = ref('')
const searchResults = ref([])
const isSearching = ref(false)
const loading = ref(false)
const fetchLoading = ref(false)

// Reset/Populate Form saat modal dibuka
watch(
  () => props.show,
  async (isOpen) => {
    if (isOpen) {
      // Reset state
      componentSearch.value = ''
      searchResults.value = []

      if (props.mode === 'edit' && props.productData?.id) {
        // MODE EDIT: Fetch data lengkap dari server (termasuk komponen paket)
        fetchLoading.value = true
        try {
          const { data } = await axios.get(`/products/${props.productData.id}`)
          if (data.success) {
            form.value = {
              sku: data.data.sku,
              name: data.data.name,
              price: data.data.price || 0,
              is_package: Boolean(data.data.is_package),
            }
            // Mapping komponen jika ada
            components.value = data.data.components || []
          }
        } catch (err) {
          console.error(err)
          toast('Gagal memuat detail produk.', 'error')
          emit('close')
        } finally {
          fetchLoading.value = false
        }
      } else {
        // MODE CREATE: Kosongkan form
        form.value = { sku: '', name: '', price: 0, is_package: false }
        components.value = []
      }
    }
  },
)

// Logika Pencarian Komponen Paket
let debounceTimeout
function handleSearch(e) {
  const query = e.target.value
  clearTimeout(debounceTimeout)

  if (!query || query.length < 2) {
    searchResults.value = []
    return
  }

  isSearching.value = true
  debounceTimeout = setTimeout(async () => {
    try {
      const { data } = await axios.get(`/products/search?q=${query}`)
      // Filter: Jangan tampilkan produk yang sudah dipilih atau produk itu sendiri (jika edit)
      searchResults.value = data.filter(
        (p) =>
          !components.value.some((c) => c.id === p.id) &&
          (props.mode === 'create' || p.id !== props.productData.id),
      )
    } catch (err) {
      console.error(err)
    } finally {
      isSearching.value = false
    }
  }, 300)
}

function addComponent(product) {
  components.value.push({
    id: product.id,
    sku: product.sku,
    name: product.name,
    quantity: 1, // Default qty 1
  })
  componentSearch.value = ''
  searchResults.value = []
}

function removeComponent(index) {
  components.value.splice(index, 1)
}

async function handleSubmit() {
  // Validasi Dasar
  if (!form.value.name) return toast('Nama produk wajib diisi.', 'error')
  if (props.mode === 'create' && !form.value.sku) return toast('SKU wajib diisi.', 'error')

  // Validasi Paket
  if (form.value.is_package && components.value.length === 0) {
    return toast('Produk paket harus memiliki minimal 1 komponen.', 'error')
  }

  loading.value = true
  try {
    // Siapkan payload
    const payload = {
      ...form.value,
      // Kirim array komponen hanya jika is_package true
      components: form.value.is_package ? components.value : [],
    }

    let response
    if (props.mode === 'create') {
      response = await axios.post('/products', payload)
    } else {
      response = await axios.put(`/products/${props.productData.id}`, payload)
    }

    if (response.data.success) {
      toast(`Produk berhasil ${props.mode === 'create' ? 'dibuat' : 'diperbarui'}!`, 'success')
      emit('refresh') // Memberitahu parent untuk refresh tabel
      emit('close')
    }
  } catch (err) {
    console.error(err)
    const msg = err.response?.data?.message || 'Terjadi kesalahan saat menyimpan.'
    toast(msg, 'error')
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <Transition name="modal-fade">
    <div
      v-if="show"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
    >
      <div
        class="bg-background w-full max-w-2xl rounded-xl shadow-2xl border border-secondary/20 flex flex-col max-h-[90vh]"
      >
        <!-- Header -->
        <div
          class="p-4 border-b border-secondary/20 flex justify-between items-center bg-secondary/5 rounded-t-xl"
        >
          <h3 class="font-bold text-lg text-text">
            {{ mode === 'create' ? 'Tambah Produk Baru' : 'Edit Produk' }}
          </h3>
          <button @click="$emit('close')" class="text-text/40 hover:text-danger transition-colors">
            <font-awesome-icon icon="fa-solid fa-times" class="text-xl" />
          </button>
        </div>

        <!-- Body -->
        <div class="p-6 overflow-y-auto space-y-4 custom-scrollbar">
          <!-- Loading State saat fetch detail edit -->
          <div v-if="fetchLoading" class="text-center py-10">
            <font-awesome-icon
              icon="fa-solid fa-spinner"
              class="animate-spin text-3xl text-primary"
            />
            <p class="text-sm text-text/50 mt-2">Memuat detail produk...</p>
          </div>

          <template v-else>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <!-- SKU Input -->
              <div class="col-span-1">
                <label class="block text-xs font-bold text-text/60 mb-1">SKU (Kode Unik)</label>
                <div class="relative">
                  <input
                    v-model="form.sku"
                    type="text"
                    :disabled="mode === 'edit'"
                    class="w-full pl-9 pr-3 py-2 bg-secondary/10 border border-secondary/30 rounded-lg font-mono uppercase focus:outline-none focus:border-primary disabled:opacity-50 disabled:cursor-not-allowed text-text"
                    placeholder="PPxxxxxxx"
                  />
                  <font-awesome-icon
                    icon="fa-solid fa-barcode"
                    class="absolute left-3 top-2.5 text-text/40"
                  />
                </div>
                <p v-if="mode === 'edit'" class="text-[10px] text-text/40 mt-1 italic">
                  SKU tidak dapat diubah.
                </p>
              </div>

              <!-- Harga Input -->
              <div class="col-span-1">
                <label class="block text-xs font-bold text-text/60 mb-1">Harga Jual (Rp)</label>
                <div class="relative">
                  <span class="absolute left-3 top-2 text-text/40 font-bold text-xs">Rp</span>
                  <input
                    v-model.number="form.price"
                    type="number"
                    min="0"
                    class="w-full pl-8 pr-3 py-2 bg-secondary/10 border border-secondary/30 rounded-lg font-mono focus:outline-none focus:border-primary text-text text-right"
                  />
                </div>
              </div>
            </div>

            <!-- Nama Produk -->
            <div>
              <label class="block text-xs font-bold text-text/60 mb-1">Nama Produk</label>
              <input
                v-model="form.name"
                type="text"
                class="w-full px-3 py-2 bg-secondary/10 border border-secondary/30 rounded-lg focus:outline-none focus:border-primary text-text"
                placeholder="Contoh: Paket Bundling Hemat A"
              />
            </div>

            <!-- Checkbox Paket -->
            <div class="pt-2 border-t border-secondary/10">
              <label
                class="flex items-start gap-3 p-3 border border-secondary/20 rounded-lg hover:bg-secondary/5 cursor-pointer transition-colors"
                :class="{ 'bg-primary/5 border-primary/30': form.is_package }"
              >
                <div class="pt-0.5">
                  <input
                    v-model="form.is_package"
                    type="checkbox"
                    class="w-5 h-5 text-primary rounded border-secondary/30 bg-secondary/10 focus:ring-primary"
                  />
                </div>
                <div>
                  <span
                    class="block text-sm font-bold text-text"
                    :class="{ 'text-primary': form.is_package }"
                    >Produk Paket (Bundling)</span
                  >
                  <span class="block text-xs text-text/50 mt-0.5"
                    >Produk ini merupakan gabungan dari beberapa produk lain (stok otomatis dipotong
                    dari komponen).</span
                  >
                </div>
              </label>
            </div>

            <!-- Bagian Komponen Paket (Hanya muncul jika dicentang) -->
            <div
              v-if="form.is_package"
              class="mt-2 p-4 bg-secondary/5 rounded-lg border border-secondary/20 animate-fade-in"
            >
              <h4 class="font-bold text-sm text-text mb-3 flex items-center gap-2">
                <font-awesome-icon icon="fa-solid fa-layer-group" class="text-primary" />
                Komponen Paket
              </h4>

              <!-- Search Component -->
              <div class="relative mb-4">
                <label class="text-xs font-bold text-text/40 mb-1 block"
                  >Cari Produk Komponen</label
                >
                <div class="relative">
                  <input
                    v-model="componentSearch"
                    @input="handleSearch"
                    type="text"
                    placeholder="Ketik SKU atau Nama produk..."
                    class="w-full pl-9 pr-4 py-2 bg-background border border-secondary/30 rounded-lg text-sm focus:outline-none focus:border-primary text-text"
                  />
                  <font-awesome-icon
                    v-if="isSearching"
                    icon="fa-solid fa-circle-notch"
                    class="absolute left-3 top-2.5 text-primary animate-spin"
                  />
                  <font-awesome-icon
                    v-else
                    icon="fa-solid fa-search"
                    class="absolute left-3 top-2.5 text-text/40"
                  />
                </div>

                <!-- Search Results Dropdown -->
                <div
                  v-if="searchResults.length > 0"
                  class="absolute z-10 w-full mt-1 bg-background border border-secondary/20 rounded-lg shadow-xl max-h-48 overflow-y-auto custom-scrollbar"
                >
                  <div
                    v-for="res in searchResults"
                    :key="res.id"
                    @click="addComponent(res)"
                    class="p-2.5 hover:bg-primary/10 cursor-pointer flex justify-between items-center text-sm border-b border-secondary/10 last:border-0 group transition-colors"
                  >
                    <div class="flex flex-col">
                      <span class="font-medium text-text group-hover:text-primary">{{
                        res.name
                      }}</span>
                      <span class="font-mono text-[10px] text-text/40">{{ res.sku }}</span>
                    </div>
                    <div class="text-primary text-xs font-bold opacity-0 group-hover:opacity-100">
                      + Tambahkan
                    </div>
                  </div>
                </div>
              </div>

              <!-- List Components Table -->
              <div v-if="components.length > 0" class="space-y-1">
                <div
                  class="grid grid-cols-12 gap-2 text-[10px] uppercase font-bold text-text/40 px-3 pb-1"
                >
                  <div class="col-span-7">Nama Produk</div>
                  <div class="col-span-3 text-center">Qty</div>
                  <div class="col-span-2 text-right">Hapus</div>
                </div>

                <div
                  v-for="(comp, idx) in components"
                  :key="comp.id"
                  class="grid grid-cols-12 gap-2 items-center bg-background p-2 rounded-lg border border-secondary/10 shadow-sm"
                >
                  <div class="col-span-7 overflow-hidden">
                    <div class="text-sm font-medium text-text truncate" :title="comp.name">
                      {{ comp.name }}
                    </div>
                    <div class="text-[10px] text-text/40 font-mono">{{ comp.sku }}</div>
                  </div>
                  <div class="col-span-3">
                    <input
                      v-model.number="comp.quantity"
                      type="number"
                      min="1"
                      class="w-full px-1 py-1 text-center bg-secondary/10 rounded border border-secondary/20 text-sm font-bold focus:border-primary focus:outline-none"
                    />
                  </div>
                  <div class="col-span-2 text-right">
                    <button
                      @click="removeComponent(idx)"
                      class="w-7 h-7 inline-flex items-center justify-center rounded-full text-danger hover:bg-danger/10 transition-colors"
                      title="Hapus komponen"
                    >
                      <font-awesome-icon icon="fa-solid fa-trash-alt" class="text-xs" />
                    </button>
                  </div>
                </div>
              </div>

              <!-- Empty State -->
              <div
                v-else
                class="text-center py-6 border-2 border-dashed border-secondary/10 rounded-lg"
              >
                <font-awesome-icon
                  icon="fa-solid fa-basket-shopping"
                  class="text-2xl text-text/20 mb-2"
                />
                <p class="text-xs text-text/40">
                  Belum ada komponen yang ditambahkan.<br />Cari produk di atas untuk menambahkan.
                </p>
              </div>
            </div>
          </template>
        </div>

        <!-- Footer -->
        <div
          class="p-4 border-t border-secondary/20 bg-secondary/5 rounded-b-xl flex justify-end gap-3"
        >
          <button
            @click="$emit('close')"
            class="px-5 py-2.5 rounded-lg text-text/60 font-bold hover:bg-secondary/10 transition-colors text-sm"
          >
            Batal
          </button>
          <button
            @click="handleSubmit"
            :disabled="loading || fetchLoading"
            class="px-5 py-2.5 rounded-lg bg-primary text-white font-bold hover:bg-primary-dark shadow-lg shadow-primary/30 flex items-center gap-2 text-sm disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-95"
          >
            <font-awesome-icon
              v-if="loading"
              icon="fa-solid fa-circle-notch"
              class="animate-spin"
            />
            <span v-else><font-awesome-icon icon="fa-solid fa-save" /></span>
            <span>{{ mode === 'create' ? 'Simpan Produk' : 'Simpan Perubahan' }}</span>
          </button>
        </div>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.modal-fade-enter-active,
.modal-fade-leave-active {
  transition: opacity 0.2s ease;
}
.modal-fade-enter-from,
.modal-fade-leave-to {
  opacity: 0;
}

.animate-fade-in {
  animation: fadeIn 0.3s ease-out forwards;
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(-5px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

/* Custom Scrollbar untuk area list komponen */
.custom-scrollbar::-webkit-scrollbar {
  width: 6px;
}
.custom-scrollbar::-webkit-scrollbar-track {
  background: transparent;
}
.custom-scrollbar::-webkit-scrollbar-thumb {
  background-color: rgba(156, 163, 175, 0.3);
  border-radius: 20px;
}
.custom-scrollbar::-webkit-scrollbar-thumb:hover {
  background-color: rgba(156, 163, 175, 0.5);
}
</style>
