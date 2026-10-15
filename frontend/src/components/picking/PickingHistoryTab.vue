<!-- frontend/src/components/picking/PickingHistoryTab.vue -->
<script setup>
import { swalConfirm } from '@/composables/useSweetAlert'
import { ref, onMounted, watch, computed } from 'vue'
import { useToast } from '@/composables/useToast.js'
import { useInfiniteScroll } from '@/composables/useInfiniteScroll.js'
import { useHistoryGrouping } from '@/composables/useHistoryGrouping.js'
import { useFirebaseSync } from '@/composables/useFirebaseSync.js'
import { getHistoryPickingItems, voidPickingList } from '@/api/helpers/picking.js'
import PickingFilterBar from '@/components/picking/PickingFilterBar.vue'
import PickingListCard from '@/components/picking/PickingListCard.vue'
import PickingListCardCompact from '@/components/picking/PickingListCardCompact.vue'
import PickingListRow from '@/components/picking/PickingListRow.vue' // Tambahkan import row
import MasonryWall from '@yeger/vue-masonry-wall'

const { toast } = useToast()

// --- STATE ---
const isLoadingHistory = ref(false)
const historyItems = ref([])
const historyFilterState = ref({
  search: '',
  source: { include: [], exclude: [] },
  stockStatus: { include: [], exclude: [] },
  shopName: { include: [], exclude: [] },
  locationPurpose: { include: [], exclude: [] },
  sortBy: 'newest',
  viewMode: 'grid', // Default Grid
  startDate: '',
  endDate: ''
})

// --- LOGIC: GROUPING ---
// Mengelompokkan revisi (Obsolete) ke dalam induknya agar tampilan rapi
const { groupedHistory } = useHistoryGrouping(historyItems, historyFilterState)

// --- INFINITE SCROLL ---
const { displayedItems, hasMore, reset, loaderRef } = useInfiniteScroll(groupedHistory, {
  step: 12
})

watch(historyFilterState, () => reset(), { deep: true })

// --- COMPUTED: SHOP OPTIONS ---
const shopOptions = computed(() => {
  const shops = new Set()
  historyItems.value.forEach(item => {
    if (item.shop_name) shops.add(item.shop_name)
  })

  const options = []
  Array.from(shops)
    .sort()
    .forEach(shop => {
      options.push({ id: shop, label: shop })
    })

  return options
})

// Firebase Real-time Sync
useFirebaseSync('PICKING_LIST', 'REFRESH_PICKING', () => fetchHistoryItems())

// --- API FETCH ---
async function fetchHistoryItems() {
  isLoadingHistory.value = true
  try {
    const items = await getHistoryPickingItems()
    historyItems.value = items || []
  } catch (error) {
    console.error(error) // Auto-added to prevent unused var
  } finally {
    isLoadingHistory.value = false
  }
}

// --- HANDLERS ---

async function handleVoidItem(itemId) {
  if (!(await swalConfirm('Apakah Anda yakin ingin me-void arsip ini? (Hanya admin)'))) return
  try {
    await voidPickingList(itemId)
    toast('Berhasil divoid', 'success')
    fetchHistoryItems() // Refresh
  } catch (e) {
    console.error(e)
  }
}

// Expose fungsi refresh agar bisa dipanggil dari parent jika perlu
defineExpose({ fetchHistoryItems })

onMounted(() => {
  fetchHistoryItems()
})
</script>

<template>
  <div class="space-y-6 animate-fade-in pb-32">
    <!-- Filter Bar (Search, Date, Sort, View Mode) -->
    <div class="bg-secondary/50 p-4 rounded-xl border border-dashed border-secondary/20">
      <PickingFilterBar v-model="historyFilterState" :shop-options="shopOptions" mode="history" class="w-full" />
    </div>

    <!-- Info Banner -->
    <div class="bg-secondary/10 border border-secondary/20 p-4 rounded-xl flex items-center gap-3 text-text/70">
      <font-awesome-icon icon="fa-solid fa-circle-info" class="text-primary" />
      <span class="text-xs font-medium">
        Menampilkan arsip picking (Selesai & Batal). Revisi lama dikelompokkan otomatis.
      </span>
    </div>

    <!-- Loading State -->
    <div v-if="isLoadingHistory && historyItems.length === 0" class="py-32 text-center opacity-60">
      <font-awesome-icon icon="fa-solid fa-clock-rotate-left" class="text-6xl mb-4 animate-spin text-secondary" />
      <p class="text-sm font-medium">Memuat data riwayat...</p>
    </div>

    <!-- Empty State -->
    <div
      v-else-if="groupedHistory.length === 0"
      class="py-24 text-center border-2 border-dashed border-secondary/20 rounded-2xl bg-secondary/5"
    >
      <h3 class="text-xl font-bold text-text/70">Belum ada Riwayat</h3>
      <p class="text-text/50 mt-1 text-sm">Selesaikan tugas picking untuk melihat arsip di sini.</p>
    </div>

    <!-- Content -->
    <div v-else>
      <!-- View Mode: GRID (Masonry Card Standard) -->
      <MasonryWall
        v-if="historyFilterState.viewMode === 'grid'"
        :items="displayedItems"
        :ssr-columns="1"
        :column-width="350"
        :gap="16"
      >
        <template #default="{ item: inv }">
          <PickingListCard :inv="inv" mode="history" :historyLogs="inv.historyLogs" @void-invoice="handleVoidItem" />
        </template>
      </MasonryWall>

      <!-- View Mode: COMPACT (Stack Card) -->
      <div v-else-if="historyFilterState.viewMode === 'compact'" class="flex flex-col gap-3">
        <PickingListCardCompact
          v-for="inv in displayedItems"
          :key="inv.id"
          :inv="inv"
          mode="history"
          :historyLogs="inv.historyLogs"
          @void-invoice="handleVoidItem"
        />
      </div>

      <!-- View Mode: LIST (Stack Baris Lengkap) -->
      <div v-else class="flex flex-col border border-secondary/10 rounded-xl overflow-hidden shadow-sm bg-background">
        <PickingListRow
          v-for="inv in displayedItems"
          :key="inv.id"
          :inv="inv"
          mode="history"
          :historyLogs="inv.historyLogs"
          @void-invoice="handleVoidItem"
        />
      </div>

      <!-- Infinite Scroll Loader -->
      <div ref="loaderRef" class="h-24 w-full flex justify-center items-center mt-6">
        <div v-if="hasMore" class="flex flex-col items-center gap-2 text-text/50 animate-pulse">
          <font-awesome-icon icon="fa-solid fa-circle-notch" class="animate-spin text-xl" />
          <span class="text-xs">Memuat lebih banyak...</span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.animate-fade-in {
  animation: fadeIn 0.5s cubic-bezier(0.16, 1, 0.3, 1) forwards;
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
