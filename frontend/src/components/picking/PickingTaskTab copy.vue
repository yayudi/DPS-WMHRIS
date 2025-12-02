<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { useToast } from '@/composables/UseToast.js'
import { useInfiniteScroll } from '@/composables/useInfiniteScroll.js'
import {
  getPendingPickingItems,
  completePickingItems,
  cancelPickingList,
} from '@/api/helpers/picking.js'
import PickingFilterBar from '@/components/picking/PickingFilterBar.vue'
import PickingListCard from '@/components/picking/PickingListCard.vue'
import MasonryWall from '@yeger/vue-masonry-wall'

const { show } = useToast()

// State
const isLoadingPicking = ref(false)
const pendingItems = ref([])
const selectedItems = ref(new Set())

// FILTER STATE: Default kosong agar semua data muncul
const filterState = ref({
  search: '',
  source: 'ALL',
  stockStatus: 'ALL',
  sortBy: 'newest',
  viewMode: 'grid',
  startDate: '',
  endDate: '',
})

// Computed: Menghitung pemakaian stok berdasarkan item yang dipilih
const stockUsage = computed(() => {
  const usage = {}
  selectedItems.value.forEach((id) => {
    const item = pendingItems.value.find((i) => i.id === id)
    if (item && item.location_code) {
      const key = `${item.sku}_${item.location_code}`
      usage[key] = (usage[key] || 0) + Number(item.quantity)
    }
  })
  return usage
})

// Helper: Cek apakah item bisa dipilih (Stok cukup)
function canSelectItem(item) {
  if (!item || !item.location_code) return true // Biarkan user memilih meski tanpa lokasi (untuk manual handling)

  const key = `${item.sku}_${item.location_code}`
  const currentUsage = stockUsage.value[key] || 0
  const available = Number(item.available_stock || 0)
  const qty = Number(item.quantity || 0)

  // Jika item ini sendiri sudah dipilih, jangan hitung double
  if (selectedItems.value.has(item.id)) return true

  return currentUsage + qty <= available
}

// LOGIKA GROUPING (Penting untuk tampilan Card)
function groupItems(items, filter) {
  let resultItems = items || []

  // 1. Filter Tanggal (Hanya jika user mengisi kedua tanggal)
  if (filter.startDate && filter.endDate) {
    const start = new Date(filter.startDate + 'T00:00:00')
    const end = new Date(filter.endDate + 'T23:59:59')

    resultItems = resultItems.filter((i) => {
      const targetDateStr = i.order_date || i.created_at
      if (!targetDateStr) return true // Tampilkan item tanpa tanggal agar tidak hilang
      const itemDate = new Date(targetDateStr)
      return itemDate >= start && itemDate <= end
    })
  }

  // 2. Filter Source
  if (filter.source !== 'ALL') resultItems = resultItems.filter((i) => i.source === filter.source)

  // 3. Filter Search
  if (filter.search) {
    const q = filter.search.toLowerCase()
    resultItems = resultItems.filter(
      (i) =>
        (i.original_invoice_id || '').toLowerCase().includes(q) ||
        (i.sku || '').toLowerCase().includes(q) ||
        (i.product_name || '').toLowerCase().includes(q),
    )
  }

  // 4. Filter Stock Status
  if (filter.stockStatus !== 'ALL') {
    resultItems = resultItems.filter((i) => {
      const qty = Number(i.quantity || 0)
      const stock = Number(i.available_stock || 0)
      const hasLocation = !!i.location_code

      if (filter.stockStatus === 'READY') return hasLocation && stock >= qty
      else if (filter.stockStatus === 'ISSUE') return hasLocation && stock < qty
      else if (filter.stockStatus === 'EMPTY') return !hasLocation
      return true
    })
  }

  if (resultItems.length === 0) return []

  // 5. Grouping by Invoice ID
  const invoices = resultItems.reduce((acc, item) => {
    const invId = item.original_invoice_id || 'UNKNOWN'

    if (!acc[invId]) {
      acc[invId] = {
        invoice: invId,
        source: item.source || 'Unknown',
        id: item.picking_list_id || 0, // ID Header Picking List
        order_date: item.order_date,
        created_at: item.created_at,
        locations: {},
      }
    }

    // Grouping by Location Code
    const loc = item.location_code || 'Unknown Loc'
    if (!acc[invId].locations[loc]) acc[invId].locations[loc] = []

    acc[invId].locations[loc].push(item)
    return acc
  }, {})

  let result = Object.values(invoices)

  // 6. Sorting
  if (filter.sortBy === 'newest') result.sort((a, b) => b.id - a.id)
  else if (filter.sortBy === 'oldest') result.sort((a, b) => a.id - b.id)
  else if (filter.sortBy === 'invoice_asc')
    result.sort((a, b) => a.invoice.localeCompare(b.invoice))
  else if (filter.sortBy === 'invoice_desc')
    result.sort((a, b) => b.invoice.localeCompare(a.invoice))

  return result
}

const allGroupedItems = computed(() => groupItems(pendingItems.value, filterState.value))

// Infinite Scroll Setup
const { displayedItems, hasMore, reset, loaderRef } = useInfiniteScroll(allGroupedItems, {
  step: 8,
})

watch(
  filterState,
  () => {
    reset()
  },
  { deep: true },
)

// --- CORE ACTIONS ---

async function fetchPendingItems() {
  isLoadingPicking.value = true
  try {
    const response = await getPendingPickingItems()

    // Handle berbagai format response backend
    let items = []
    if (Array.isArray(response)) {
      items = response
    } else if (response && Array.isArray(response.data)) {
      items = response.data
    } else {
      console.warn('Format data picking tidak dikenali:', response)
    }

    pendingItems.value = items

    // Bersihkan selection jika item sudah tidak ada (misal dibatalkan orang lain)
    const currentIds = new Set(items.map((i) => i.id))
    const newSelection = new Set()
    selectedItems.value.forEach((id) => {
      if (currentIds.has(id)) newSelection.add(id)
    })
    selectedItems.value = newSelection
  } catch (error) {
    show(error.message || 'Gagal memuat daftar picking.', 'error')
    console.error(error)
  } finally {
    isLoadingPicking.value = false
  }
}

async function handleCompleteSelectedItems() {
  if (selectedItems.value.size === 0) return
  if (!confirm(`Selesaikan ${selectedItems.value.size} item terpilih?`)) return

  isLoadingPicking.value = true
  try {
    const itemIds = Array.from(selectedItems.value)
    const res = await completePickingItems(itemIds)
    show(res.message, 'success')
    selectedItems.value.clear()
    await fetchPendingItems()
  } catch (error) {
    show(error.message || 'Gagal menyelesaikan item.', 'error')
    // Refresh untuk memastikan status sinkron
    await fetchPendingItems()
  } finally {
    isLoadingPicking.value = false
  }
}

async function handleCancelInvoice(pickingListId) {
  if (!confirm('Batalkan pesanan ini?')) return
  try {
    await cancelPickingList(pickingListId)
    show('Picking list dibatalkan.', 'success')
    // Optimistic UI Update: Hapus lokal agar cepat
    pendingItems.value = pendingItems.value.filter((item) => item.picking_list_id !== pickingListId)
    // Fetch ulang background untuk konsistensi
    fetchPendingItems()
  } catch (error) {
    show(error.message || 'Gagal membatalkan.', 'error')
    fetchPendingItems()
  }
}

// Checkbox Handlers
function handleToggleItem(itemId) {
  if (selectedItems.value.has(itemId)) {
    selectedItems.value.delete(itemId)
  } else {
    const item = pendingItems.value.find((i) => i.id === itemId)
    if (item && !canSelectItem(item)) {
      show(`Stok terbatas! Sisa: ${item.available_stock}`, 'error')
      return
    }
    selectedItems.value.add(itemId)
  }
}

function handleToggleLocationGroup({ items, checked }) {
  items.forEach((item) => {
    if (checked) {
      if (canSelectItem(item)) selectedItems.value.add(item.id)
    } else {
      selectedItems.value.delete(item.id)
    }
  })
}

// Expose agar parent bisa memanggil refresh
defineExpose({
  fetchPendingItems,
  pendingCount: computed(() => pendingItems.value.length),
})

onMounted(() => {
  fetchPendingItems()
})
</script>

<template>
  <div class="space-y-6 animate-fade-in pb-20">
    <PickingFilterBar v-model="filterState" />

    <div
      class="flex justify-between items-center bg-secondary/80 border border-secondary/20 p-4 rounded-xl backdrop-blur-md sticky top-4 z-30 shadow-lg transition-all duration-300"
      :class="{
        'translate-y-0 opacity-100': selectedItems.size > 0,
        '-translate-y-4 opacity-0 pointer-events-none': selectedItems.size === 0,
      }"
    >
      <div class="flex items-center gap-3">
        <div class="h-3 w-3 rounded-full bg-primary animate-pulse"></div>
        <span class="font-bold text-lg text-text"
          >{{ selectedItems.size }}
          <span class="text-text/60 font-normal text-sm">item dipilih</span></span
        >
      </div>
      <button
        @click="handleCompleteSelectedItems"
        :disabled="selectedItems.size === 0"
        class="bg-success hover:bg-success/80 text-white px-6 py-2.5 rounded-lg font-bold text-sm transition-all shadow-lg active:scale-95 flex items-center gap-2"
      >
        <font-awesome-icon icon="fa-solid fa-check-double" />
        Selesaikan Picking
      </button>
    </div>

    <div v-if="isLoadingPicking && pendingItems.length === 0" class="py-32 text-center opacity-60">
      <font-awesome-icon
        icon="fa-solid fa-cubes-stacked"
        class="text-6xl mb-4 animate-bounce text-secondary"
      />
      <p>Memuat tugas...</p>
    </div>

    <div
      v-else-if="allGroupedItems.length === 0"
      class="py-24 text-center border-2 border-dashed border-secondary/30 rounded-2xl bg-secondary/5"
    >
      <font-awesome-icon icon="fa-solid fa-clipboard-check" class="text-5xl text-primary/50 mb-4" />
      <h3 class="text-xl font-bold">Tidak ada tugas aktif</h3>
      <p class="text-text/50 mt-1">Coba reset filter atau upload tugas baru.</p>
    </div>

    <div v-else>
      <component
        :is="filterState.viewMode === 'grid' ? MasonryWall : 'div'"
        :items="displayedItems"
        :ssr-columns="1"
        :column-width="320"
        :gap="16"
        :class="filterState.viewMode === 'list' ? 'flex flex-col gap-4' : ''"
      >
        <template #default="{ item: inv }">
          <PickingListCard
            :inv="inv"
            :selectedItems="selectedItems"
            :validate-stock="canSelectItem"
            @toggle-item="handleToggleItem"
            @toggle-location="handleToggleLocationGroup"
            @cancel-invoice="handleCancelInvoice"
            mode="picking"
          />
        </template>
      </component>

      <div ref="loaderRef" class="h-24 w-full flex justify-center items-center mt-6">
        <div v-if="hasMore" class="flex flex-col items-center gap-2 text-text/50 animate-pulse">
          <font-awesome-icon icon="fa-solid fa-circle-notch" class="animate-spin text-xl" />
        </div>
      </div>
    </div>
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
