<script setup>
import { swalConfirm, swalAlert } from '@/composables/useSweetAlert'
import { ref, computed, watch } from 'vue'
import { useToast } from '@/composables/useToast.js'
import { useAuthStore } from '@/stores/auth.js'
import { useTaskGrouping } from '@/composables/useTaskGrouping.js'
import { useFirebaseSync } from '@/composables/useFirebaseSync.js'
import {
  getPendingPickingItems,
  completePickingItems,
  voidPickingList,
  retryBackorders,
  retryBackordersBatch
} from '@/api/helpers/picking.js'
import PickingFilterBar from '@/components/picking/PickingFilterBar.vue'
import PickingListCard from '@/components/picking/PickingListCard.vue'
import PickingListCardCompact from '@/components/picking/PickingListCardCompact.vue'
import PickingListRow from '@/components/picking/PickingListRow.vue'
import BasePagination from '@/components/ui/BasePagination.vue'
import { usePagination } from '@/composables/usePagination.js'
import MasonryWall from '@yeger/vue-masonry-wall'
import { useQuery } from '@tanstack/vue-query'

const { toast } = useToast()
const authStore = useAuthStore()
// --- ACTIONS (API CALLS) ---
const {
  isLoading: isLoadingPicking,
  data: queryData,
  refetch: fetchPendingItems
} = useQuery({
  queryKey: ['pendingPickingItems'],
  queryFn: async () => {
    const response = await getPendingPickingItems()
    let data = []
    if (Array.isArray(response)) data = response
    else if (response?.data && Array.isArray(response.data)) data = response.data
    return data
  },
  refetchOnWindowFocus: false // Prevent unneeded re-fetches
})

const pendingItems = computed(() => queryData.value || [])

// Firebase Real-time Sync
useFirebaseSync('PICKING_LIST', 'REFRESH_PICKING', () => fetchPendingItems())

// --- STATE ---
const isVoiding = ref(false)
const selectedItems = ref(new Set())

watch(queryData, () => {
  selectedItems.value = new Set()
})

const selectionStats = computed(() => {
  const uniqueInvoices = new Set()
  let skuCount = 0

  selectedItems.value.forEach(itemId => {
    const item = itemsMap.value.get(itemId)
    if (item) {
      skuCount++
      uniqueInvoices.add(item.picking_list_id)
    }
  })

  return {
    invoices: uniqueInvoices.size,
    skus: skuCount,
    invoiceIds: Array.from(uniqueInvoices)
  }
})

const filterState = ref({
  search: '',
  source: { include: [], exclude: [] },
  stockStatus: { include: [], exclude: [] },
  shopName: { include: [], exclude: [] },
  locationPurpose: { include: [], exclude: [] },
  sortBy: 'newest',
  viewMode: 'grid', // Default GRID
  startDate: '',
  endDate: ''
})

// --- OPTIMIZATION: ITEMS MAP ---
const itemsMap = computed(() => {
  const map = new Map()
  pendingItems.value.forEach(item => {
    map.set(item.id, item)
  })
  return map
})

// --- COMPUTED: SHOP OPTIONS ---
const shopOptions = computed(() => {
  const shops = new Set()
  if (pendingItems.value) {
    pendingItems.value.forEach(item => {
      if (item.shop_name) {
        shops.add(item.shop_name)
      }
    })
  }

  const options = [{ id: 'ALL', label: 'Semua Channel/Toko' }]
  Array.from(shops)
    .sort()
    .forEach(shop => {
      options.push({ id: shop, label: shop })
    })

  return options
})

// --- LOGIC: GROUPING ---
const { groupedTasks } = useTaskGrouping(pendingItems, filterState)

// --- PAGINATION LOGIC ---
const {
  paginatedData: displayedItems,
  meta: paginationState,
  changePage: handlePageChange,
  changePageSize: handleLimitChange
} = usePagination({
  totalItems: groupedTasks,
  storageKey: 'pickingTaskPageSize',
  initialLimit: 15
})

watch(
  filterState,
  () => {
    handlePageChange(1)
  },
  { deep: true }
)

// --- LOGIC: STOCK VALIDATION ---
const stockUsage = computed(() => {
  const usage = {}
  selectedItems.value.forEach(id => {
    const item = itemsMap.value.get(id)
    if (item && item.location_code) {
      const key = `${item.sku}_${item.location_code}`
      usage[key] = (usage[key] || 0) + Number(item.quantity)
    }
  })
  return usage
})

// Logika Validasi Seleksi Item
async function canSelectItem(item) {
  if (!item) return false

  // Debugging log
  const debugTag = `[Validasi Item #${item.id} ${item.sku}]`

  if (item.status === 'BACKORDER' || !item.location_code) {
    return true
  }

  // Cek stok sekadar untuk warning log (tidak memblokir)
  const key = `${item.sku}_${item.location_code}`
  const currentUsage = stockUsage.value[key] || 0

  const available = Number(item.available_stock || 0)
  const qtyNeeded = Number(item.quantity || 0)

  if (currentUsage + qtyNeeded > available && !selectedItems.value.has(item.id)) {
    if (import.meta.env.DEV) {
      console.warn(
        `${debugTag} GAGAL: Stok Tidak Cukup di ${item.location_code}. Butuh: ${qtyNeeded}, Sisa Hitungan: ${
          available - currentUsage
        }. Item tetap diizinkan agar Backend bisa Re-route.`
      )
    }
  }

  return true
}

const isSubmitting = ref(false)

async function handleCompleteSelectedItems() {
  if (selectedItems.value.size === 0) return
  if (selectedItems.value.size > 2000) {
    toast('Maksimal memproses 2000 item sekaligus untuk mencegah server timeout.', 'warning')
    return
  }

  isSubmitting.value = true
  const idsToComplete = Array.from(selectedItems.value)

  try {
    const payloadItems = idsToComplete
      .map(id => {
        const originalItem = itemsMap.value.get(id)
        if (!originalItem) return null
        return {
          id: originalItem.id,
          picking_list_id: originalItem.picking_list_id,
          product_id: originalItem.product_id,
          quantity: originalItem.quantity,
          location_id: originalItem.suggested_location_id
        }
      })
      .filter(i => i !== null)

    const res = await completePickingItems({ items: payloadItems })

    if (res.success) {
      toast(res.message, 'success')
      pendingItems.value = pendingItems.value.filter(item => !selectedItems.value.has(item.id))
      selectedItems.value = new Set() // Reset dengan Set baru
    } else {
      toast(res.message || 'Gagal memproses sebagian item.', 'warning')
    }
    // Refresh data untuk konsistensi penuh
    await fetchPendingItems()
  } catch (error) {
    console.error(error) // Auto-added to prevent unused var
    const errData = error.response?.data || error
    const details = errData.errors || []

    if (details.length > 0) {
      const maxErrors = Math.min(details.length, 10)
      const visibleErrors = details
        .slice(0, maxErrors)
        .map(d => `<li>${d}</li>`)
        .join('')
      const moreStr =
        details.length > maxErrors
          ? `<li class="font-bold pt-2 list-none">...dan ${details.length - maxErrors} error lainnya.</li>`
          : ''
      const htmlContent = `<ul class="text-left text-sm space-y-1 text-danger list-disc list-inside">${visibleErrors}${moreStr}</ul>`

      await swalAlert(errData.message || 'Gagal Memproses Pesanan', htmlContent, 'error', true)
    } else {
      toast(errData.message || 'Terjadi kesalahan sistem.', 'error')
    }
  } finally {
    isSubmitting.value = false
  }
}

async function handleVoidSelectedItems() {
  if (selectedItems.value.size === 0) return
  if (selectedItems.value.size > 2000) {
    toast('Maksimal memproses 2000 item sekaligus untuk mencegah server timeout.', 'warning')
    return
  }

  // Dapatkan daftar picking_list_id unik dari item yang terpilih
  const uniqueInvoices = new Set()
  selectedItems.value.forEach(itemId => {
    const item = itemsMap.value.get(itemId)
    if (item) {
      uniqueInvoices.add(item.picking_list_id)
    }
  })

  if (!(await swalConfirm(`Void ${uniqueInvoices.size} pesanan ini? Stok akan dikembalikan.`))) return

  isVoiding.value = true
  let successCount = 0
  let failCount = 0

  try {
    // Batalkan setiap list ID satu per satu
    for (const listId of uniqueInvoices) {
      try {
        await voidPickingList(listId)
        successCount++
      } catch (err) {
        console.error(`Gagal void list ${listId}:`, err)
        failCount++
      }
    }

    if (successCount > 0) {
      toast(`Berhasil void ${successCount} pesanan.`, 'success')
      selectedItems.value = new Set() // Reset setelah berhasil
    }
    if (failCount > 0) {
      toast(`Gagal void ${failCount} pesanan.`, 'warning')
    }

    await fetchPendingItems()
  } finally {
    isVoiding.value = false
  }
}

async function handleVoidInvoice(pickingListId) {
  try {
    const res = await voidPickingList(pickingListId)
    toast(res.message || 'Picking List berhasil divoid', 'success')
    // Optimistic Update
    const newData = queryData.value.filter(i => i.picking_list_id !== pickingListId)
    queryData.value = newData
  } catch (err) {
    toast(err.message || 'Gagal mem-void Picking List', 'error')
  }
}

async function handleRetryBackorder(pickingListId) {
  try {
    const res = await retryBackorders(pickingListId)
    toast(res.message || 'Stok berhasil dicek ulang', 'success')
    fetchPendingItems()
  } catch (err) {
    toast(err.message || 'Gagal mengecek stok', 'error')
  }
}

const isRetryingBatch = ref(false)
async function handleRetryBatch() {
  if (selectionStats.value.invoiceIds.length === 0) return
  if (selectedItems.value.size > 2000) {
    toast('Maksimal memproses 2000 item sekaligus untuk mencegah server timeout.', 'warning')
    return
  }
  isRetryingBatch.value = true
  try {
    const res = await retryBackordersBatch(selectionStats.value.invoiceIds)
    toast(res.message || 'Pengecekan ulang stok batch selesai', 'success')
    fetchPendingItems()
  } catch (err) {
    toast(err.message || 'Gagal mengecek ulang stok batch', 'error')
  } finally {
    isRetryingBatch.value = false
  }
}

// --- COMPLETE ITEMS LOGIC ---
function handleToggleInvoice({ inv, checked }) {
  console.log(`[Toggle Invoice] Invoice ID: ${inv.id}, Checked: ${checked}`)
  const allItemIds = []
  if (inv.locations) {
    Object.values(inv.locations).forEach(items => items.forEach(item => allItemIds.push(item)))
  } else if (inv.items) {
    inv.items.forEach(item => allItemIds.push(item))
  }

  const newSet = new Set(selectedItems.value)

  allItemIds.forEach(item => {
    if (checked) {
      if (canSelectItem(item)) {
        newSet.add(item.id)
      } else {
        toast(`Item ${item.sku} ditolak oleh validasi.`, 'warning')
      }
    } else {
      newSet.delete(item.id)
    }
  })

  // Re-assign untuk trigger update UI
  selectedItems.value = newSet
  console.log('Selected Items Count:', selectedItems.value.size)
}

function handleSelectAll() {
  const newSet = new Set(selectedItems.value)

  displayedItems.value.forEach(inv => {
    const allItemIds = []
    if (inv.locations) {
      Object.values(inv.locations).forEach(items => items.forEach(item => allItemIds.push(item)))
    } else if (inv.items) {
      inv.items.forEach(item => allItemIds.push(item))
    }

    allItemIds.forEach(item => {
      // Cek validasi sebelum add
      if (canSelectItem(item)) newSet.add(item.id)
    })
  })

  selectedItems.value = newSet
  console.log('Select All - Total:', selectedItems.value.size)
}

function handleUncheckAll() {
  selectedItems.value = new Set()
}

defineExpose({
  fetchPendingItems,
  pendingCount: computed(() => {
    const uniqueInvoices = new Set(pendingItems.value.map(i => i.picking_list_id))
    return uniqueInvoices.size
  })
})
</script>

<template>
  <div class="relative min-h-[500px]">
    <!-- FLOATING ACTION BAR -->
    <Teleport to="body">
      <transition name="slide-up">
        <div
          v-if="pendingItems.length > 0"
          class="fixed bottom-6 left-1/2 -translate-x-1/2 w-[98%] md:w-[85%] max-w-5xl bg-secondary/95 border border-secondary/20 backdrop-blur-xl p-3 rounded-2xl shadow-2xl z-[200] flex flex-col gap-3 ring-1 ring-black/5"
        >
          <!-- ROW 1: PAGINATION -->
          <BasePagination
            v-if="paginationState.totalPages > 1 || groupedTasks.length > 15"
            :pagination="paginationState"
            :limit-options="[15, 30, 60, 90]"
            class="!bg-background/40 rounded-xl w-full border border-secondary/10"
            @changePage="handlePageChange"
            @update:limit="handleLimitChange"
          />

          <!-- ROW 2: ACTIONS -->
          <div class="flex flex-col md:flex-row items-center justify-between gap-3 overflow-x-auto no-scrollbar w-full">
            <!-- Kontrol Seleksi -->
            <div class="flex items-center justify-between md:justify-start w-full md:w-auto gap-2 shrink-0">
              <button
                @click="handleSelectAll"
                class="px-3 py-2 bg-secondary/50 hover:bg-primary/20 text-primary rounded-lg text-xs font-bold transition-colors border border-primary/20 hover:border-primary/50 flex items-center gap-1.5 active:scale-95 flex-1 justify-center md:flex-none"
                title="Pilih Semua Item Tampil"
              >
                <font-awesome-icon icon="fa-solid fa-check-double" />
                <span class="hidden sm:inline">Pilih Semua</span>
              </button>

              <button
                @click="handleUncheckAll"
                :disabled="selectedItems.size === 0"
                class="px-3 py-2 bg-secondary/50 hover:bg-danger/20 text-text/60 hover:text-danger rounded-lg text-xs font-bold transition-colors border border-secondary/30 hover:border-danger/50 disabled:opacity-30 disabled:cursor-not-allowed flex items-center gap-1.5 active:scale-95 flex-1 justify-center md:flex-none"
                title="Reset Pilihan"
              >
                <font-awesome-icon icon="fa-solid fa-xmark" />
                <span class="hidden sm:inline">Reset</span>
              </button>
            </div>

            <!--Info (Jika ada yang dipilih) -->
            <div v-if="selectedItems.size > 0" class="flex items-center justify-center gap-3 px-2 w-full md:w-auto">
              <div class="flex flex-col items-center leading-none min-w-[50px]">
                <span class="font-black text-lg text-text">{{ selectionStats.invoices }}</span>
                <span class="text-[9px] font-bold text-text/50 uppercase tracking-wider">Invoices</span>
              </div>
              <div class="w-px h-6 bg-secondary/20 rounded-full hidden sm:block"></div>
              <div class="flex flex-col items-center leading-none min-w-[50px]">
                <span class="font-black text-lg text-text">{{ selectionStats.skus }}</span>
                <span class="text-[9px] font-bold text-text/50 uppercase tracking-wider">SKU</span>
              </div>
            </div>
            <div v-else class="text-xs text-text/30 italic px-1 text-center w-full md:w-auto md:text-left">
              Belum ada pesanan dipilih
            </div>

            <!-- Tombol Eksekusi -->
            <div class="flex items-center gap-2 w-full md:w-auto shrink-0 mt-2 md:mt-0">
              <!-- Tombol Cek Stok Batch -->
              <button
                @click="handleRetryBatch"
                class="flex-1 sm:flex-none flex items-center justify-center gap-2 text-warning/80 hover:bg-warning/10 hover:text-warning hover:border-warning/30 border border-warning/10 px-4 py-2.5 rounded-xl font-bold text-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                :disabled="isVoiding || isLoadingPicking || isRetryingBatch || selectedItems.size === 0"
                title="Cek Ulang Stok untuk Pesanan Terpilih"
              >
                <font-awesome-icon
                  :icon="isRetryingBatch ? 'fa-solid fa-spinner' : 'fa-solid fa-rotate-right'"
                  :class="{ 'animate-spin': isRetryingBatch, 'text-warning': !isRetryingBatch }"
                />
                <span class="hidden sm:inline">Cek Stok</span>
              </button>

              <button
                v-if="authStore.hasPermission('picking_list.void')"
                @click="handleVoidSelectedItems"
                class="flex-1 sm:flex-none group relative overflow-hidden bg-danger hover:bg-danger/90 text-background px-4 sm:pl-6 sm:pr-5 py-2.5 rounded-xl font-bold text-sm transition-all shadow-lg hover:shadow-primary/30 active:scale-95 flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed disabled:bg-secondary disabled:text-text/50 disabled:shadow-none"
                :disabled="isVoiding || isLoadingPicking || isRetryingBatch || selectedItems.size === 0"
              >
                <span class="w-4 flex justify-center">
                  <font-awesome-icon
                    :icon="isVoiding ? 'fa-solid fa-spinner' : 'fa-solid fa-ban'"
                    :class="{ 'animate-spin': isVoiding }"
                  />
                </span>
                <span>{{ isVoiding ? 'Memproses...' : 'Void Batch' }}</span>
              </button>

              <!-- Tombol Selesaikan -->
              <button
                @click="handleCompleteSelectedItems"
                class="flex-1 sm:flex-none group relative overflow-hidden bg-primary hover:bg-primary/90 text-background px-4 sm:pl-6 sm:pr-5 py-2.5 rounded-xl font-bold text-sm transition-all shadow-lg hover:shadow-primary/30 active:scale-95 flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed disabled:bg-secondary disabled:text-text/50 disabled:shadow-none"
                :disabled="isLoadingPicking || isSubmitting || isVoiding || isRetryingBatch || selectedItems.size === 0"
              >
                <div
                  class="absolute inset-0 bg-background/20 translate-y-full group-hover:translate-y-0 transition-transform duration-300 ease-out"
                ></div>
                <span class="relative">Selesaikan</span>
                <font-awesome-icon
                  :icon="isSubmitting ? 'fa-solid fa-spinner' : 'fa-solid fa-arrow-right'"
                  :class="isSubmitting ? 'animate-spin' : 'group-hover:translate-x-1 transition-transform'"
                  class="relative"
                />
              </button>
            </div>
          </div>
        </div>
      </transition>
    </Teleport>

    <div class="space-y-6 animate-fade-in pb-32">
      <!--TOP CONTROLS-->
      <div class="bg-secondary/50 p-4 rounded-xl border border-dashed border-secondary/20">
        <PickingFilterBar v-model="filterState" :shop-options="shopOptions" class="w-full" />
      </div>

      <!-- Loading & Empty States -->
      <div v-if="isLoadingPicking && pendingItems.length === 0" class="py-32 text-center opacity-60">
        <font-awesome-icon icon="fa-solid fa-cubes-stacked" class="text-6xl mb-4 animate-bounce text-secondary" />
        <p>Memuat daftar tugas...</p>
      </div>

      <div
        v-else-if="groupedTasks.length === 0"
        class="py-24 text-center border-2 border-dashed border-secondary/30 rounded-2xl bg-secondary/5"
      >
        <font-awesome-icon icon="fa-solid fa-clipboard-check" class="text-5xl text-primary/50 mb-4" />
        <h3 class="text-xl font-bold">Semua Beres!</h3>
        <p class="text-text/50 mt-1">Tidak ada item yang perlu dipicking saat ini.</p>
      </div>

      <!-- Main Content -->
      <div v-else class="pb-16">
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
              @void-invoice="handleVoidInvoice"
              @retry-backorder="handleRetryBackorder"
              mode="picking"
            />
          </template>
        </MasonryWall>

        <!-- Tampilan LIST (Stack) -->
        <div v-else class="flex flex-col border border-secondary/10 rounded-xl overflow-hidden shadow-sm bg-background">
          <PickingListRow
            v-for="inv in displayedItems"
            :key="inv.id"
            :inv="inv"
            :selectedItems="selectedItems"
            :validate-stock="canSelectItem"
            @toggle-invoice="handleToggleInvoice"
            @void-invoice="handleVoidInvoice"
            @retry-backorder="handleRetryBackorder"
            mode="picking"
          />
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
