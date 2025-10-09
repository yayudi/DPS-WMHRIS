<!-- WMS.vue -->
<script setup>
import { ref, watch, computed, onMounted, onUnmounted, nextTick } from 'vue'
import { RouterLink } from 'vue-router'
import { useToast } from '@/composables/UseToast.js'
import Tabs from '@/components/Tabs.vue'
import { useAuthStore } from '@/stores/auth.js'
import { fetchAllProducts as fetchProductsFromApi } from '@/api/helpers/wms.js'

// --- STATE MANAGEMENT ---
const activeView = ref('gudang')
const isTransferModalOpen = ref(false)
const isUploadModalOpen = ref(false)
const selectedProduct = ref(null)
const uploadSource = ref('tiktok')
const transferAmount = ref(1)
const showPriceColumn = ref(false)
const auth = useAuthStore()

// --- SEARCH & FILTER STATE ---
const showMinusStockOnly = ref(false)
const searchBy = ref('name')
const searchTerm = ref('')
let debounceTimer = null

// --- TABS DATA ---
const warehouseViews = [
  { label: 'Gudang', value: 'gudang' },
  { label: 'Pajangan', value: 'pajangan' },
  { label: 'LTC', value: 'ltc' },
]
const searchTabs = [
  { label: 'Nama', value: 'name' },
  { label: 'SKU', value: 'sku' },
]

// --- AUTO-REFETCH STATE ---
const isAutoRefetching = ref(true) // Default 'on'
let refetchIntervalId = null

// --- API DATA & STATES ---
const allProducts = ref([]) // MENYIMPAN SEMUA DATA DARI API
const displayedProducts = ref([]) // MENYIMPAN DATA YANG DITAMPILKAN
const loading = ref(true)
const error = ref(null)
const page = ref(1)
const pageSize = 30 // Jumlah item per halaman
const hasMoreData = ref(true)
const loader = ref(null) // Ref untuk elemen pemicu;
const { show } = useToast()

function copyToClipboard(text, fieldName) {
  if (!text) return
  navigator.clipboard
    .writeText(text)
    .then(() => {
      show(`${fieldName} disalin ke clipboard!`, 'success')
    })
    .catch((err) => {
      console.error('Gagal menyalin:', err)
      show('Gagal menyalin teks.', 'error')
    })
}

function transformProduct(rawProduct) {
  const pajanganLocations = rawProduct.k.filter((loc) => loc.l.startsWith('A12'))
  const stockPajangan = pajanganLocations.reduce((sum, loc) => sum + loc.q, 0)
  const lokasiPajangan = pajanganLocations.map((loc) => loc.l).join(', ')

  const gudangLocations = rawProduct.k.filter(
    (loc) => loc.l.startsWith('A19') || loc.l.startsWith('A20'),
  )
  const stockGudang = gudangLocations.reduce((sum, loc) => sum + loc.q, 0)
  const lokasiGudang = gudangLocations.map((loc) => loc.l).join(', ')

  const ltcLocation = rawProduct.k.find((loc) => loc.l === 'LTC')
  const stockLTC = ltcLocation ? ltcLocation.q : 0
  const lokasiLTC = ltcLocation ? ltcLocation.l : 'N/A'

  const randomIdealStock = Math.floor(Math.random() * 1000)
  const stockPajanganMock = stockPajangan - randomIdealStock

  return {
    id: rawProduct.s,
    sku: rawProduct.s,
    name: rawProduct.n,
    price: rawProduct.p,
    stockPajangan,
    stockPajanganMock,
    lokasiPajangan,
    pajanganLocations,
    stockGudang,
    lokasiGudang,
    gudangLocations,
    stockLTC,
    lokasiLTC,
  }
}

// --- API FETCHING ---
async function fetchAllProducts() {
  loading.value = true
  error.value = null
  try {
    const rawProducts = await fetchProductsFromApi()

    allProducts.value = rawProducts.map(transformProduct)

    if (!auth.canViewPrices) {
      allProducts.value.forEach((product) => {
        delete product.price
      })
    }
    resetAndLoad()
  } catch (err) {
    console.error('Error fetching WMS products:', err)
    error.value = 'Gagal memuat data produk.'
  } finally {
    loading.value = false
  }
}

// --- AUTO REFETCH ---
async function refetchProducts() {
  try {
    // ✅ 4. Gunakan helper juga di sini untuk konsistensi
    const rawProducts = await fetchProductsFromApi()

    // Gunakan transformer yang sama, tidak ada duplikasi kode
    allProducts.value = rawProducts.map(transformProduct)

    if (!searchTerm.value) {
      resetAndLoad()
    }
    show('Data stok berhasil diperbarui secara otomatis.', 'success')
  } catch (err) {
    console.error('Auto-refetch failed:', err)
    show('Gagal memperbarui data stok.', 'error')
  }
}

// --- LAZY LOADING ---
const currentViewProducts = computed(() => {
  return allProducts.value.filter((p) => {
    let isRelevant = false
    let stockValue = 0

    if (activeView.value === 'pajangan') {
      isRelevant = p.lokasiPajangan
      stockValue = p.stockPajangan
    } else if (activeView.value === 'gudang') {
      isRelevant = p.lokasiGudang
      stockValue = p.stockGudang
    } else if (activeView.value === 'ltc') {
      isRelevant = p.lokasiLTC !== 'N/A'
      stockValue = p.stockLTC
    }

    if (!isRelevant) return false
    if (showMinusStockOnly.value) return stockValue < 0
    return true
  })
})

function loadMoreProducts() {
  if (!hasMoreData.value) return
  const sourceProducts = currentViewProducts.value
  const start = (page.value - 1) * pageSize
  const end = page.value * pageSize
  const newProducts = sourceProducts.slice(start, end)

  displayedProducts.value.push(...newProducts)

  if (end >= sourceProducts.length) {
    hasMoreData.value = false
  } else {
    page.value++
  }
}

function resetAndLoad() {
  page.value = 1
  hasMoreData.value = true
  displayedProducts.value = []
  loadMoreProducts()
}

// --- COMPUTED PROPERTIES ---
const searchPlaceholder = computed(
  () => `Cari produk berdasarkan ${searchBy.value === 'name' ? 'Nama' : 'SKU'}...`,
)

const filteredProducts = computed(() => {
  if (searchTerm.value) {
    const searchLower = searchTerm.value.toLowerCase()
    let results = allProducts.value.filter((p) => {
      const targetField = searchBy.value === 'name' ? p.name : p.sku
      return targetField && targetField.toLowerCase().includes(searchLower)
    })
    if (showMinusStockOnly.value) {
      results = results.filter((p) => {
        if (activeView.value === 'pajangan') return p.stockPajangan < 0
        if (activeView.value === 'gudang') return p.stockGudang < 0
        if (activeView.value === 'ltc') return p.stockLTC < 0
        return false
      })
    }
    return results
  }
  // Jika tidak mencari, kembalikan daftar lazy load
  return displayedProducts.value
})

// --- DEBOUNCE FUNCTION ---
function handleSearchInput(event) {
  clearTimeout(debounceTimer)
  debounceTimer = setTimeout(() => {
    searchTerm.value = event.target.value
  }, 300)
}

// --- LIFECYCLE & WATCHERS ---
let observer

onMounted(() => {
  fetchAllProducts() // Ganti nama fungsi awal

  observer = new IntersectionObserver(
    ([entry]) => {
      if (entry && entry.isIntersecting && !searchTerm.value) {
        // Muat lebih banyak jika loader terlihat dan tidak sedang mencari
        loadMoreProducts()
      }
    },
    { threshold: 0.5 },
  )
})

onUnmounted(() => {
  if (observer) observer.disconnect()
})

watch(loading, async (isLoading) => {
  if (!isLoading && !error.value) {
    await nextTick()
    if (loader.value) {
      observer.observe(loader.value)
    }
  }
})

// Reset lazy loading saat view atau pencarian berubah
watch(activeView, () => {
  if (!searchTerm.value) resetAndLoad()
})
watch(searchBy, () => {
  searchTerm.value = ''
})
watch(isAutoRefetching, (isActive) => {
  if (isActive) {
    if (!refetchIntervalId) {
      refetchProducts() // Langsung refresh saat diaktifkan
      refetchIntervalId = setInterval(refetchProducts, 60000)
    }
  } else {
    clearInterval(refetchIntervalId)
    refetchIntervalId = null
  }
})
watch(showMinusStockOnly, () => {
  if (!searchTerm.value) resetAndLoad()
})

function openTransferModal(product) {
  selectedProduct.value = product
  isTransferModalOpen.value = true
  transferAmount.value = 1
}
function closeTransferModal() {
  isTransferModalOpen.value = false
  selectedProduct.value = null
}
function openUploadModal() {
  isUploadModalOpen.value = true
}
function closeUploadModal() {
  isUploadModalOpen.value = false
}
function handleTransferConfirm() {
  console.log(`Mentransfer ${transferAmount.value} unit ${selectedProduct.value.name}`)
  closeTransferModal()
}
function handleFileUpload(event) {
  const file = event.target.files[0]
  if (file) {
    console.log(`File dipilih untuk diupload dari sumber: ${uploadSource.value}`, file)
    closeUploadModal()
  }
}
</script>
<template>
  <div class="bg-secondary/20 min-h-screen p-4 sm:p-6">
    <!-- Header Halaman & Aksi Global -->
    <div class="mb-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
      <h2 class="text-2xl font-bold text-text flex items-center gap-3">
        <font-awesome-icon icon="fa-solid fa-warehouse" />
        <span>Warehouse Management</span>
      </h2>
      <div class="flex items-center gap-2">
        <div
          class="flex items-center gap-2 bg-background border border-secondary/30 px-2 py-1 rounded-lg"
        >
          <label for="auto-refetch" class="text-sm font-semibold text-text/80 cursor-pointer"
            >Auto-Refresh</label
          >
          <button
            @click="isAutoRefetching = !isAutoRefetching"
            :class="[
              'relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2',
              isAutoRefetching ? 'bg-primary' : 'bg-secondary/50',
            ]"
          >
            <span
              :class="[
                'pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out',
                isAutoRefetching ? 'translate-x-5' : 'translate-x-0',
              ]"
            ></span>
          </button>
        </div>
        <RouterLink
          to="/stats"
          class="bg-background border border-secondary/30 text-text/80 hover:bg-secondary/20 text-sm font-semibold px-4 py-2 rounded-lg transition-colors flex items-center gap-2"
        >
          <font-awesome-icon icon="fa-solid fa-chart-line" />
          <span>Laporan Stok</span>
        </RouterLink>
        <button
          @click="openUploadModal"
          class="bg-primary/0 border border-primary text-primary hover:bg-primary/30 text-sm font-semibold px-4 py-2 rounded-lg transition-colors flex items-center gap-2"
        >
          <font-awesome-icon icon="fa-solid fa-file-import" />
          <span>Import Data</span>
        </button>
        <button
          class="bg-primary text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-primary/90 transition-colors flex items-center gap-2"
        >
          <font-awesome-icon icon="fa-solid fa-plus" />
          <span>Tambah Produk</span>
        </button>
      </div>
    </div>

    <!-- Panel Kontrol Utama -->
    <div
      class="bg-background rounded-xl shadow-md border border-secondary/20 p-6 space-y-6 min-h-screen sm:p-6"
    >
      <!-- Search & Toggle -->
      <div class="flex flex-col md:flex-row justify-between items-center gap-4">
        <!-- SEARCH BAR & SWITCH -->
        <div class="flex-grow w-full md:w-auto flex items-center gap-4">
          <div class="relative flex-grow">
            <font-awesome-icon
              icon="fa-solid fa-search"
              class="absolute left-3 top-1/2 -translate-y-1/2 text-text/40"
            />
            <input
              type="text"
              @input="handleSearchInput"
              :placeholder="searchPlaceholder"
              class="w-full pl-10 pr-4 py-2 bg-background border border-secondary/50 text-text rounded-lg focus:ring-2 focus:ring-primary/50 focus:border-primary transition"
            />
          </div>
          <Tabs :tabs="searchTabs" v-model="searchBy" />
          <!-- CHECKBOX FILTER BARU -->
          <button
            @click="showMinusStockOnly = !showMinusStockOnly"
            :class="[
              'px-3 py-2 text-sm font-semibold rounded-lg transition-all flex items-center gap-2 border',
              showMinusStockOnly
                ? 'bg-accent/15 border-accent text-accent shadow-sm'
                : 'bg-secondary/30 border-secondary/90 text-text/50 hover:bg-secondary/50 hover:border-accent hover:text-accent',
            ]"
          >
            <span>Stok Minus</span>
          </button>
        </div>

        <!-- Toggle Switch Gudang -->
        <Tabs :tabs="warehouseViews" v-model="activeView" />
      </div>

      <!-- KONTEN KONDISIONAL BERDASARKAN STATE API -->
      <div v-if="loading" class="text-center py-16">
        <font-awesome-icon icon="fa-solid fa-spinner" class="animate-spin text-primary text-3xl" />
        <p class="mt-3 text-text/70 text-sm">Memuat data produk...</p>
      </div>

      <div v-else-if="error" class="text-center py-16">
        <font-awesome-icon icon="fa-solid fa-exclamation-triangle" class="text-accent text-3xl" />
        <p class="mt-3 font-semibold text-text">Gagal Memuat Data</p>
        <p class="text-sm text-text/70">{{ error }}</p>
      </div>
      <!-- TABEL DATA -->
      <div v-else class="overflow-x-auto">
        <div class="min-w-[900px]">
          <!-- HEADER TABEL -->
          <div
            :class="auth.canViewPrices ? 'grid-cols-8' : 'grid-cols-7'"
            class="grid gap-4 bg-secondary/10 p-3 font-bold text-xs text-text/80 uppercase rounded-t-lg"
          >
            <div class="col-span-3 text-center">Produk</div>
            <div class="col-span-1 text-center">SKU</div>
            <div v-if="auth.canViewPrices" class="col-span-1 text-center">Harga</div>
            <div class="col-span-1 text-center">Lokasi</div>
            <div class="col-span-1 text-center">Stok</div>
            <div class="col-span-1 text-center">Aksi</div>
          </div>
          <div class="divide-y divide-secondary/20">
            <!-- BODY TABEL -->
            <div
              v-for="product in filteredProducts"
              :key="product.id"
              :class="auth.canViewPrices ? 'grid-cols-8' : 'grid-cols-7'"
              class="grid grid-cols-8 gap-4 items-center p-3 hover:bg-primary/10 transition-colors"
            >
              <div class="col-span-3 group relative">
                <span
                  @click="copyToClipboard(product.name, 'Nama Produk')"
                  class="font-semibold text-sm text-text cursor-pointer hover:text-primary transition-colors"
                  >{{ product.name }}</span
                >
                <span
                  class="absolute -top-7 left-0 w-max bg-text text-background text-xs font-semibold px-2 py-1 rounded-md shadow-lg opacity-0 invisible group-hover:opacity-100 transition-opacity duration-200"
                  >Salin Nama</span
                >
              </div>

              <div class="col-span-1 text-center text-sm text-text/70 font-mono group relative">
                <span @click="copyToClipboard(product.sku, 'SKU')" class="cursor-pointer">{{
                  product.sku
                }}</span>
                <span
                  class="absolute -top-7 left-1/2 -translate-x-1/2 w-max bg-text text-background text-xs font-semibold px-2 py-1 rounded-md shadow-lg opacity-0 invisible group-hover:opacity-100 transition-opacity duration-200"
                  >Salin SKU</span
                >
              </div>

              <div
                v-if="auth.canViewPrices"
                class="col-span-1 text-right text-sm text-text/70 font-mono group relative"
              >
                <span @click="copyToClipboard(product.price, 'Harga')" class="cursor-pointer"
                  >Rp {{ product.price.toLocaleString('id-ID') }}</span
                >
                <span
                  class="absolute -top-7 right-0 w-max bg-text text-background text-xs font-semibold px-2 py-1 rounded-md shadow-lg opacity-0 invisible group-hover:opacity-100 transition-opacity duration-200"
                  >Salin Harga</span
                >
              </div>

              <div class="col-span-1 text-sm text-text/70 font-mono relative group">
                <span
                  v-if="activeView === 'gudang'"
                  @click="copyToClipboard(product.lokasiGudang, 'Lokasi Gudang')"
                  class="cursor-help"
                  >{{ product.lokasiGudang || '-' }}</span
                >
                <span v-if="activeView === 'pajangan'">{{ product.lokasiPajangan || '-' }}</span>
                <span v-if="activeView === 'ltc'">{{ product.lokasiLTC }}</span>
                <div
                  v-if="
                    (activeView === 'gudang' && product.gudangLocations.length > 1) ||
                    (activeView === 'pajangan' && product.pajanganLocations.length > 1)
                  "
                  class="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-max max-w-xs p-2.5 bg-text text-background text-xs rounded-md shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-opacity duration-300 z-10"
                >
                  <ul class="space-y-1">
                    <template v-if="activeView === 'gudang'"
                      ><li
                        v-for="loc in product.gudangLocations"
                        :key="loc.l"
                        @click="copyToClipboard(loc.l + ': ' + loc.q, 'Lokasi Gudang')"
                        class="flex justify-between gap-4"
                      >
                        <span>{{ loc.l }}:</span><span class="font-bold">{{ loc.q }}</span>
                      </li></template
                    >
                    <template v-if="activeView === 'pajangan'"
                      ><li
                        v-for="loc in product.pajanganLocations"
                        :key="loc.l"
                        @click="copyToClipboard(loc.l + ': ' + loc.q, 'Lokasi Pajangan')"
                        class="flex justify-between gap-4"
                      >
                        <span>{{ loc.l }}:</span><span class="font-bold">{{ loc.q }}</span>
                      </li></template
                    >
                  </ul>
                  <div
                    class="absolute left-1/2 -translate-x-1/2 top-full w-0 h-0 border-x-4 border-x-transparent border-t-4 border-t-text"
                  ></div>
                </div>
              </div>
              <div class="col-span-1 text-center text-lg font-mono font-bold">
                <span
                  v-if="activeView === 'gudang'"
                  @click="copyToClipboard(product.stockGudang, 'Stok Gudang')"
                  class="text-primary"
                  >{{ product.stockGudang }}</span
                >
                <span
                  v-if="activeView === 'ltc'"
                  @click="copyToClipboard(product.stockLTC, 'Stok LTC')"
                  class="text-primary"
                  >{{ product.stockLTC }}</span
                >
                <div v-if="activeView === 'pajangan'">
                  <div v-if="product.stockPajangan === 0" class="text-accent text-xl">
                    <font-awesome-icon icon="fa-solid fa-xmark" />
                  </div>
                  <div
                    v-else
                    @click="
                      copyToClipboard(
                        product.stockPajangan + ' / ' + product.stockPajanganIdeal,
                        'Stok Pajangan',
                      )
                    "
                    :class="{
                      'text-green-600': product.stockPajanganMock >= product.stockPajangan,
                      'text-yellow-500':
                        product.stockPajanganMock < product.stockPajangan &&
                        product.stockPajanganMock > product.stockPajangan * 0.1,
                      'text-accent': product.stockPajanganMock <= product.stockPajangan * 0.1,
                    }"
                  >
                    {{ product.stockPajanganMock }} / {{ product.stockPajangan }}
                  </div>
                </div>
              </div>
              <div class="col-span-1 flex justify-center items-center gap-2 text-text/60">
                <button
                  @click="openTransferModal(product)"
                  class="hover:text-primary transition-colors"
                >
                  <font-awesome-icon icon="fa-solid fa-right-left" />
                </button>
                <button class="hover:text-primary transition-colors">
                  <font-awesome-icon icon="fa-solid fa-pencil" />
                </button>
                <button class="hover:text-primary transition-colors">
                  <font-awesome-icon icon="fa-solid fa-history" />
                </button>
              </div>
            </div>
          </div>

          <!-- ELEMEN PEMICU & LOADER UNTUK LAZY LOAD -->
          <div ref="loader" class="text-center py-6">
            <span v-if="!searchTerm && hasMoreData" class="text-text/50 text-sm"
              >Memuat lebih banyak...</span
            >
            <span
              v-if="!searchTerm && !hasMoreData && allProducts.length > 0"
              class="text-text/50 text-sm"
              >-- Akhir dari daftar --</span
            >
          </div>
        </div>
      </div>
    </div>
  </div>

  <!-- MODAL -->
  <transition
    enter-active-class="transition ease-out duration-200"
    enter-from-class="transform opacity-0 scale-95"
    enter-to-class="transform opacity-100 scale-100"
    leave-active-class="transition ease-in duration-100"
    leave-from-class="transform opacity-100 scale-100"
    leave-to-class="transform opacity-0 scale-95"
  >
    <div
      v-if="isTransferModalOpen"
      @click.self="closeTransferModal"
      class="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center p-4 z-50"
    >
      <div v-if="selectedProduct" class="bg-background rounded-lg shadow-xl w-full max-w-sm">
        <div class="p-4 border-b border-secondary/20">
          <h3 class="font-bold text-text">Transfer Stok</h3>
          <p class="text-sm text-text/70">{{ selectedProduct.name }}</p>
        </div>
        <div class="p-4 space-y-4">
          <div class="grid grid-cols-2 gap-4 text-center">
            <div>
              <label class="text-xs text-text/70">Dari Gudang</label>
              <p class="text-2xl font-bold text-text">{{ selectedProduct.stockWarehouse }}</p>
            </div>
            <div>
              <label class="text-xs text-text/70">Ke Display</label>
              <p class="text-2xl font-bold text-text">{{ selectedProduct.stockDisplay }}</p>
            </div>
          </div>
          <div>
            <label for="transfer-amount" class="text-sm font-medium text-text/80"
              >Jumlah Transfer</label
            ><input
              id="transfer-amount"
              type="number"
              v-model="transferAmount"
              min="1"
              :max="selectedProduct.stockWarehouse"
              class="mt-1 w-full text-center text-lg p-2 bg-background border border-secondary/50 text-text rounded-lg focus:ring-2 focus:ring-primary/50 focus:border-primary transition"
            />
          </div>
        </div>
        <div class="p-4 bg-secondary/10 flex justify-end gap-2 rounded-b-lg">
          <button
            @click="closeTransferModal"
            class="bg-background border border-secondary/30 text-text/80 hover:bg-secondary/20 text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
          >
            Batal</button
          ><button
            @click="handleTransferConfirm"
            class="bg-primary text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-primary/90 transition-colors"
          >
            Konfirmasi
          </button>
        </div>
      </div>
    </div>
  </transition>
  <transition
    enter-active-class="transition ease-out duration-200"
    enter-from-class="transform opacity-0 scale-95"
    enter-to-class="transform opacity-100 scale-100"
    leave-active-class="transition ease-in duration-100"
    leave-from-class="transform opacity-100 scale-100"
    leave-to-class="transform opacity-0 scale-95"
  >
    <div
      v-if="isUploadModalOpen"
      @click.self="closeUploadModal"
      class="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center p-4 z-50"
    >
      <div class="bg-background rounded-lg shadow-xl w-full max-w-md">
        <div class="p-4 border-b border-secondary/20">
          <h3 class="font-bold text-text">Import Data Perpindahan Stok</h3>
          <p class="text-sm text-text/70">Upload file dari marketplace</p>
        </div>
        <div class="p-4 space-y-4">
          <div>
            <label class="text-sm font-medium text-text/80">Pilih Sumber</label>
            <div class="mt-2 grid grid-cols-3 gap-2">
              <button
                @click="uploadSource = 'tiktok'"
                :class="[
                  'p-2 text-sm rounded-md border-2 transition-all',
                  uploadSource === 'tiktok'
                    ? 'border-primary bg-primary/10 text-primary font-bold'
                    : 'border-secondary/30 bg-background hover:border-primary/50',
                ]"
              >
                TikTok</button
              ><button
                @click="uploadSource = 'shopee'"
                :class="[
                  'p-2 text-sm rounded-md border-2 transition-all',
                  uploadSource === 'shopee'
                    ? 'border-primary bg-primary/10 text-primary font-bold'
                    : 'border-secondary/30 bg-background hover:border-primary/50',
                ]"
              >
                Shopee</button
              ><button
                @click="uploadSource = 'lazada'"
                :class="[
                  'p-2 text-sm rounded-md border-2 transition-all',
                  uploadSource === 'lazada'
                    ? 'border-primary bg-primary/10 text-primary font-bold'
                    : 'border-secondary/30 bg-background hover:border-primary/50',
                ]"
              >
                Lazada
              </button>
            </div>
          </div>
          <div>
            <label
              for="file-upload"
              class="cursor-pointer mt-2 flex justify-center w-full px-6 pt-5 pb-6 border-2 border-secondary/30 border-dashed rounded-md hover:border-primary/50"
              ><div class="space-y-1 text-center">
                <font-awesome-icon
                  icon="fa-solid fa-cloud-arrow-up"
                  class="mx-auto h-12 w-12 text-text/30"
                />
                <div class="flex text-sm text-text/60">
                  <p class="pl-1">Klik untuk upload atau drag and drop</p>
                </div>
                <p class="text-xs text-text/50">CSV, XLS, atau XLSX</p>
              </div>
              <input
                id="file-upload"
                name="file-upload"
                type="file"
                class="sr-only"
                @change="handleFileUpload"
            /></label>
          </div>
        </div>
        <div class="p-4 bg-secondary/10 flex justify-end gap-2 rounded-b-lg">
          <button
            @click="closeUploadModal"
            class="bg-background border border-secondary/30 text-text/80 hover:bg-secondary/20 text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
          >
            Batal
          </button>
        </div>
      </div>
    </div>
  </transition>
</template>
