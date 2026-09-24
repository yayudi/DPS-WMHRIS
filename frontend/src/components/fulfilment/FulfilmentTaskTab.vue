<script setup>
import { ref, computed, watch } from 'vue'
import { useStorage } from '@vueuse/core'
import { useToast } from '@/composables/useToast.js'
import { useFirebaseSync } from '@/composables/useFirebaseSync.js'
import {
  getPendingFulfilmentItems,
  completeFulfilmentItems,
  voidFulfilmentList,
  getPendingFilterOptions
} from '@/api/helpers/fulfilment.js'
import FulfilmentFilterBar from '@/components/fulfilment/FulfilmentFilterBar.vue'
import FulfilmentListCard from '@/components/fulfilment/FulfilmentListCard.vue'
import FulfilmentListCardCompact from '@/components/fulfilment/FulfilmentListCardCompact.vue'
import FulfilmentListRow from '@/components/fulfilment/FulfilmentListRow.vue'
import BasePagination from '@/components/ui/BasePagination.vue'
import { usePagination } from '@/composables/usePagination.js'
import MasonryWall from '@yeger/vue-masonry-wall'
import { useQuery } from '@tanstack/vue-query'
import { useRouter } from 'vue-router'
import { useFulfilmentStore } from '@/stores/fulfilment'

const router = useRouter()
const fulfilmentStore = useFulfilmentStore()
const { toast } = useToast()
// --- ACTIONS (API CALLS) ---
const {
  isLoading: isLoadingFulfilment,
  data: queryData,
  refetch: fetchPendingItems
} = useQuery({
  queryKey: ['pendingFulfilmentItems'],
  queryFn: async () => {
    const params = {
      search: filterState.value.search,
      sourceType: filterState.value.sourceType,
      isSameday: filterState.value.isSameday !== 'All' ? filterState.value.isSameday : undefined,
      isBackorder: filterState.value.isBackorder !== 'All' ? filterState.value.isBackorder : undefined,
      role: filterState.value.role,
      startDate: filterState.value.startDate,
      endDate: filterState.value.endDate,
      sortBy: filterState.value.sortBy,
      page: paginationState.value.page,
      limit: paginationState.value.limit,
      'sourceInclude[]': filterState.value.source.include,
      'sourceExclude[]': filterState.value.source.exclude,
      'shopInclude[]': filterState.value.shopName.include,
      'shopExclude[]': filterState.value.shopName.exclude,
      'expeditionIdInclude[]': filterState.value.courier.include,
      'expeditionIdExclude[]': filterState.value.courier.exclude
    }
    const response = await getPendingFulfilmentItems(params)
    if (response && response.items) {
      serverTotal.value = response.total || 0
      return response.items
    }
    serverTotal.value = 0
    return []
  },
  refetchOnWindowFocus: false
})

const pendingItems = computed(() => queryData.value || [])
const serverTotal = ref(0)

// Firebase Real-time Sync
useFirebaseSync('FULFILMENT_LIST', 'REFRESH_FULFILMENT', () => fetchPendingItems())

const filterState = useStorage(
  'wms_task_filter_state',
  {
    search: '',
    source: { include: [], exclude: [] },
    stockStatus: { include: [], exclude: [] },
    shopName: { include: [], exclude: [] },
    courier: { include: [], exclude: [] },
    locationPurpose: { include: [], exclude: [] },
    sourceType: 'All',
    isSameday: 'All',
    isBackorder: 'All',
    role: 'All',
    sortBy: 'newest',
    viewMode: 'grid', // Default GRID
    startDate: '',
    endDate: ''
  },
  localStorage,
  { mergeDefaults: true }
)

const filterOptions = ref({ couriers: [], shops: [] })

const fetchOptions = async () => {
  try {
    const res = await getPendingFilterOptions()
    if (res) filterOptions.value = res
  } catch (err) {
    console.error('Failed to load filter options', err)
  }
}
fetchOptions()

// --- COMPUTED: SHOP OPTIONS ---
const shopOptions = computed(() => {
  const options = []
  if (filterOptions.value.shops) {
    ;[...filterOptions.value.shops].sort().forEach(shop => {
      options.push({ id: shop, label: shop })
    })
  }
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

// --- LOGIC: GROUPING ---
const groupedTasks = computed(() => {
  const rawItems = pendingItems.value
  if (!rawItems || rawItems.length === 0) return []

  const groups = new Map()

  rawItems.forEach(item => {
    const invId = item.original_invoice_id || `MANUAL-${item.fulfilment_list_id}`

    if (!groups.has(invId)) {
      groups.set(invId, {
        id: item.fulfilment_list_id,
        fulfilment_list_id: item.fulfilment_list_id,
        invoice: invId,
        invoice_no: item.invoice_no,
        original_invoice_id: item.original_invoice_id,
        source: item.source || 'Unknown',
        location_purpose: item.location_purpose,
        customer_name: item.customer_name,
        shop_name: item.shop_name,
        courier: item.courier,
        expedition_id: item.expedition_id,
        awb: item.awb,
        kelja_histories: item.kelja_histories ? JSON.parse(item.kelja_histories) : [],
        status: item.status,
        marketplace_status: item.marketplace_status,
        order_date: item.order_date,
        created_at: item.created_at,
        locations: {}
      })
    }

    const group = groups.get(invId)
    const locKey = item.location_code || 'Unknown Loc'

    if (!group.locations[locKey]) {
      group.locations[locKey] = []
    }
    group.locations[locKey].push(item)
  })

  const result = Array.from(groups.values())
  return result
})

// --- PAGINATION LOGIC ---
const {
  meta: paginationState,
  changePage: handlePageChange,
  changePageSize: handleLimitChange
} = usePagination({
  totalItems: serverTotal,
  storageKey: 'fulfilmentTaskPageSize',
  initialLimit: 15
})

const displayedItems = computed(() => groupedTasks.value) // Grouped items correspond to current page directly!

watch(
  [filterState, paginationState],
  () => {
    fetchPendingItems()
  },
  { deep: true }
)

// --- COMPLETE ITEMS LOGIC (Per Invoice) ---
const isSubmitting = ref(false)

async function handleCompleteInvoice(inv, actionName) {
  isSubmitting.value = true
  try {
    // Gather all items in this invoice
    const allItems = []
    if (inv.locations) {
      Object.values(inv.locations).forEach(items => items.forEach(item => allItems.push(item)))
    } else if (inv.items) {
      inv.items.forEach(item => allItems.push(item))
    }

    const payloadItems = allItems.map(item => ({
      id: item.id,
      fulfilment_list_id: item.fulfilment_list_id || item.fulfilment_list_id,
      product_id: item.product_id,
      quantity: item.quantity,
      location_id: item.suggested_location_id
    }))

    const res = await completeFulfilmentItems({ items: payloadItems, action: actionName })

    if (res.success) {
      toast(res.message, 'success')
      await fetchPendingItems()
    } else {
      toast(res.message || 'Gagal menyelesaikan pesanan.', 'warning')
    }
  } catch (error) {
    console.error(error)
    const errData = error.response?.data || error

    if (errData.errors && errData.errors.length > 0) {
      toast(errData.errors[0], 'error') // Show the first specific error
    } else {
      toast(errData.message || 'Terjadi kesalahan sistem.', 'error')
    }
  } finally {
    isSubmitting.value = false
  }
}

async function handleVoidInvoice(fulfilmentListId) {
  try {
    const res = await voidFulfilmentList(fulfilmentListId)
    toast(res.message || 'Fulfilment berhasil divoid', 'success')
    const newData = queryData.value.filter(i => i.fulfilment_list_id !== fulfilmentListId)
    queryData.value = newData
  } catch (err) {
    toast(err.message || 'Gagal mem-void Fulfilment', 'error')
  }
}

function handleCardClick(inv) {
  fulfilmentStore.setSelectedInvoice(inv)
  router.push({ name: 'WMSFulfilmentProcess', params: { id: inv.id || inv.fulfilment_list_id } })
}

defineExpose({
  fetchPendingItems,
  handleCompleteInvoice,
  handleVoidInvoice,
  pendingCount: computed(() => {
    const uniqueInvoices = new Set(pendingItems.value.map(i => i.fulfilment_list_id))
    return uniqueInvoices.size
  })
})
</script>

<template>
  <div class="relative min-h-[500px] flex flex-col">
    <div class="space-y-6 animate-fade-in pb-16">
      <!--TOP CONTROLS-->
      <div class="bg-secondary/60 p-4 rounded-xl border border-dashed border-secondary/20">
        <FulfilmentFilterBar
          v-model="filterState"
          :shop-options="shopOptions"
          :courier-options="courierOptions"
          class="w-full"
        />
      </div>

      <!-- Loading & Empty States -->
      <div v-if="isLoadingFulfilment && pendingItems.length === 0" class="py-32 text-center opacity-60">
        <font-awesome-icon icon="fa-solid fa-cubes-stacked" class="text-6xl mb-4 animate-bounce text-secondary" />
        <p>Memuat daftar tugas...</p>
      </div>

      <div
        v-else-if="groupedTasks.length === 0"
        class="py-24 text-center border-2 border-dashed border-secondary/30 rounded-2xl bg-secondary/5"
      >
        <font-awesome-icon icon="fa-solid fa-clipboard-check" class="text-5xl text-primary/50 mb-4" />
        <h3 class="text-xl font-bold">Semua Beres!</h3>
        <p class="text-text/50 mt-1">Tidak ada pesanan yang perlu diproses saat ini.</p>
      </div>

      <!-- Main Content -->
      <div v-else>
        <MasonryWall
          v-if="filterState.viewMode === 'grid' || filterState.viewMode === 'compact'"
          :items="displayedItems"
          :ssr-columns="1"
          :column-width="320"
          :gap="16"
        >
          <template #default="{ item: inv }">
            <component
              :is="filterState.viewMode === 'compact' ? FulfilmentListCardCompact : FulfilmentListCard"
              :inv="inv"
              @complete-invoice="handleCompleteInvoice"
              @void-invoice="handleVoidInvoice"
              @card-click="handleCardClick"
              mode="picking"
            />
          </template>
        </MasonryWall>

        <!-- Tampilan LIST (Stack) -->
        <div v-else class="flex flex-col border border-secondary/10 rounded-xl overflow-hidden shadow-sm bg-background">
          <FulfilmentListRow
            v-for="inv in displayedItems"
            :key="inv.id"
            :inv="inv"
            @complete-invoice="handleCompleteInvoice"
            @void-invoice="handleVoidInvoice"
            @card-click="handleCardClick"
            mode="picking"
          />
        </div>
      </div>
    </div>

    <!-- Pagination Bottom (Sticky) -->
    <div
      v-if="paginationState.totalPages > 1 || groupedTasks.length > 15"
      class="sticky bottom-0 bg-background rounded-md mt-auto z-10"
    >
      <BasePagination
        :pagination="paginationState"
        :limit-options="[15, 30, 60, 90]"
        @changePage="handlePageChange"
        @update:limit="handleLimitChange"
      />
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
