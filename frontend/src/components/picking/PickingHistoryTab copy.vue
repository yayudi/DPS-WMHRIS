<!-- frontend\src\components\picking\PickingHistoryTab.vue -->
<script setup>
import { ref, onMounted, watch } from 'vue'
import { useToast } from '@/composables/UseToast.js'
import { useInfiniteScroll } from '@/composables/useInfiniteScroll.js'
import { useHistoryGrouping } from '@/composables/useHistoryGrouping.js' // Import baru
import { getHistoryPickingItems } from '@/api/helpers/picking.js'

import PickingFilterBar from '@/components/picking/PickingFilterBar.vue'
import PickingListCard from '@/components/picking/PickingListCard.vue'
import MasonryWall from '@yeger/vue-masonry-wall'

const { show } = useToast()

// --- STATE ---
const isLoadingHistory = ref(false)
const historyItems = ref([]) // Raw data dari API
const historyFilterState = ref({
  search: '',
  source: 'ALL',
  stockStatus: 'ALL', // Mungkin tidak relevan untuk history, bisa dihapus jika mau
  sortBy: 'newest',
  viewMode: 'grid',
  startDate: '',
  endDate: '',
})

// --- LOGIC (Extracted) ---
const { groupedHistory } = useHistoryGrouping(historyItems, historyFilterState)

// --- INFINITE SCROLL ---
const { displayedItems, hasMore, reset, loaderRef } = useInfiniteScroll(groupedHistory, {
  step: 12,
})

// Reset scroll saat filter berubah
watch(historyFilterState, () => reset(), { deep: true })

// --- API ---
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

// Expose agar parent bisa trigger refresh
defineExpose({ fetchHistoryItems })

onMounted(() => {
  fetchHistoryItems()
})
</script>

<template>
  <div class="space-y-6 animate-fade-in">
    <PickingFilterBar v-model="historyFilterState" />

    <div
      class="bg-secondary/80 border-primary/80 p-4 rounded-xl flex items-center gap-3 text-primary/70"
    >
      <font-awesome-icon icon="fa-solid fa-circle-info" />
      <span class="text-sm font-bold">
        Menampilkan arsip picking. Invoice yang direvisi dikelompokkan otomatis.
      </span>
    </div>

    <div v-if="isLoadingHistory && historyItems.length === 0" class="py-32 text-center opacity-60">
      <font-awesome-icon
        icon="fa-solid fa-clock-rotate-left"
        class="text-6xl mb-4 animate-spin text-primary"
      />
      <p class="text-sm font-medium">Memuat data riwayat...</p>
    </div>

    <div
      v-else-if="groupedHistory.length === 0"
      class="py-24 text-center border-2 border-dashed border-secondary/20 rounded-2xl bg-secondary/5"
    >
      <h3 class="text-xl font-bold text-text/70">Belum ada Riwayat</h3>
      <p class="text-text/50 mt-1 text-sm">Selesaikan tugas picking untuk melihat arsip di sini.</p>
    </div>

    <div v-else>
      <component
        :is="historyFilterState.viewMode === 'grid' ? MasonryWall : 'div'"
        :items="displayedItems"
        :ssr-columns="1"
        :column-width="350"
        :gap="16"
        :class="historyFilterState.viewMode === 'list' ? 'flex flex-col gap-4' : ''"
      >
        <template #default="{ item: inv }">
          <PickingListCard :inv="inv" mode="history" />
        </template>
      </component>

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
