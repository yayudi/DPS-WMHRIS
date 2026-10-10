<script setup>
import { ref, watch } from 'vue'
import BaseModal from '@/components/ui/BaseModal.vue'
import BasePagination from '@/components/ui/BasePagination.vue'
import { stockApi } from '@/modules/wms/infrastructure/stock.api'
import { useMasterDataStore } from '@/stores/masterData'
import { useMobile } from '@/composables/useMobile'
import { onMounted } from 'vue'
import { usePagination } from '@/composables/usePagination'
import DateRangeFilter from '@/components/ui/DateRangeFilter.vue'

const { isMobile } = useMobile()

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

const movementTypes = [
  { label: 'Semua Tipe', value: 'all' },
  { label: 'Inbound', value: 'INBOUND' },
  { label: 'Transfer', value: 'TRANSFER' },
  { label: 'Transfer Multi', value: 'TRANSFER_MULTI' },
  { label: 'Penyesuaian (Adjustment)', value: 'ADJUSTMENT' },
  { label: 'Opname', value: 'OPNAME' },
  { label: 'Penjualan (Sales)', value: 'SALES' },
  { label: 'Retur (Return)', value: 'RETURN' }
]

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
    error.value = 'Gagal memuat riwayat stok.'
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
  <BaseModal :show="show" @close="emit('close')" :title="`Riwayat Stok: ${product?.name}`" maxWidth="max-w-4xl">
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
        <option value="all">Semua Lokasi</option>
        <option v-for="loc in locations" :key="loc.id" :value="loc.id">
          {{ loc.code || loc.name }}
        </option>
      </select>
      <input
        type="text"
        v-model="userFilter"
        placeholder="Cari user..."
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
      <div v-if="loading" class="text-center p-8">Memuat riwayat...</div>
      <div v-else-if="error" class="text-center p-8 text-accent">{{ error }}</div>
      <div v-else-if="history.length === 0" class="text-center p-8 text-text/60">Tidak ada riwayat pergerakan.</div>
      <table v-else class="text-sm" :class="isMobile ? 'w-full block' : 'min-w-full'">
        <thead class="bg-secondary/10 text-xs uppercase text-text/70" :class="isMobile ? 'hidden' : ''">
          <tr>
            <th class="p-2 text-left">Tanggal</th>
            <th class="p-2 text-left">Tipe</th>
            <th class="p-2 text-center">Jumlah</th>
            <th class="p-2 text-left">Dari</th>
            <th class="p-2 text-left">Ke</th>
            <th class="p-2 text-left">Oleh</th>
            <th class="p-2 text-left">Catatan</th>
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
              <span v-if="isMobile" class="text-text/60 text-xs uppercase font-semibold">Tanggal</span>
              <span>{{ new Date(item.created_at).toLocaleString('id-ID') }}</span>
            </td>
            <td :class="isMobile ? 'flex justify-between items-center py-1.5 border-b border-secondary/10' : 'p-2'">
              <span v-if="isMobile" class="text-text/60 text-xs uppercase font-semibold">Tipe</span>
              <span>{{ item.movement_type }}</span>
            </td>
            <td
              :class="
                isMobile
                  ? 'flex justify-between items-center py-1.5 border-b border-secondary/10'
                  : 'p-2 text-center font-bold'
              "
            >
              <span v-if="isMobile" class="text-text/60 text-xs uppercase font-semibold">Jumlah</span>
              <span class="font-bold">{{ item.quantity }}</span>
            </td>
            <td
              :class="
                isMobile ? 'flex justify-between items-center py-1.5 border-b border-secondary/10' : 'p-2 font-mono'
              "
            >
              <span v-if="isMobile" class="text-text/60 text-xs uppercase font-semibold">Dari</span>
              <span class="font-mono">{{ item.from_location || '-' }}</span>
            </td>
            <td
              :class="
                isMobile ? 'flex justify-between items-center py-1.5 border-b border-secondary/10' : 'p-2 font-mono'
              "
            >
              <span v-if="isMobile" class="text-text/60 text-xs uppercase font-semibold">Ke</span>
              <span class="font-mono">{{ item.to_location || '-' }}</span>
            </td>
            <td :class="isMobile ? 'flex justify-between items-center py-1.5 border-b border-secondary/10' : 'p-2'">
              <span v-if="isMobile" class="text-text/60 text-xs uppercase font-semibold">Oleh</span>
              <span>{{ item.user }}</span>
            </td>
            <td :class="isMobile ? 'flex justify-between items-center py-1.5' : 'p-2 text-xs text-text/80'">
              <span v-if="isMobile" class="text-text/60 text-xs uppercase font-semibold">Catatan</span>
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
