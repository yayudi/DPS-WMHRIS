<!-- frontend/src/components/fulfilment/FulfilmentHistoryTab.vue -->
<script setup>
import { swalConfirm } from '@/composables/useSweetAlert'
import { ref, onMounted, watch, computed } from 'vue'
import { useStorage } from '@vueuse/core'
import { useToast } from '@/composables/useToast.js'
import { usePagination } from '@/composables/usePagination.js'
import { useHistoryGrouping } from '@/composables/useHistoryGrouping.js'
import { useFirebaseSync } from '@/composables/useFirebaseSync.js'
import { getHistoryFulfilmentItems, voidFulfilmentList, getPendingFilterOptions } from '@/api/helpers/fulfilment.js'
import FulfilmentFilterBar from '@/components/fulfilment/FulfilmentFilterBar.vue'
import FulfilmentListCard from '@/components/fulfilment/FulfilmentListCard.vue'
import FulfilmentListCardCompact from '@/components/fulfilment/FulfilmentListCardCompact.vue'
import FulfilmentListRow from '@/components/fulfilment/FulfilmentListRow.vue'
import BasePagination from '@/components/ui/BasePagination.vue'
import MasonryWall from '@yeger/vue-masonry-wall'

const { toast } = useToast()

// --- STATE ---
const isLoadingHistory = ref(false)
const historyItems = ref([])
const historyFilterState = useStorage(
  'wms_history_filter_state',
  {
    search: '',
    source: { include: [], exclude: [] },
    stockStatus: { include: [], exclude: [] },
    shopName: { include: [], exclude: [] },
    courier: { include: [], exclude: [] },
    locationPurpose: { include: [], exclude: [] },
    isSameday: 'All',
    sortBy: 'newest',
    viewMode: 'grid', // Default Grid
    startDate: '',
    endDate: ''
  },
  localStorage,
  { mergeDefaults: true }
)

const filterOptions = ref({ couriers: [] })

const fetchOptions = async () => {
  try {
    const res = await getPendingFilterOptions()
    if (res) filterOptions.value = res
  } catch (err) {
    console.error('Failed to load filter options', err)
  }
}
fetchOptions()

// --- LOGIC: GROUPING ---
const { groupedHistory } = useHistoryGrouping(historyItems, historyFilterState, filterOptions)

// --- PAGINATION LOGIC ---
const {
  paginatedData: displayedItems,
  meta: paginationState,
  changePage: handlePageChange,
  changePageSize: handleLimitChange
} = usePagination({
  totalItems: groupedHistory,
  storageKey: 'fulfilmentHistoryPageSize',
  initialLimit: 15
})

watch(historyFilterState, () => handlePageChange(1), { deep: true })

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

// --- COMPUTED: COURIER OPTIONS ---
const courierOptions = computed(() => {
  const options = []
  if (filterOptions.value.expeditions) {
    filterOptions.value.expeditions.forEach(exp => {
      options.push({ id: exp.id, label: exp.name, is_sameday: exp.is_sameday })
    })
  }
  return options
})

// Firebase Real-time Sync
useFirebaseSync('FULFILMENT_LIST', 'REFRESH_FULFILMENT', () => fetchHistoryItems())

// --- API FETCH ---
async function fetchHistoryItems() {
  isLoadingHistory.value = true
  try {
    const items = await getHistoryFulfilmentItems()
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
    await voidFulfilmentList(itemId)
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
      <FulfilmentFilterBar
        v-model="historyFilterState"
        :shop-options="shopOptions"
        :courier-options="courierOptions"
        :hide-role-and-backorder="true"
        class="w-full"
      />
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
      <p class="text-text/50 mt-1 text-sm">Selesaikan proses pesanan untuk melihat arsip di sini.</p>
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
          <FulfilmentListCard :inv="inv" mode="history" :historyLogs="inv.historyLogs" @void-invoice="handleVoidItem" />
        </template>
      </MasonryWall>

      <!-- View Mode: COMPACT (Stack Card) -->
      <div v-else-if="historyFilterState.viewMode === 'compact'" class="flex flex-col gap-3">
        <FulfilmentListCardCompact
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
        <FulfilmentListRow
          v-for="inv in displayedItems"
          :key="inv.id"
          :inv="inv"
          mode="history"
          :historyLogs="inv.historyLogs"
          @void-invoice="handleVoidItem"
        />
      </div>

      <!-- Pagination Bottom (Sticky) -->
      <div
        v-if="paginationState.totalPages > 1 || groupedHistory.length > 15"
        class="sticky bottom-0 bg-background rounded-md mt-auto z-10"
      >
        <BasePagination
          :pagination="paginationState"
          @changePage="handlePageChange"
          @update:limit="handleLimitChange"
        />
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
