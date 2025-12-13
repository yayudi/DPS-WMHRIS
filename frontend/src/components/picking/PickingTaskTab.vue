<!-- frontend\src\components\picking\PickingTaskTab.vue -->
<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { useToast } from '@/composables/useToast.js'
import { useInfiniteScroll } from '@/composables/useInfiniteScroll.js'
import { useTaskGrouping } from '@/composables/useTaskGrouping.js'
import {
  getPendingPickingItems,
  completePickingItems,
  cancelPickingList,
} from '@/api/helpers/picking.js'

import PickingFilterBar from '@/components/picking/PickingFilterBar.vue'
import PickingListCard from '@/components/picking/PickingListCard.vue'
import MasonryWall from '@yeger/vue-masonry-wall'

const { show } = useToast()

// --- STATE ---
const isLoadingPicking = ref(false)
const pendingItems = ref([])
const selectedItems = ref(new Set())

const filterState = ref({
  search: '',
  source: 'ALL',
  stockStatus: 'ALL',
  sortBy: 'newest',
  viewMode: 'grid',
  startDate: '',
  endDate: '',
})

// --- LOGIC: GROUPING ---
const { groupedTasks } = useTaskGrouping(pendingItems, filterState)

// --- INFINITE SCROLL ---
const { displayedItems, hasMore, reset, loaderRef } = useInfiniteScroll(groupedTasks, {
  step: 12,
})

watch(filterState, () => reset(), { deep: true })

// --- LOGIC: STOCK VALIDATION ---
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

function canSelectItem(item) {
  if (!item) return false

  // Backend support JIT Lookup, jadi item tanpa lokasi awal BOLEH dipilih
  if (!item.location_code) return true

  const key = `${item.sku}_${item.location_code}`
  const currentUsage = stockUsage.value[key] || 0
  const available = Number(item.available_stock || 0)
  const qtyNeeded = Number(item.quantity || 0)

  // Jika item ini sendiri sudah dipilih, anggap valid
  if (selectedItems.value.has(item.id)) return true

  return currentUsage + qtyNeeded <= available
}

// --- ACTIONS (API CALLS) ---

async function fetchPendingItems() {
  isLoadingPicking.value = true
  try {
    const response = await getPendingPickingItems()

    let data = []
    if (Array.isArray(response)) data = response
    else if (response?.data && Array.isArray(response.data)) data = response.data

    pendingItems.value = data
    selectedItems.value.clear()
  } catch (error) {
    show(error.message || 'Gagal memuat data picking.', 'error')
  } finally {
    isLoadingPicking.value = false
  }
}

async function handleCompleteSelectedItems() {
  if (selectedItems.value.size === 0) return

  isLoadingPicking.value = true
  const idsToComplete = Array.from(selectedItems.value)

  try {
    const payloadItems = idsToComplete
      .map((id) => {
        const originalItem = pendingItems.value.find((i) => i.id === id)
        if (!originalItem) return null
        return {
          id: originalItem.id,
          picking_list_id: originalItem.picking_list_id,
          product_id: originalItem.product_id,
          quantity: originalItem.quantity,
          location_id: originalItem.suggested_location_id,
        }
      })
      .filter((i) => i !== null)

    const res = await completePickingItems({ items: payloadItems })

    if (res.success) {
      show(res.message, 'success')

      // [OPTIMISTIC UPDATE] Hapus item yang sukses dari list agar tidak double-click
      pendingItems.value = pendingItems.value.filter((item) => !selectedItems.value.has(item.id))
      selectedItems.value.clear()
    } else {
      show(res.message || 'Gagal memproses sebagian item.', 'warning')
    }

    // Refresh data asli dari server
    await fetchPendingItems()
  } catch (error) {
    show(error.message || 'Gagal menyelesaikan item.', 'error')
  } finally {
    isLoadingPicking.value = false
  }
}

async function handleCancelInvoice(pickingListId) {
  if (!confirm('Batalkan seluruh pesanan ini? Stok akan dikembalikan.')) return
  try {
    await cancelPickingList(pickingListId)
    show('Picking list dibatalkan.', 'success')
    pendingItems.value = pendingItems.value.filter((item) => item.picking_list_id !== pickingListId)
  } catch (error) {
    show(error.message || 'Gagal membatalkan.', 'error')
    await fetchPendingItems()
  }
}

// [NEW] Logic Toggle per Invoice
function handleToggleInvoice({ inv, checked }) {
  const allItemIds = []
  if (inv.locations) {
    Object.values(inv.locations).forEach((items) => {
      items.forEach((item) => allItemIds.push(item))
    })
  } else if (inv.items) {
    inv.items.forEach((item) => allItemIds.push(item))
  }

  allItemIds.forEach((item) => {
    if (checked) {
      if (canSelectItem(item)) selectedItems.value.add(item.id)
    } else {
      selectedItems.value.delete(item.id)
    }
  })
}

// [NEW] Logic Select All
function handleSelectAll() {
  displayedItems.value.forEach((inv) => {
    handleToggleInvoice({ inv, checked: true })
  })
}

// [NEW] Logic Uncheck All
function handleUncheckAll() {
  selectedItems.value.clear()
}

defineExpose({
  fetchPendingItems,
  pendingCount: computed(() => pendingItems.value.length),
})

onMounted(() => {
  fetchPendingItems()
})
</script>

<template>
  <div>
    <!-- Floating Action Bar -->
    <transition name="slide-up">
      <div
        v-if="selectedItems.size > 0"
        class="fixed bottom-6 left-1/2 -translate-x-1/2 w-[95%] md:w-[600px] flex justify-between items-center bg-secondary/95 border border-secondary/20 p-4 rounded-2xl backdrop-blur-xl z-50 shadow-2xl"
      >
        <div class="flex items-center gap-3">
          <div class="h-3 w-3 rounded-full bg-primary animate-pulse shadow-glow"></div>
          <div class="flex flex-col leading-tight">
            <span class="font-black text-lg text-text">{{ selectedItems.size }}</span>
            <span class="text-[10px] text-text/60 font-bold uppercase tracking-wider">
              Item Terpilih
            </span>
          </div>
        </div>

        <button
          @click="handleCompleteSelectedItems"
          class="bg-primary hover:bg-primary/90 text-background px-8 py-3 rounded-xl font-bold text-sm transition-all shadow-lg active:scale-95 flex items-center gap-2 disabled:opacity-70"
          :disabled="isLoadingPicking"
        >
          <font-awesome-icon
            v-if="isLoadingPicking"
            icon="fa-solid fa-spinner"
            class="animate-spin"
          />
          <span v-else>Selesaikan</span>
          <font-awesome-icon v-if="!isLoadingPicking" icon="fa-solid fa-check-double" />
        </button>
      </div>
    </transition>

    <div class="space-y-6 animate-fade-in pb-32">
      <!-- Filter & Bulk Actions -->
      <div class="flex flex-col md:flex-row gap-4 items-start md:items-center justify-between">
        <PickingFilterBar v-model="filterState" class="flex-1 w-full" />

        <div class="flex items-center gap-2 w-full md:w-auto shrink-0">
          <button
            @click="handleSelectAll"
            class="flex-1 md:flex-none px-4 py-2 bg-secondary/10 hover:bg-primary/10 text-primary rounded-lg text-xs font-bold transition-colors border border-dashed border-primary/30 hover:border-primary"
          >
            <font-awesome-icon icon="fa-solid fa-check-square" class="mr-1" />
            Pilih Semua
          </button>
          <button
            @click="handleUncheckAll"
            class="flex-1 md:flex-none px-4 py-2 bg-secondary/10 hover:bg-danger/10 text-text/60 hover:text-danger rounded-lg text-xs font-bold transition-colors border border-dashed border-secondary/30 hover:border-danger"
            :disabled="selectedItems.size === 0"
          >
            <font-awesome-icon icon="fa-solid fa-square" class="mr-1" />
            Reset
          </button>
        </div>
      </div>

      <!-- Loading & Empty States -->
      <div
        v-if="isLoadingPicking && pendingItems.length === 0"
        class="py-32 text-center opacity-60"
      >
        <font-awesome-icon
          icon="fa-solid fa-cubes-stacked"
          class="text-6xl mb-4 animate-bounce text-secondary"
        />
        <p>Memuat daftar tugas...</p>
      </div>

      <div
        v-else-if="groupedTasks.length === 0"
        class="py-24 text-center border-2 border-dashed border-secondary/30 rounded-2xl bg-secondary/5"
      >
        <font-awesome-icon
          icon="fa-solid fa-clipboard-check"
          class="text-5xl text-primary/50 mb-4"
        />
        <h3 class="text-xl font-bold">Semua Beres!</h3>
        <p class="text-text/50 mt-1">Tidak ada item yang perlu dipicking saat ini.</p>
      </div>

      <!-- Main Content -->
      <div v-else>
        <MasonryWall
          v-if="filterState.viewMode === 'grid'"
          :items="displayedItems"
          :ssr-columns="1"
          :column-width="320"
          :gap="16"
        >
          <template #default="{ item: inv }">
            <PickingListCard
              :inv="inv"
              :selectedItems="selectedItems"
              :validate-stock="canSelectItem"
              @toggle-invoice="handleToggleInvoice"
              @cancel-invoice="handleCancelInvoice"
              mode="picking"
            />
          </template>
        </MasonryWall>

        <div v-else class="flex flex-col gap-4">
          <PickingListCard
            v-for="inv in displayedItems"
            :key="inv.id"
            :inv="inv"
            :selectedItems="selectedItems"
            :validate-stock="canSelectItem"
            @toggle-invoice="handleToggleInvoice"
            @cancel-invoice="handleCancelInvoice"
            mode="picking"
          />
        </div>

        <div ref="loaderRef" class="h-24 w-full flex justify-center items-center mt-6">
          <div v-if="hasMore" class="flex flex-col items-center gap-2 text-text/50 animate-pulse">
            <font-awesome-icon icon="fa-solid fa-circle-notch" class="animate-spin text-xl" />
            <span class="text-xs">Memuat lebih banyak...</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.shadow-glow {
  box-shadow: 0 0 15px theme('colors.primary');
}
.animate-fade-in {
  animation: fadeIn 0.4s ease-out forwards;
}
.slide-up-enter-active,
.slide-up-leave-active {
  transition: all 0.4s cubic-bezier(0.16, 1, 0.3, 1);
}
.slide-up-enter-from,
.slide-up-leave-to {
  opacity: 0;
  transform: translate(-50%, 20px);
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
