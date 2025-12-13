<!-- frontend\src\components\picking\PickingListCard.vue -->
<script setup>
import { computed, ref } from 'vue'
import { formatDate } from '@/api/helpers/time.js'
import { useAuthStore } from '@/stores/auth'
import logoTokopedia from '@/assets/img/tokopedia.svg'
import logoShopee from '@/assets/img/shopee.svg'

const props = defineProps({
  inv: { type: Object, required: true },
  selectedItems: { type: Set, default: () => new Set() },
  validateStock: { type: Function, default: () => true },
  mode: { type: String, default: 'picking' }, // 'picking' | 'history'
  historyLogs: { type: Array, default: () => [] },
})

const authStore = useAuthStore()
const emit = defineEmits(['toggle-item', 'toggle-location', 'cancel-invoice'])

const isOpen = ref(false)
const isLoading = ref(false)

// --- COMPUTED HELPERS ---
const totalSKU = computed(() => {
  if (props.mode === 'history' && props.inv.items) {
    return props.inv.items.length
  }
  let count = 0
  if (props.inv.locations) {
    Object.values(props.inv.locations).forEach((items) => {
      count += items.length
    })
  }
  return count
})

const sourceBgClass = computed(() => {
  switch (props.inv.source) {
    case 'Tokopedia':
      return 'bg-success'
    case 'Shopee':
      return 'bg-warning'
    case 'Offline':
      return 'bg-primary'
    default:
      return 'bg-danger'
  }
})

const hasStockIssue = computed(() => {
  if (props.mode === 'history' || !props.inv.locations) return false
  for (const locName in props.inv.locations) {
    for (const item of props.inv.locations[locName]) {
      if (!item.location_code || Number(item.available_stock || 0) < Number(item.quantity || 0))
        return true
    }
  }
  return false
})

const canCancel = computed(() => {
  return (
    props.mode === 'picking' && hasStockIssue.value && authStore.hasPermission('picking.cancel')
  )
})

// --- ACTIONS ---

function onToggleItem(id, locationCode) {
  if (props.mode === 'history') return
  if (locationCode) emit('toggle-item', id)
}

function onToggleLocation(items, event) {
  emit('toggle-location', { items, checked: event.target.checked })
}

async function onCancelInvoice() {
  if (!confirm(`Batalkan pesanan ${props.inv.invoice}?`)) return

  try {
    isLoading.value = true
    emit('cancel-invoice', props.inv.id)
  } catch (error) {
    console.error(error)
  } finally {
    // Reset loading state jika parent tidak menghancurkan komponen ini
    setTimeout(() => {
      isLoading.value = false
    }, 500)
  }
}

function isItemDisabled(item) {
  if (props.mode === 'history') return false
  if (!item.location_code) return true
  if (!props.selectedItems.has(item.id) && !props.validateStock(item)) return true
  return false
}

// --- STATUS BADGES ---

function getMpStatusBadge(status) {
  const map = {
    SHIPPED: { class: 'bg-primary/50 text-text', label: 'Dikirim', icon: 'fa-truck-fast' },
    COMPLETED: { class: 'bg-success/50 text-text', label: 'Selesai', icon: 'fa-check-double' },
    NEW: { class: 'bg-accent/50 text-text', label: 'Baru', icon: 'fa-star' },
    CANCELLED: { class: 'bg-danger/50 text-text', label: 'Batal', icon: 'fa-ban' },
    RETURNED: { class: 'bg-warning/50 text-text', label: 'Retur', icon: 'fa-rotate-left' },
  }
  return (
    map[status] || { class: 'bg-secondary text-background', label: status || '-', icon: 'fa-info' }
  )
}

function getStatusBadge(status) {
  const map = {
    COMPLETED: {
      class: 'text-success bg-success/10 border-success/20',
      label: 'Selesai',
      icon: 'fa-check',
    },
    RETURNED: {
      class: 'text-danger bg-danger/10 border-danger/20',
      label: 'Retur',
      icon: 'fa-rotate-left',
    },
    SHIPPED: {
      class: 'text-primary bg-primary/10 border-primary/20',
      label: 'Dikirim',
      icon: 'fa-truck',
    },
    CANCEL: {
      class: 'text-secondary bg-secondary/10 border-secondary/20',
      label: 'Batal',
      icon: 'fa-ban',
    },
    CANCELLED: {
      class: 'text-secondary bg-secondary/10 border-secondary/20',
      label: 'Batal',
      icon: 'fa-ban',
    },
  }
  return (
    map[status] || {
      class: 'text-secondary bg-secondary/10 border-secondary/20',
      label: status || '-',
      icon: 'fa-info',
    }
  )
}
</script>

<template>
  <div
    class="bg-background border border-secondary rounded-xl overflow-hidden hover:border-primary/50 transition-all duration-300 flex flex-col shadow-sm hover:shadow-md mb-4 break-inside-avoid group"
  >
    <div
      class="px-4 py-3 flex items-start justify-between border-b bg-secondary/25 relative"
      :class="[mode === 'history' ? 'cursor-pointer' : '']"
      @click="mode === 'history' ? (isOpen = !isOpen) : null"
    >
      <div class="absolute left-0 top-0 bottom-0 w-1" :class="sourceBgClass"></div>

      <div class="flex items-start gap-3 pl-2 min-w-0">
        <div
          class="p-1 rounded-lg bg-white border border-secondary/10 shadow-sm shrink-0 h-9 w-9 flex items-center justify-center overflow-hidden"
        >
          <img
            v-if="inv.source === 'Tokopedia'"
            :src="logoTokopedia"
            alt="Tokopedia"
            class="w-full h-full object-contain p-0.5"
          />
          <img
            v-else-if="inv.source === 'Shopee'"
            :src="logoShopee"
            alt="Shopee"
            class="w-full h-full object-contain p-0.5"
          />
          <font-awesome-icon v-else icon="fa-solid fa-file-invoice" class="text-primary text-lg" />
        </div>

        <div class="min-w-0 flex flex-col">
          <div class="flex items-center gap-2 mb-0.5">
            <h3
              class="font-bold tracking-tight truncate text-text text-sm hover:text-primary transition-colors"
              :title="inv.invoice"
            >
              {{ inv.invoice }}
            </h3>
          </div>

          <div class="text-[10px] text-text/60 flex flex-col gap-0.5">
            <span class="truncate max-w-[200px]" v-if="inv.customer_name">
              <font-awesome-icon icon="fa-solid fa-user" class="mr-1 opacity-50" />
              {{ inv.customer_name }}
            </span>
            <span class="flex items-center gap-1">
              <font-awesome-icon icon="fa-solid fa-clock" class="opacity-50" />
              {{ formatDate(inv.order_date || inv.created_at, true, true) }}
            </span>
          </div>
        </div>
      </div>

      <div class="flex flex-col items-end gap-1.5 shrink-0 pl-2">
        <div class="text-right">
          <span class="text-lg font-black text-text leading-none block">{{ totalSKU }}</span>
          <span class="text-[9px] text-text/40 uppercase font-bold">SKU</span>
        </div>

        <span
          v-if="inv.marketplace_status && inv.marketplace_status !== 'NEW'"
          class="text-[9px] font-bold px-2 py-0.5 rounded-full shadow-sm flex items-center gap-1"
          :class="getMpStatusBadge(inv.marketplace_status)?.class"
        >
          <font-awesome-icon :icon="`fa-solid ${getMpStatusBadge(inv.marketplace_status)?.icon}`" />
          {{ getMpStatusBadge(inv.marketplace_status)?.label }}
        </span>

        <button
          v-if="canCancel"
          @click.stop="onCancelInvoice"
          :disabled="isLoading"
          class="group flex items-center gap-1 rounded border border-danger bg-danger/10 px-2 py-1 text-[10px] font-bold text-danger/50 transition-colors hover:text-danger disabled:opacity-50"
          title="Batalkan Item Ini"
        >
          <font-awesome-icon
            :icon="isLoading ? 'fa-solid fa-spinner' : 'fa-solid fa-trash'"
            :spin="isLoading"
          />
          <span>Batalkan</span>
        </button>

        <font-awesome-icon
          v-if="mode === 'history'"
          icon="fa-solid fa-chevron-down"
          class="text-text/30 transition-transform duration-300 mt-1"
          :class="{ 'rotate-180': isOpen }"
        />
      </div>
    </div>

    <div v-if="mode === 'picking'" class="divide-y divide-secondary/10">
      <div v-for="(items, locName) in inv.locations" :key="locName">
        <div class="bg-secondary/5 px-4 py-1.5 flex items-center justify-between">
          <div class="flex items-center gap-3">
            <input
              type="checkbox"
              @change="onToggleLocation(items, $event)"
              :disabled="!locName || locName === 'Unknown Loc'"
              class="h-3.5 w-3.5 rounded border-secondary/40 text-primary cursor-pointer disabled:opacity-50"
            />
            <span
              class="text-xs font-bold flex items-center gap-1.5"
              :class="!locName || locName === 'Unknown Loc' ? 'text-danger' : 'text-primary'"
            >
              <font-awesome-icon
                :icon="
                  !locName || locName === 'Unknown Loc'
                    ? 'fa-solid fa-triangle-exclamation'
                    : 'fa-solid fa-location-dot'
                "
              />
              {{ locName || 'Stok Kosong / Tidak Diketahui' }}
            </span>
          </div>
        </div>

        <table class="w-full text-left text-sm">
          <tbody class="divide-y divide-secondary/5">
            <tr
              v-for="item in items"
              :key="item.id"
              @click="!isItemDisabled(item) && onToggleItem(item.id, item.location_code)"
              class="group transition-colors"
              :class="
                isItemDisabled(item)
                  ? 'opacity-60 bg-danger/10 cursor-not-allowed'
                  : 'cursor-pointer hover:bg-primary/5'
              "
            >
              <td class="pl-4 py-2 w-8 align-top pt-3">
                <input
                  type="checkbox"
                  :checked="selectedItems.has(item.id)"
                  :disabled="isItemDisabled(item)"
                  class="h-3.5 w-3.5 rounded border-secondary/40 text-primary cursor-pointer disabled:opacity-50"
                />
              </td>
              <td class="px-2 py-2">
                <div class="font-bold text-xs text-text mb-0.5">{{ item.sku }}</div>
                <div class="text-[10px] text-text/60 leading-tight line-clamp-2">
                  {{ item.product_name }}
                </div>
                <div
                  v-if="isItemDisabled(item) && item.location_code"
                  class="text-[9px] text-accent font-bold mt-1 flex items-center gap-1"
                >
                  <font-awesome-icon icon="fa-solid fa-triangle-exclamation" />
                  Stok Rak Cuma: {{ item.available_stock }}
                </div>
              </td>
              <td class="px-4 py-2 text-right align-top w-16">
                <span class="font-bold text-sm text-text">{{ item.quantity }}</span>
                <span class="text-[9px] text-text/40 ml-0.5">x</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <transition
      enter-active-class="transition-[max-height] duration-300 ease-in-out overflow-hidden"
      enter-from-class="max-h-0"
      enter-to-class="max-h-[500px]"
      leave-active-class="transition-[max-height] duration-300 ease-in-out overflow-hidden"
      leave-from-class="max-h-[500px]"
      leave-to-class="max-h-0"
    >
      <div
        v-if="mode === 'history' && isOpen"
        class="bg-secondary border-t border-secondary/10 p-3"
      >
        <div class="space-y-2 mb-4">
          <div
            v-for="(item, idx) in inv.items"
            :key="idx"
            class="flex justify-between items-start text-xs border-b border-dashed border-secondary/10 last:border-0 pb-1.5 last:pb-0"
          >
            <div class="flex-1 pr-2">
              <div class="font-bold text-text/80">{{ item.sku }}</div>
              <div class="text-[10px] text-text/50 truncate">{{ item.product_name || '-' }}</div>
            </div>
            <div class="text-right shrink-0">
              <span class="font-bold bg-background px-1.5 py-0.5 rounded border border-secondary/10"
                >{{ item.quantity }} pcs</span
              >
              <div class="mt-1">
                <span
                  class="text-[9px] px-1.5 py-0.5 rounded border flex items-center gap-1 w-fit ml-auto"
                  :class="getStatusBadge(item.item_status).class"
                >
                  <font-awesome-icon :icon="`fa-solid ${getStatusBadge(item.item_status).icon}`" />
                  {{ getStatusBadge(item.item_status).label }}
                </span>
              </div>
            </div>
          </div>
        </div>

        <div v-if="historyLogs && historyLogs.length > 0" class="pt-3 border-t border-secondary/20">
          <p class="text-[10px] font-bold text-text/40 uppercase mb-2">Riwayat Revisi:</p>
          <div class="space-y-1">
            <div
              v-for="log in historyLogs"
              :key="log.id"
              class="flex justify-between text-[10px] text-text/50 bg-secondary/50 p-1.5 rounded"
            >
              <span>Versi Lama #{{ log.id }}</span>
              <span class="line-through opacity-70">{{ log.status }}</span>
              <span>{{ formatDate(log.created_at, true, false) }}</span>
            </div>
          </div>
        </div>
      </div>
    </transition>
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
