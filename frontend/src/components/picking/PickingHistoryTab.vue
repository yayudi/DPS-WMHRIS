<!-- frontend\src\components\picking\PickingHistoryTab.vue -->
<script setup>
import { ref, onMounted, watch } from 'vue'
import { useToast } from '@/composables/useToast.js'
import { useInfiniteScroll } from '@/composables/useInfiniteScroll.js'
import { useHistoryGrouping } from '@/composables/useHistoryGrouping.js'
import { getHistoryPickingItems, cancelPickingList } from '@/api/helpers/picking.js'

import PickingFilterBar from '@/components/picking/PickingFilterBar.vue'
import PickingListCard from '@/components/picking/PickingListCard.vue'
import PickingHistoryTable from '@/components/picking/PickingHistoryTable.vue'
import MasonryWall from '@yeger/vue-masonry-wall'

const { show } = useToast()

// --- STATE ---
const isLoadingHistory = ref(false)
const historyItems = ref([])
const historyFilterState = ref({
  search: '',
  source: 'ALL',
  stockStatus: 'ALL',
  sortBy: 'newest',
  viewMode: 'grid', // Default Grid, user bisa ubah ke List
  startDate: '',
  endDate: '',
})

// --- LOGIC: GROUPING ---
// Mengelompokkan revisi (Obsolete) ke dalam induknya agar tampilan rapi
const { groupedHistory } = useHistoryGrouping(historyItems, historyFilterState)

// --- INFINITE SCROLL ---
const { displayedItems, hasMore, reset, loaderRef } = useInfiniteScroll(groupedHistory, {
  step: 12,
})

watch(historyFilterState, () => reset(), { deep: true })

// --- API FETCH ---
async function fetchHistoryItems() {
  isLoadingHistory.value = true
  try {
    const items = await getHistoryPickingItems()
    historyItems.value = items || []
  } catch (error) {
    show(error.message || 'Gagal memuat riwayat.', 'error')
  } finally {
    isLoadingHistory.value = false
  }
}

// --- HANDLERS ---

function handleViewDetails(item) {
  // Disini nanti bisa emit event ke parent untuk buka modal detail
  // console.log('View Details:', item)
}

async function handleCancelItem(itemId) {
  if (!confirm('Apakah Anda yakin ingin membatalkan arsip ini? (Hanya admin)')) return
  try {
    await cancelPickingList(itemId)
    show('Berhasil dibatalkan', 'success')
    fetchHistoryItems() // Refresh
  } catch (e) {
    show(e.message, 'error')
  }
}

// Handler dummy untuk fitur masa depan
function handleVoidItem(itemId) {
  show('Fitur Void akan segera hadir', 'info')
}

function handleResumeItem(item) {
  show(`Lanjutkan invoice ${item.invoice}`, 'info')
}

// Expose fungsi refresh agar bisa dipanggil dari parent jika perlu
defineExpose({ fetchHistoryItems })

onMounted(() => {
  fetchHistoryItems()
})
</script>

<template>
  <div class="space-y-6 animate-fade-in">
    <!-- Filter Bar (Search, Date, Sort, View Mode) -->
    <PickingFilterBar v-model="historyFilterState" />

    <!-- Info Banner -->
    <div
      class="bg-secondary/80 border-primary/80 p-4 rounded-xl flex items-center gap-3 text-primary/70"
    >
      <font-awesome-icon icon="fa-solid fa-circle-info" />
      <span class="text-sm font-bold">
        Menampilkan arsip picking (Selesai & Batal). Revisi lama dikelompokkan otomatis.
      </span>
    </div>

    <!-- Loading State -->
    <div v-if="isLoadingHistory && historyItems.length === 0" class="py-32 text-center opacity-60">
      <font-awesome-icon
        icon="fa-solid fa-clock-rotate-left"
        class="text-6xl mb-4 animate-spin text-primary"
      />
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
      <!-- View Mode: LIST (Table) -->
      <div v-if="historyFilterState.viewMode === 'list'">
        <PickingHistoryTable
          :history-items="displayedItems"
          :is-loading="isLoadingHistory"
          @refresh="fetchHistoryItems"
          @view-details="handleViewDetails"
        />
      </div>

      <!-- View Mode: GRID (Masonry Card) -->
      <MasonryWall v-else :items="displayedItems" :ssr-columns="1" :column-width="350" :gap="16">
        <template #default="{ item: inv }">
          <!--
            Mengirim props 'mode="history"' agar card berubah tampilan
            (tanpa checkbox, ada dropdown historyLogs)
          -->
          <PickingListCard
            :inv="inv"
            mode="history"
            :historyLogs="inv.historyLogs"
            @cancel-invoice="handleCancelItem"
          />
        </template>
      </MasonryWall>

      <!-- Infinite Scroll Loader -->
      <div ref="loaderRef" class="h-24 w-full flex justify-center items-center">
        <span
          v-if="hasMore"
          class="px-4 py-2 bg-secondary/10 rounded-full text-xs text-text/60 animate-pulse flex items-center gap-2"
        >
          <font-awesome-icon icon="fa-solid fa-circle-notch" class="animate-spin" />
          Memuat item berikutnya...
        </span>
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
