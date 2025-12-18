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
import PickingListCardCompact from '@/components/picking/PickingListCardCompact.vue'
import PickingListRow from '@/components/picking/PickingListRow.vue'
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
  viewMode: 'grid', // Default GRID
  startDate: '',
  endDate: '',
})

// --- OPTIMIZATION: ITEMS MAP ---
const itemsMap = computed(() => {
  const map = new Map()
  pendingItems.value.forEach((item) => {
    map.set(item.id, item)
  })
  return map
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
    const item = itemsMap.value.get(id)
    if (item && item.location_code) {
      const key = `${item.sku}_${item.location_code}`
      usage[key] = (usage[key] || 0) + Number(item.quantity)
    }
  })
  return usage
})

function canSelectItem(item) {
  if (!item) return false
  if (!item.location_code) return true // JIT Lookup support

  const key = `${item.sku}_${item.location_code}`
  const currentUsage = stockUsage.value[key] || 0
  const available = Number(item.available_stock || 0)
  const qtyNeeded = Number(item.quantity || 0)

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
        const originalItem = itemsMap.value.get(id)
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
      // Optimistic Update
      pendingItems.value = pendingItems.value.filter((item) => !selectedItems.value.has(item.id))
      selectedItems.value.clear()
    } else {
      show(res.message || 'Gagal memproses sebagian item.', 'warning')
    }
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

// --- SELECTION LOGIC ---
function handleToggleInvoice({ inv, checked }) {
  const allItemIds = []
  if (inv.locations) {
    Object.values(inv.locations).forEach((items) => items.forEach((item) => allItemIds.push(item)))
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

function handleSelectAll() {
  displayedItems.value.forEach((inv) => {
    handleToggleInvoice({ inv, checked: true })
  })
}

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
  <div class="relative min-h-[500px]">
    <!-- FLOATING ACTION BAR -->
    <transition name="slide-up">
      <div
        v-if="pendingItems.length > 0"
        class="fixed bottom-6 left-1/2 -translate-x-1/2 w-[95%] md:w-[600px] bg-secondary/95 border border-white/10 backdrop-blur-xl p-3 rounded-2xl shadow-2xl z-50 flex items-center justify-between gap-3 ring-1 ring-black/5"
      >
        <!-- Kiri: Kontrol Seleksi -->
        <div class="flex items-center gap-2">
          <button
            @click="handleSelectAll"
            class="px-3 py-2 bg-secondary/50 hover:bg-primary/20 text-primary rounded-lg text-xs font-bold transition-colors border border-primary/20 hover:border-primary/50 flex items-center gap-1.5 active:scale-95"
            title="Pilih Semua Item Tampil"
          >
            <font-awesome-icon icon="fa-solid fa-check-double" />
            <span class="hidden sm:inline">Pilih Semua</span>
          </button>

          <button
            @click="handleUncheckAll"
            :disabled="selectedItems.size === 0"
            class="px-3 py-2 bg-secondary/50 hover:bg-danger/20 text-text/60 hover:text-danger rounded-lg text-xs font-bold transition-colors border border-secondary/30 hover:border-danger/50 disabled:opacity-30 disabled:cursor-not-allowed flex items-center gap-1.5 active:scale-95"
            title="Reset Pilihan"
          >
            <font-awesome-icon icon="fa-solid fa-xmark" />
            <span class="hidden sm:inline">Reset</span>
          </button>
        </div>

        <!-- Tengah: Info (Jika ada yang dipilih) -->
        <div
          v-if="selectedItems.size > 0"
          class="flex flex-col items-center leading-none px-1 min-w-[60px]"
        >
          <span class="font-black text-lg text-text">{{ selectedItems.size }}</span>
          <span class="text-[9px] font-bold text-text/50 uppercase tracking-wider">Item</span>
        </div>
        <div v-else class="text-xs text-text/30 italic px-1 hidden md:block">
          Belum ada item dipilih
        </div>

        <!-- Kanan: Tombol Eksekusi -->
        <button
          @click="handleCompleteSelectedItems"
          class="flex-1 sm:flex-none group relative overflow-hidden bg-primary hover:bg-primary/90 text-background px-4 sm:pl-6 sm:pr-5 py-2.5 rounded-xl font-bold text-sm transition-all shadow-lg hover:shadow-primary/30 active:scale-95 flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed disabled:bg-secondary disabled:text-text/50 disabled:shadow-none"
          :disabled="isLoadingPicking || selectedItems.size === 0"
        >
          <div
            class="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform duration-300 ease-out"
          ></div>
          <span class="relative">Selesaikan</span>
          <font-awesome-icon
            :icon="isLoadingPicking ? 'fa-solid fa-spinner' : 'fa-solid fa-arrow-right'"
            :class="
              isLoadingPicking ? 'animate-spin' : 'group-hover:translate-x-1 transition-transform'
            "
            class="relative"
          />
        </button>
      </div>
    </transition>

    <div class="space-y-6 animate-fade-in pb-32">
      <!--
        TOP CONTROLS
      -->
      <div class="bg-secondary/5 p-4 rounded-xl border border-dashed border-secondary/20">
        <PickingFilterBar v-model="filterState" class="w-full" />
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
        <!--
          Tampilan GRID & COMPACT (Masonry Layout)
          - Grid: Pakai PickingListCard (Standard)
          - Compact: Pakai PickingListCardCompact (Kecil)
        -->
        <MasonryWall
          v-if="filterState.viewMode === 'grid' || filterState.viewMode === 'compact'"
          :items="displayedItems"
          :ssr-columns="1"
          :column-width="320"
          :gap="16"
        >
          <template #default="{ item: inv }">
            <component
              :is="filterState.viewMode === 'compact' ? PickingListCardCompact : PickingListCard"
              :inv="inv"
              :selectedItems="selectedItems"
              :validate-stock="canSelectItem"
              @toggle-invoice="handleToggleInvoice"
              @cancel-invoice="handleCancelInvoice"
              mode="picking"
            />
          </template>
        </MasonryWall>

        <!--
          Tampilan LIST (Stack)
          - Menggunakan PickingListRow (Flat Table-like Look)
        -->
        <div
          v-else
          class="flex flex-col border border-secondary/10 rounded-xl overflow-hidden shadow-sm bg-background"
        >
          <PickingListRow
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
.animate-fade-in {
  animation: fadeIn 0.4s ease-out forwards;
}

/* Animasi Slide Up untuk Floating Bar */
.slide-up-enter-active,
.slide-up-leave-active {
  transition: all 0.4s cubic-bezier(0.16, 1, 0.3, 1);
}
.slide-up-enter-from,
.slide-up-leave-to {
  opacity: 0;
  transform: translate(-50%, 40px) scale(0.95);
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
