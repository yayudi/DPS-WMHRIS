<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import BaseModal from '@/core/presentation/components/ui/BaseModal.vue'
import BasePagination from '@/core/presentation/components/ui/BasePagination.vue'
import { stockApi } from '@/modules/wms/infrastructure/stock.api'
import { useMasterDataStore } from '@/modules/master_data/application/masterData.store'
import { useMobile } from '@/core/presentation/composables/useMobile'
import { useI18n } from '@/core/presentation/composables/useI18n'
import { formatDate } from '@/core/utils/formatters'
import { usePagination } from '@/core/presentation/composables/usePagination'
import DateRangeFilter from '@/core/presentation/components/ui/DateRangeFilter.vue'

const { isMobile } = useMobile()
const { t } = useI18n()

const props = defineProps({
  show: Boolean,
  product: Object
})

const emit = defineEmits(['close'])

const history = ref([])
const totalHistory = ref(0)
const {
  currentPage,
  meta: paginationData,
  changePage
} = usePagination({
  totalItems: totalHistory,
  initialLimit: 10,
  onPageChange: () => loadHistory(currentPage.value)
})

const loading = ref(false)
const error = ref(null)
const movementType = ref('all')
const startDate = ref('')
const endDate = ref('')
const locationId = ref('all')
const userFilter = ref('')
const locations = ref([])

onMounted(async () => {
  try {
    const masterData = useMasterDataStore()
    locations.value = await masterData.getLocations()
  } catch (err) {
    console.error('Gagal memuat lokasi:', err)
  }
})

const movementTypes = computed(() => [
  { label: t('wms.history.type_all'), value: 'all' },
  { label: t('wms.history.type_inbound'), value: 'INBOUND' },
  { label: t('wms.history.type_transfer'), value: 'TRANSFER' },
  { label: t('wms.history.type_transfer_multi'), value: 'TRANSFER_MULTI' },
  { label: t('wms.history.type_adjustment'), value: 'ADJUSTMENT' },
  { label: t('wms.history.type_opname'), value: 'OPNAME' },
  { label: t('wms.history.type_sales'), value: 'SALES' },
  { label: t('wms.history.type_return'), value: 'RETURN' }
])

async function loadHistory(page) {
  if (!props.product) return
  loading.value = true
  error.value = null
  try {
    const response = await stockApi.fetchStockHistory(
      props.product.id,
      page,
      movementType.value,
      startDate.value,
      endDate.value,
      locationId.value,
      userFilter.value
    )
    history.value = response.data
    if (response.pagination) {
      totalHistory.value = response.pagination.total
      currentPage.value = response.pagination.page
    }
  } catch {
    error.value = t('wms.history.load_error')
  } finally {
    loading.value = false
  }
}

let userDebounceTimer = null
watch(userFilter, () => {
  clearTimeout(userDebounceTimer)
  userDebounceTimer = setTimeout(() => {
    loadHistory(1)
  }, 500)
})

watch([movementType, startDate, endDate, locationId], () => {
  loadHistory(1)
})

watch(
  () => props.show,
  newValue => {
    if (newValue) {
      loadHistory(1)
    }
  }
)
</script>
<template>
  <BaseModal :show="show" @close="emit('close')" :title="t('wms.history.title', { name: product?.name })" maxWidth="max-w-4xl">
    <div
      class="px-4 py-3 grid gap-2 items-center border-b border-secondary/20 bg-background/50"
      :class="isMobile ? 'grid-cols-2' : 'grid-cols-4'"
    >
      <select
        v-model="movementType"
        class="w-full bg-background border border-secondary rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 transition-shadow"
      >
        <option v-for="type in movementTypes" :key="type.value" :value="type.value">
          {{ type.label }}
        </option>
      </select>
      <select
        v-model="locationId"
        class="w-full bg-background border border-secondary rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 transition-shadow"
      >
        <option value="all">{{ t('common.label.all_locations') }}</option>
        <option v-for="loc in locations" :key="loc.id" :value="loc.id">
          {{ loc.code || loc.name }}
        </option>
      </select>
      <input
        type="text"
        v-model="userFilter"
        :placeholder="t('wms.history.search_user_placeholder')"
        class="w-full bg-background border border-secondary rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 transition-shadow"
      />
      <DateRangeFilter
        v-model:startDate="startDate"
        v-model:endDate="endDate"
        class="w-full"
        :align="isMobile ? 'left' : 'right'"
      />
    </div>
    <div class="max-h-[70vh] overflow-y-auto">
      <div v-if="loading" class="text-center p-8">{{ t('wms.history.loading') }}</div>
      <div v-else-if="error" class="text-center p-8 text-accent">{{ error }}</div>
      <div v-else-if="history.length === 0" class="text-center p-8 text-text/60">{{ t('wms.history.empty') }}</div>
      <table v-else class="text-sm" :class="isMobile ? 'w-full block' : 'min-w-full'">
        <thead class="bg-secondary/10 text-xs uppercase text-text/70" :class="isMobile ? 'hidden' : ''">
          <tr>
            <th class="p-2 text-left">{{ t('common.label.date') }}</th>
            <th class="p-2 text-left">{{ t('wms.history.th_type') }}</th>
            <th class="p-2 text-center">{{ t('common.label.qty') }}</th>
            <th class="p-2 text-left">{{ t('wms.history.th_from') }}</th>
            <th class="p-2 text-left">{{ t('wms.history.th_to') }}</th>
            <th class="p-2 text-left">{{ t('wms.history.th_by') }}</th>
            <th class="p-2 text-left">{{ t('common.label.notes') }}</th>
          </tr>
        </thead>
        <tbody :class="isMobile ? 'block' : 'divide-y divide-secondary/20'">
          <tr
            v-for="item in history"
            :key="item.id"
            class="transition-colors"
            :class="
              isMobile
                ? 'block mb-3 p-3 bg-background/50 rounded-xl border border-secondary/20 shadow-sm'
                : 'hover:bg-primary/5'
            "
          >
            <td
              :class="
                isMobile
                  ? 'flex justify-between items-center py-1.5 border-b border-secondary/10'
                  : 'p-2 whitespace-nowrap'
              "
            >
              <span v-if="isMobile" class="text-text/60 text-xs uppercase font-semibold">{{ t('common.label.date') }}</span>
              <span>{{ formatDate(item.created_at) }}</span>
            </td>
            <td :class="isMobile ? 'flex justify-between items-center py-1.5 border-b border-secondary/10' : 'p-2'">
              <span v-if="isMobile" class="text-text/60 text-xs uppercase font-semibold">{{ t('wms.history.th_type') }}</span>
              <span>{{ item.movement_type }}</span>
            </td>
            <td
              :class="
                isMobile
                  ? 'flex justify-between items-center py-1.5 border-b border-secondary/10'
                  : 'p-2 text-center font-bold'
              "
            >
              <span v-if="isMobile" class="text-text/60 text-xs uppercase font-semibold">{{ t('common.label.qty') }}</span>
              <span class="font-bold">{{ item.quantity }}</span>
            </td>
            <td
              :class="
                isMobile ? 'flex justify-between items-center py-1.5 border-b border-secondary/10' : 'p-2 font-mono'
              "
            >
              <span v-if="isMobile" class="text-text/60 text-xs uppercase font-semibold">{{ t('wms.history.th_from') }}</span>
              <span class="font-mono">{{ item.from_location || '-' }}</span>
            </td>
            <td
              :class="
                isMobile ? 'flex justify-between items-center py-1.5 border-b border-secondary/10' : 'p-2 font-mono'
              "
            >
              <span v-if="isMobile" class="text-text/60 text-xs uppercase font-semibold">{{ t('wms.history.th_to') }}</span>
              <span class="font-mono">{{ item.to_location || '-' }}</span>
            </td>
            <td :class="isMobile ? 'flex justify-between items-center py-1.5 border-b border-secondary/10' : 'p-2'">
              <span v-if="isMobile" class="text-text/60 text-xs uppercase font-semibold">{{ t('wms.history.th_by') }}</span>
              <span>{{ item.user }}</span>
            </td>
            <td :class="isMobile ? 'flex justify-between items-center py-1.5' : 'p-2 text-xs text-text/80'">
              <span v-if="isMobile" class="text-text/60 text-xs uppercase font-semibold">{{ t('common.label.notes') }}</span>
              <span class="text-xs text-text/80">{{ item.notes }}</span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <template v-if="paginationData.totalPages > 1 || totalHistory > 10" #footer>
      <div class="w-full">
        <BasePagination :pagination="paginationData" :show-limit-picker="false" @changePage="changePage" />
      </div>
    </template>
  </BaseModal>
</template>
