<!-- frontend\src\components\picking\PickingListCard.vue -->
<script setup>
import { computed, ref } from 'vue'
import { formatDate } from '@/api/helpers/time.js'

const props = defineProps({
  inv: {
    type: Object,
    required: true,
  },
  selectedItems: {
    type: Set,
    default: () => new Set(),
  },
  validateStock: {
    type: Function,
    default: () => true,
  },
  mode: {
    type: String,
    default: 'picking',
  },
  historyLogs: {
    type: Array,
    default: () => [],
  },
})

const emit = defineEmits(['toggle-item', 'toggle-location', 'cancel-invoice'])
const showHistory = ref(false)

function onToggleItem(id, locationCode) {
  if (props.mode === 'history') return
  if (locationCode) emit('toggle-item', id)
}

function onToggleLocation(items, event) {
  emit('toggle-location', { items, checked: event.target.checked })
}

function onCancelInvoice() {
  if (
    confirm(`Batalkan seluruh pesanan ${props.inv.invoice}? Data akan dihapus dari daftar tugas.`)
  ) {
    emit('cancel-invoice', props.inv.id)
  }
}

const sourceColorClass = computed(() => {
  const source = props.inv.source
  if (source === 'Tokopedia') return 'bg-success/30'
  if (source === 'Shopee') return 'bg-warning/30'
  return 'bg-background'
})

function isItemDisabled(item) {
  if (props.mode === 'history') return false
  if (!item.location_code) return true
  if (!props.selectedItems.has(item.id) && !props.validateStock(item)) {
    return true
  }
  return false
}

const hasStockIssue = computed(() => {
  if (!props.inv.locations) return false
  for (const locName in props.inv.locations) {
    const items = props.inv.locations[locName]
    for (const item of items) {
      if (!item.location_code) return true
      if (Number(item.available_stock || 0) < Number(item.quantity || 0)) return true
    }
  }
  return false
})

// [NEW] Helper Badge untuk Status Marketplace
function getMpStatusBadge(status) {
  if (!status) return null

  // Status Standardized dari Backend (MP_STATUS)
  switch (status) {
    case 'SHIPPED':
      return { class: 'bg-primary text-white', label: 'Dikirim', icon: 'fa-truck-fast' }
    case 'COMPLETED':
      return { class: 'bg-success text-white', label: 'Selesai', icon: 'fa-check-double' }
    case 'NEW':
      return { class: 'bg-info text-white', label: 'Baru', icon: 'fa-star' }
    case 'CANCELLED':
      return { class: 'bg-danger text-white', label: 'Batal', icon: 'fa-ban' }
    case 'RETURNED':
      return { class: 'bg-warning text-white', label: 'Retur', icon: 'fa-rotate-left' }
    default:
      return { class: 'bg-secondary text-text', label: status, icon: 'fa-info' }
  }
}

function getStatusBadge(status) {
  if (status === 'COMPLETED')
    return {
      class: 'text-success bg-success/10 border-success/20',
      label: 'Selesai',
      icon: 'fa-check',
    }
  if (status === 'RETURNED')
    return {
      class: 'text-danger bg-danger/10 border-danger/20',
      label: 'Retur',
      icon: 'fa-rotate-left',
    }
  if (status === 'SHIPPED')
    return {
      class: 'text-primary bg-primary/10 border-primary/20',
      label: 'Dikirim',
      icon: 'fa-truck',
    }
  if (status === 'CANCEL' || status === 'CANCELLED')
    return {
      class: 'text-text/50 bg-secondary/10 border-secondary/20',
      label: 'Dibatalkan',
      icon: 'fa-ban',
    }
  return { class: 'text-text/50 bg-secondary/10', label: status, icon: 'fa-info' }
}

const formattedOrderDate = computed(() => formatDate(props.inv.order_date, true, true))
const formattedCreatedAt = computed(() => formatDate(props.inv.created_at, true, true))
</script>

<template>
  <div
    class="bg-background border border-secondary/40 rounded-xl overflow-hidden hover:border-primary transition-all duration-300 flex flex-col shadow-sm hover:shadow-md mb-4 break-inside-avoid"
  >
    <div
      class="bg-secondary/10 px-4 py-3 flex items-center justify-between border-b border-secondary/20"
      :class="sourceColorClass"
    >
      <div class="flex items-center gap-3 overflow-hidden">
        <div
          class="p-2 rounded-lg bg-background border border-secondary/20 text-primary font-bold shadow-sm shrink-0"
        >
          <!-- nanti ini diubah menjadi logo marketplace -->
          <font-awesome-icon icon="fa-solid fa-file-invoice" />
        </div>

        <div class="min-w-0 flex flex-col">
          <h3 class="font-bold tracking-tight truncate text-text text-sm" :title="inv.invoice">
            {{ inv.invoice }}
          </h3>

          <div
            v-if="formattedOrderDate"
            class="text-[10px] text-text/60 flex items-center gap-1 mt-0.5"
            title="Waktu Pemesanan"
          >
            <font-awesome-icon icon="fa-solid fa-clock" />
            <span>{{ formattedOrderDate }}</span>
          </div>
          <div
            v-else-if="formattedCreatedAt"
            class="text-[10px] text-text/40 italic mt-0.5"
            title="Waktu Upload"
          >
            Uploaded: {{ formattedCreatedAt }}
          </div>
          <div v-else class="text-[10px] text-text/30 italic mt-0.5">No Date</div>
        </div>
      </div>

      <div class="flex flex-col items-end gap-1">
        <div class="flex items-center gap-1">
          <span
            class="text-[10px] font-bold px-2 py-1 rounded border border-secondary/30 bg-background shrink-0 uppercase tracking-wide"
          >
            <!-- ini nanti dihilangkan -->
            {{ inv.source }}
          </span>

          <span
            v-if="inv.mp_status && inv.mp_status !== 'NEW'"
            class="text-[9px] font-bold px-1.5 py-0.5 rounded shadow-sm flex items-center gap-1"
            :class="getMpStatusBadge(inv.mp_status)?.class"
          >
            <font-awesome-icon :icon="`fa-solid ${getMpStatusBadge(inv.mp_status)?.icon}`" />
            {{ getMpStatusBadge(inv.mp_status)?.label }}
          </span>
        </div>

        <button
          v-if="mode === 'picking' && hasStockIssue"
          @click.stop="onCancelInvoice"
          class="text-[10px] font-bold text-danger hover:text-danger/80 hover:underline flex items-center gap-1 mt-1 transition-colors animate-pulse"
          title="Stok bermasalah. Klik untuk membatalkan pesanan ini."
        >
          <font-awesome-icon icon="fa-solid fa-trash" /> Batalkan
        </button>
      </div>
    </div>

    <div
      v-if="mode === 'history' && historyLogs && historyLogs.length > 0"
      class="bg-secondary/5 border-b border-secondary/10 px-4 py-2"
    >
      <button
        @click="showHistory = !showHistory"
        class="text-[10px] font-bold text-text/50 hover:text-primary flex items-center gap-1 w-full transition-colors focus:outline-none"
      >
        <font-awesome-icon
          :icon="showHistory ? 'fa-solid fa-chevron-up' : 'fa-solid fa-chevron-down'"
        />
        {{ showHistory ? 'Sembunyikan' : 'Lihat' }} {{ historyLogs.length }} Revisi Sebelumnya
      </button>

      <div
        v-if="showHistory"
        class="mt-2 space-y-1 pl-2 border-l-2 border-secondary/20 animate-fade-in"
      >
        <div
          v-for="log in historyLogs"
          :key="log.id"
          class="text-[10px] text-text/60 flex justify-between items-center"
        >
          <span class="flex items-center gap-1">
            <span
              :class="getStatusBadge(log.status).class"
              class="px-1.5 py-0.5 rounded text-[9px]"
              >{{ getStatusBadge(log.status).label }}</span
            >
            {{ formatDate(log.created_at, true, false) }}
          </span>
          <span class="italic text-text/30 text-[9px]">#{{ log.id }}</span>
        </div>
      </div>
    </div>

    <div class="divide-y divide-secondary/10 flex-1 flex flex-col">
      <div v-for="(items, locName) in inv.locations" :key="locName" class="flex-1">
        <div class="bg-primary/5 px-4 py-2 flex items-center gap-3">
          <input
            v-if="mode === 'picking'"
            type="checkbox"
            @change="onToggleLocation(items, $event)"
            :disabled="locName === 'Unknown Loc' || locName === null"
            class="h-4 w-4 rounded border-secondary/50 text-primary focus:ring-offset-background bg-background disabled:opacity-50 disabled:cursor-not-allowed"
          />

          <div
            v-if="locName === 'Unknown Loc' || locName === null"
            class="flex items-center gap-2 text-danger overflow-hidden"
          >
            <font-awesome-icon icon="fa-solid fa-triangle-exclamation" />
            <span class="text-sm font-bold truncate">Stok Kosong</span>
          </div>
          <div v-else class="flex items-center gap-2 text-primary overflow-hidden">
            <font-awesome-icon icon="fa-solid fa-location-dot" class="text-xs" />
            <span class="text-sm font-bold truncate">{{ locName }}</span>
          </div>
          <span class="text-xs text-text/40 ml-auto shrink-0">{{ items.length }} item</span>
        </div>

        <div class="w-full">
          <table class="w-full text-left text-sm table-fixed">
            <tbody class="divide-y divide-secondary/10">
              <tr
                v-for="item in items"
                :key="item.id"
                @click="
                  mode === 'picking' &&
                  !isItemDisabled(item) &&
                  onToggleItem(item.id, item.location_code)
                "
                class="group transition-colors"
                :class="[
                  mode === 'picking' && isItemDisabled(item)
                    ? 'opacity-60 bg-secondary/5 cursor-not-allowed'
                    : '',
                  mode === 'picking' && !isItemDisabled(item)
                    ? 'cursor-pointer hover:bg-primary/5'
                    : '',
                ]"
              >
                <td class="pl-4 py-3 w-10 align-top pt-3.5" @click.stop>
                  <input
                    v-if="mode === 'picking'"
                    type="checkbox"
                    :checked="selectedItems.has(item.id)"
                    @change="onToggleItem(item.id, item.location_code)"
                    :disabled="isItemDisabled(item)"
                    class="h-4 w-4 rounded border-secondary/50 text-primary focus:ring-offset-background bg-background cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                  />
                  <div v-else class="mt-1">
                    <font-awesome-icon
                      :icon="`fa-solid ${getStatusBadge(item.status).icon}`"
                      :class="getStatusBadge(item.status).class.split(' ')[0]"
                    />
                  </div>
                </td>
                <td class="px-2 py-3 align-top">
                  <div
                    class="font-bold text-sm text-text leading-tight mb-1 transition-colors group-hover:text-primary"
                  >
                    {{ item.sku }}
                  </div>
                  <div class="text-xs text-text/70 whitespace-normal break-words leading-snug">
                    {{ item.product_name }}
                  </div>

                  <div v-if="mode === 'picking'">
                    <div
                      v-if="isItemDisabled(item) && item.location_code"
                      class="text-[10px] text-warning font-bold mt-2 italic flex items-center gap-1"
                    >
                      <font-awesome-icon icon="fa-solid fa-ban" /> Sisa Stok:
                      {{ item.available_stock }}
                    </div>
                    <div
                      v-if="!item.location_code"
                      class="text-[10px] text-danger font-bold mt-2 italic flex items-center gap-1"
                    >
                      <font-awesome-icon icon="fa-solid fa-circle-xmark" /> Stok kosong
                    </div>
                  </div>
                  <div v-if="mode === 'history'" class="mt-2">
                    <span
                      class="text-[10px] font-bold px-2 py-0.5 rounded border inline-flex items-center gap-1"
                      :class="getStatusBadge(item.status).class"
                    >
                      {{ getStatusBadge(item.status).label }}
                    </span>
                  </div>
                </td>
                <td class="px-4 py-3 text-right align-top w-20 shrink-0">
                  <div class="flex flex-col items-end">
                    <span
                      class="text-lg font-black text-text"
                      :class="{ 'text-text/40': isItemDisabled(item) }"
                      >{{ item.quantity }}</span
                    >
                    <span class="text-[10px] text-text/50 uppercase font-bold">pcs</span>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.animate-fade-in {
  animation: fadeIn 0.3s ease-out forwards;
}
@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(-5px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
</style>
