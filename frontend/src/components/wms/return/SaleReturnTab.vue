<script setup>
import { onMounted, ref, computed, watch } from 'vue'
import { useRouter } from 'vue-router'
import { FontAwesomeIcon } from '@fortawesome/vue-fontawesome'

// Components
import Modal from '@/components/ui/Modal.vue'
import Tabs from '@/components/ui/Tabs.vue'
import { useReturnManager } from '@/composables/useReturnManager'
import { formatDate } from '@/api/helpers/time'

const router = useRouter()

// Logic dari Composable
const {
  activeTab,
  locations,
  isLoading,
  searchQuery,
  filteredItems,
  showProcessModal,
  processForm,
  fetchData,
  openProcessModal,
  submitProcess,
} = useReturnManager()

// --- WATCHER: SET DEFAULT LOCATIONS ---
watch(showProcessModal, (isOpen) => {
  if (isOpen && locations.value.length > 0) {
    // Default Good Condition -> 'A12 - 1'
    const defaultGood = locations.value.find((l) => l.code === 'A12 - 1')
    if (defaultGood) {
      processForm.value.good.locationId = defaultGood.id
    }

    // Fixed Bad Condition -> 'SAKRUK' (Set ID secara background)
    const defaultBad = locations.value.find((l) => l.code === 'SAKRUK')
    if (defaultBad) {
      processForm.value.bad.locationId = defaultBad.id
    }
  }
})

// --- COMPUTED HELPERS UNTUK VALIDASI UI ---
const remainingQty = computed(() => {
  if (!processForm.value.itemData) return 0
  const total = processForm.value.itemData.quantity
  const used =
    (parseInt(processForm.value.good.qty) || 0) + (parseInt(processForm.value.bad.qty) || 0)
  return total - used
})

const isOverLimit = computed(() => remainingQty.value < 0)

// --- STATE LOKAL UI ---
const sourceFilter = ref('')
const sortOrder = ref('desc')

const tabList = [
  { label: 'Antrian Proses', value: 'pending' },
  { label: 'Riwayat Selesai', value: 'history' },
]

const sourceOptions = [
  { label: 'Semua Sumber', value: '' },
  { label: 'Tokopedia', value: 'tokopedia' },
  { label: 'Shopee', value: 'shopee' },
  { label: 'Manual', value: 'manual' },
]

const displayItems = computed(() => {
  let items = [...filteredItems.value]

  if (sourceFilter.value) {
    items = items.filter((item) => {
      const s = (item.source || item.type || '').toLowerCase()
      return s.includes(sourceFilter.value)
    })
  }

  items.sort((a, b) => {
    const dateA = new Date(a.date || a.created_at)
    const dateB = new Date(b.date || b.created_at)
    return sortOrder.value === 'desc' ? dateB - dateA : dateA - dateB
  })

  return items
})

function goToManualPage() {
  router.push({ name: 'ManualReturn' })
}

const getSourceClass = (source) => {
  const s = (source || '').toLowerCase()
  if (s.includes('tokopedia')) return 'bg-success/10 text-success border-success/20'
  if (s.includes('shopee')) return 'bg-warning/10 text-warning border-warning/20'
  if (s === 'manual') return 'bg-primary/10 text-primary border-primary/20'
  if (s === 'system') return 'bg-accent/10 text-accent border-accent/20'
  return 'bg-secondary/10 text-text/60 border-secondary/20'
}

onMounted(() => {
  fetchData()
})
</script>

<template>
  <div class="space-y-6 animate-fade-in text-text">
    <!-- Top Section: Header & Actions -->
    <div class="flex flex-col gap-4 bg-background/50 p-1 rounded-xl">
      <!-- Row 1: Tabs & Add Button -->
      <div class="flex flex-col md:flex-row justify-between gap-4 items-center">
        <div class="w-full md:w-auto">
          <Tabs :tabs="tabList" v-model="activeTab" />
        </div>
        <button @click="goToManualPage"
          class="btn-primary w-full md:w-auto text-sm flex items-center justify-center gap-2 shadow-lg shadow-primary/10 hover:shadow-primary/20 transition-all active:scale-95">
          <font-awesome-icon icon="fa-solid fa-plus" />
          <span>Input Retur Manual</span>
        </button>
      </div>

      <!-- Row 2: Filters & Search -->
      <div class="grid grid-cols-1 md:grid-cols-12 gap-3 pb-2">
        <!-- Search -->
        <div class="md:col-span-5 relative">
          <font-awesome-icon icon="fa-solid fa-search"
            class="absolute left-3 top-1/2 -translate-y-1/2 text-text/30 text-xs" />
          <input v-model="searchQuery" type="text" placeholder="Cari Invoice, SKU, atau Produk..."
            class="input-filter pl-9" />
        </div>

        <!-- Filter Source -->
        <div class="md:col-span-3">
          <select v-model="sourceFilter" class="input-filter appearance-none cursor-pointer">
            <option v-for="opt in sourceOptions" :key="opt.value" :value="opt.value">
              {{ opt.label }}
            </option>
          </select>
        </div>

        <!-- Sort Date -->
        <div class="md:col-span-2">
          <select v-model="sortOrder" class="input-filter appearance-none cursor-pointer">
            <option value="desc">Terbaru</option>
            <option value="asc">Terlama</option>
          </select>
        </div>

        <!-- Stats / Counter -->
        <div
          class="md:col-span-2 flex items-center justify-end px-3 text-xs font-bold text-text/40 bg-secondary/5 rounded-lg border border-secondary/10">
          <span>{{ displayItems.length }} Data</span>
        </div>
      </div>
    </div>

    <!-- Table Container -->
    <div
      class="bg-secondary/5 rounded-xl border border-secondary/20 overflow-hidden shadow-sm min-h-[400px] relative flex flex-col">
      <!-- Table Header -->
      <!-- Table Header (Desktop Only) -->
      <div
        class="hidden md:grid grid-cols-12 gap-4 px-6 py-3 bg-secondary/10 border-b border-secondary/20 text-[10px] font-bold uppercase tracking-wider text-text/60">
        <div class="md:col-span-3">Invoice / Ref</div>
        <div class="md:col-span-4">Produk</div>
        <div class="md:col-span-2 text-center">Qty</div>
        <div class="md:col-span-2 text-center">Sumber</div>
        <div class="md:col-span-1 text-right">
          {{ activeTab === 'pending' ? 'Aksi' : 'Status' }}
        </div>
      </div>

      <!-- SKELETON LOADING STATE -->
      <div v-if="isLoading" class="divide-y divide-secondary/10 animate-pulse bg-background">
        <div v-for="i in 5" :key="i" class="grid grid-cols-12 gap-4 px-6 py-4 items-start">
          <div class="col-span-12 md:col-span-3 space-y-2">
            <div class="h-4 bg-secondary/20 rounded w-24"></div>
            <div class="h-3 bg-secondary/10 rounded w-16"></div>
          </div>
          <div class="col-span-12 md:col-span-4 space-y-2">
            <div class="h-4 bg-secondary/20 rounded w-full"></div>
            <div class="h-3 bg-secondary/10 rounded w-2/3"></div>
          </div>
          <div class="col-span-6 md:col-span-2 flex md:justify-center">
            <div class="h-6 w-8 bg-secondary/20 rounded"></div>
          </div>
          <div class="col-span-6 md:col-span-2 flex md:justify-center">
            <div class="h-5 w-16 bg-secondary/10 rounded"></div>
          </div>
          <div class="col-span-12 md:col-span-1 flex md:justify-end mt-2 md:mt-0">
            <div class="h-6 w-16 bg-secondary/20 rounded"></div>
          </div>
        </div>
      </div>

      <!-- EMPTY STATE -->
      <div v-else-if="displayItems.length === 0"
        class="flex-1 flex flex-col items-center justify-center p-12 text-text/40">
        <div class="w-20 h-20 bg-secondary/10 rounded-full flex items-center justify-center mb-4">
          <font-awesome-icon icon="fa-solid fa-box-open" class="text-3xl opacity-50" />
        </div>
        <h3 class="text-sm font-bold text-text/70">Tidak ada data ditemukan</h3>
        <p class="text-xs mt-1 max-w-xs text-center">
          Coba ubah kata kunci pencarian atau filter sumber data Anda.
        </p>
      </div>

      <!-- DATA LIST -->
      <div v-else class="divide-y divide-secondary/10 bg-background">
        <transition-group name="list">
          <div v-for="item in displayItems" :key="item.id"
            class="grid grid-cols-12 gap-4 px-6 py-4 items-start hover:bg-primary/[0.02] transition-colors group">
            <!-- Col 1: Invoice -->
            <div class="col-span-12 md:col-span-3">
              <div class="flex flex-col items-start gap-1.5">
                <span
                  class="font-mono font-bold text-primary bg-primary/10 px-2 py-0.5 rounded text-xs border border-primary/20 select-all">
                  {{ item.reference || item.original_invoice_id }}
                </span>
                <div class="flex items-center gap-1.5 text-[10px] text-text/50">
                  <font-awesome-icon icon="fa-solid fa-clock" />
                  <span>{{ formatDate(item.date || item.created_at) || '-' }}</span>
                </div>
                <!-- Note badge -->
                <div v-if="item.notes"
                  class="text-[10px] text-text/60 italic bg-secondary/20 px-1.5 py-0.5 rounded border border-secondary/30 max-w-full truncate"
                  :title="item.notes">
                  <font-awesome-icon icon="fa-solid fa-sticky-note" class="mr-1 opacity-50" />
                  {{ item.notes }}
                </div>
              </div>
            </div>

            <!-- Col 2: Produk -->
            <div class="col-span-12 md:col-span-4">
              <div class="font-bold text-text text-sm mb-0.5">
                {{ item.sku || item.original_sku }}
              </div>
              <div class="text-xs text-text/60 line-clamp-2 leading-relaxed" :title="item.product_name">
                {{ item.product_name }}
              </div>
            </div>

            <!-- Col 3: Qty -->
            <div class="col-span-6 md:col-span-2 flex md:justify-center items-center gap-2 md:gap-0">
              <span class="md:hidden text-[10px] font-bold text-text/40 uppercase">Qty:</span>
              <span
                class="font-mono font-bold text-sm bg-secondary/10 text-text border border-secondary/20 px-2.5 py-1 rounded-md h-fit">
                {{ item.quantity }}
              </span>
            </div>

            <!-- Col 4: Sumber (Now Visible on Mobile) -->
            <div class="col-span-6 md:col-span-2 flex md:justify-center items-center gap-2 md:gap-0">
              <span class="md:hidden text-[10px] font-bold text-text/40 uppercase">Source:</span>
              <span :class="[
                'px-2 py-1 rounded text-[10px] font-bold border capitalize',
                getSourceClass(item.source || item.type || 'manual'),
              ]">
                {{ item.source || (item.type === 'MANUAL' ? 'Manual' : 'Marketplace') }}
              </span>
            </div>

            <!-- Col 5: Action -->
            <div class="col-span-12 md:col-span-1 flex justify-end items-start mt-2 md:mt-0">
              <button v-if="activeTab === 'pending'" @click="openProcessModal(item)"
                class="w-full md:w-auto bg-primary text-secondary p-2 md:px-3 md:py-1.5 rounded-lg text-xs font-bold hover:bg-primary/90 shadow-lg shadow-primary/20 flex items-center justify-center gap-2 transition-transform active:scale-95 group-hover:scale-105"
                title="Proses Retur">
                <font-awesome-icon icon="fa-solid fa-check" />
                <span>Proses</span>
              </button>

              <div v-else class="flex flex-col items-end gap-1 w-full md:w-auto">
                <span v-if="item.condition === 'BAD'"
                  class="w-full md:w-auto justify-center inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold border bg-danger/10 text-danger border-danger/20">
                  <font-awesome-icon icon="fa-solid fa-thumbs-down" /> Rusak
                </span>
                <span v-else-if="item.condition === 'GOOD'"
                  class="w-full md:w-auto justify-center inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold border bg-success/10 text-success border-success/20">
                  <font-awesome-icon icon="fa-solid fa-thumbs-up" /> Bagus
                </span>
                <span v-else
                  class="w-full md:w-auto justify-center inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold border bg-secondary/10 text-text/60 border-secondary/20">
                  <font-awesome-icon icon="fa-solid fa-check-circle" /> Selesai
                </span>
              </div>
            </div>
          </div>
        </transition-group>
      </div>
    </div>

    <!-- Modal Proses Split (Dual Condition) -->
    <Modal :show="showProcessModal" @close="showProcessModal = false" title="Validasi & Split Retur">
      <div class="space-y-5 text-text">
        <!-- Item Card Info -->
        <div class="bg-secondary/50 p-4 rounded-xl border border-secondary/20 flex gap-4">
          <div class="flex-1 overflow-hidden">
            <h4 class="font-bold text-sm truncate" :title="processForm.itemData?.product_name">
              {{ processForm.itemData?.product_name }}
            </h4>
            <div class="flex items-center justify-between mt-2 text-xs text-text/60">
              <span>
                {{ processForm.itemData?.original_invoice_id }}
              </span>
              <!-- Indikator Sisa -->
              <div class="flex items-center gap-2">
                <span>Total: <b>{{ processForm.itemData?.quantity }}</b></span>
                <span class="px-2 py-0.5 rounded-full font-bold text-[10px] border" :class="isOverLimit
                    ? 'bg-danger text-secondary border-danger'
                    : remainingQty === 0
                      ? 'bg-success text-secondary border-success'
                      : 'bg-warning/10 text-warning border-warning'
                  ">
                  Sisa: {{ remainingQty }}
                </span>
              </div>
            </div>
          </div>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <!-- PANEL KIRI: KONDISI BAGUS -->
          <div class="bg-success/5 border border-success/20 p-4 rounded-xl relative">
            <div
              class="absolute -top-2.5 left-3 px-2 bg-background text-[10px] font-bold text-success border border-success/20 rounded uppercase">
              <font-awesome-icon icon="fa-solid fa-thumbs-up" class="mr-1" /> Kondisi Bagus
            </div>

            <div class="space-y-3 mt-2">
              <div>
                <label class="label-input !text-success/70">Jumlah Bagus</label>
                <input v-model.number="processForm.good.qty" type="number" min="0"
                  class="input-field text-center font-bold font-mono !border-success/30 focus:!ring-success/20"
                  placeholder="0" />
              </div>
              <div>
                <label class="label-input !text-success/70">Masuk Rak</label>
                <div class="relative">
                  <select v-model="processForm.good.locationId" class="input-field appearance-none !border-success/30">
                    <option value="" disabled>-- Pilih Rak --</option>
                    <option v-for="loc in locations" :key="loc.id" :value="loc.id">
                      {{ loc.code }}
                    </option>
                  </select>
                  <font-awesome-icon icon="fa-solid fa-chevron-down"
                    class="absolute right-3 top-3 text-xs text-success/40 pointer-events-none" />
                </div>
              </div>
            </div>
          </div>

          <!-- PANEL KANAN: KONDISI RUSAK -->
          <div class="bg-danger/5 border border-danger/20 p-4 rounded-xl relative">
            <div
              class="absolute -top-2.5 left-3 px-2 bg-background text-[10px] font-bold text-danger border border-danger/20 rounded uppercase">
              <font-awesome-icon icon="fa-solid fa-thumbs-down" class="mr-1" /> Kondisi Rusak
            </div>

            <div class="space-y-3 mt-2">
              <div>
                <label class="label-input !text-danger/70">Jumlah Rusak</label>
                <input v-model.number="processForm.bad.qty" type="number" min="0"
                  class="input-field text-center font-bold font-mono !border-danger/30 focus:!ring-danger/20"
                  placeholder="0" />
              </div>
              <div>
                <label class="label-input !text-danger/70">Masuk Rak (Karantina)</label>
                <!-- TAMPILAN FIXED UNTUK SAKRUK -->
                <div
                  class="input-field !bg-danger/5 !border-danger/30 text-danger font-bold flex items-center justify-between cursor-not-allowed select-none">
                  <span>SAKRUK</span>
                  <font-awesome-icon icon="fa-solid fa-lock" class="text-xs opacity-50" />
                </div>
              </div>
            </div>
          </div>
        </div>

        <div>
          <label class="label-input">Catatan Tambahan</label>
          <textarea v-model="processForm.notes" rows="2" placeholder="Keterangan tambahan..."
            class="input-field resize-none"></textarea>
        </div>

        <button @click="submitProcess" :disabled="isOverLimit || isLoading || (processForm.good.qty === 0 && processForm.bad.qty === 0)
          "
          class="w-full bg-primary text-secondary py-3 rounded-xl font-bold hover:bg-primary/90 mt-2 shadow-lg shadow-primary/20 transition-all active:scale-[0.98] flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed">
          <font-awesome-icon v-if="isLoading" icon="fa-solid fa-circle-notch" spin />
          <font-awesome-icon v-else icon="fa-solid fa-save" />
          <span>{{ isLoading ? 'Memproses...' : 'Simpan & Proses Retur' }}</span>
        </button>
      </div>
    </Modal>
  </div>
</template>

<style scoped>
/* Utility */
.btn-primary {
  @apply bg-primary text-secondary px-4 py-2 rounded-lg font-bold hover:bg-primary/90 transition-all;
}

.label-input {
  @apply text-[10px] font-bold uppercase text-text/50 block mb-1.5 tracking-wide;
}

.input-filter {
  @apply w-full px-3 py-2 text-xs rounded-lg bg-secondary/10 border border-secondary/20 focus:bg-background focus:border-primary/50 focus:ring-1 focus:ring-primary/20 outline-none transition-all text-text placeholder-text/30;
}

.input-field {
  @apply w-full px-3 py-2 bg-background border border-secondary/30 rounded-lg outline-none focus:border-primary transition-colors text-sm text-text placeholder-text/30 focus:ring-1 focus:ring-primary/20;
}

/* List Transitions */
.list-enter-active,
.list-leave-active {
  transition: all 0.3s ease;
}

.list-enter-from,
.list-leave-to {
  opacity: 0;
  transform: translateX(-10px);
}

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
