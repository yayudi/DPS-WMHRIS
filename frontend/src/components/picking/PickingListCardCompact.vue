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
const emit = defineEmits(['toggle-invoice', 'cancel-invoice'])

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

const isInvoiceSelected = computed(() => {
  let validItems = []
  if (props.inv.locations) {
    Object.values(props.inv.locations).forEach((items) => {
      items.forEach((i) => {
        if (i.location_code && props.validateStock(i)) {
          validItems.push(i.id)
        }
      })
    })
  }

  if (validItems.length === 0) return false
  return validItems.every((id) => props.selectedItems.has(id))
})

const canCancel = computed(() => {
  return (
    props.mode === 'picking' && hasStockIssue.value && authStore.hasPermission('picking.cancel')
  )
})

// --- ACTIONS ---
function onToggleInvoice(event) {
  emit('toggle-invoice', { inv: props.inv, checked: event.target.checked })
}

async function onCancelInvoice() {
  if (!confirm(`Batalkan pesanan ${props.inv.invoice}?`)) return
  try {
    isLoading.value = true
    emit('cancel-invoice', props.inv.id)
  } catch (error) {
    console.error(error)
  } finally {
    setTimeout(() => {
      isLoading.value = false
    }, 500)
  }
}

function isItemInvalid(item) {
  if (props.mode === 'history') return false
  if (!item.location_code) return true
  return !props.validateStock({ ...item, quantity: Number(item.quantity) })
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
</script>

<template>
  <div
    class="bg-background border rounded-lg overflow-hidden transition-all duration-300 flex flex-col shadow-sm break-inside-avoid group relative"
    :class="[
      isInvoiceSelected
        ? 'border-primary ring-1 ring-primary/30 shadow-md'
        : 'border-secondary hover:border-primary/50 hover:shadow-sm',
    ]"
  >
    <!-- HEADER CARD COMPACT -->
    <div
      class="px-2 py-2 flex items-start justify-between border-b bg-secondary/35 relative"
      :class="[mode === 'history' ? 'cursor-pointer' : '']"
      @click="mode === 'history' ? (isOpen = !isOpen) : null"
    >
      <div class="absolute left-0 top-0 bottom-0 w-1" :class="sourceBgClass"></div>

      <div class="flex items-center gap-2 pl-2 min-w-0 flex-1">
        <!-- MAIN CHECKBOX -->
        <div v-if="mode === 'picking'" class="pt-0.5">
          <input
            type="checkbox"
            :checked="isInvoiceSelected"
            @change="onToggleInvoice"
            class="w-4 h-4 rounded border-secondary/40 text-primary cursor-pointer accent-primary transition-all hover:scale-110"
          />
        </div>

        <!-- LOGO -->
        <div
          class="p-0.5 rounded bg-background border border-secondary/10 shadow-sm shrink-0 h-6 w-6 flex items-center justify-center overflow-hidden"
        >
          <img
            v-if="inv.source === 'Tokopedia'"
            :src="logoTokopedia"
            class="w-full h-full object-contain p-0.5"
          />
          <img
            v-else-if="inv.source === 'Shopee'"
            :src="logoShopee"
            class="w-full h-full object-contain p-0.5"
          />
          <font-awesome-icon v-else icon="fa-solid fa-file-invoice" class="text-primary text-xs" />
        </div>

        <div class="min-w-0 flex flex-col">
          <div class="flex items-center gap-2">
            <h3
              class="font-bold tracking-tight truncate text-text text-xs hover:text-primary transition-colors cursor-text select-text leading-tight"
              :title="inv.invoice"
            >
              {{ inv.invoice }}
            </h3>
            <!-- Compact Status Badge -->
            <span
              v-if="inv.marketplace_status && inv.marketplace_status !== 'NEW'"
              class="text-[9px] font-bold px-1.5 py-0 rounded shadow-sm flex items-center gap-0.5"
              :class="getMpStatusBadge(inv.marketplace_status)?.class"
            >
              {{ getMpStatusBadge(inv.marketplace_status)?.label }}
            </span>
          </div>

          <div class="text-[9px] text-text/60 flex items-center gap-2 leading-none mt-0.5">
            <span class="truncate max-w-[100px]" v-if="inv.customer_name">
              {{ inv.customer_name }}
            </span>
            <span class="w-px h-2 bg-text/20" v-if="inv.customer_name"></span>
            <span>
              {{ formatDate(inv.order_date || inv.created_at, true, true) }}
            </span>
          </div>
        </div>
      </div>

      <div class="flex items-center gap-2 shrink-0 pl-1">
        <div class="text-right leading-none">
          <span class="text-sm font-black text-text">{{ totalSKU }}</span>
          <span class="text-[9px] text-text/40 uppercase font-bold ml-0.5">SKU</span>
        </div>

        <button
          v-if="canCancel"
          @click.stop="onCancelInvoice"
          :disabled="isLoading"
          class="group flex items-center justify-center rounded border border-danger bg-danger/10 w-6 h-6 text-danger/50 transition-colors hover:text-danger disabled:opacity-50"
          title="Batalkan Item Ini"
        >
          <font-awesome-icon
            :icon="isLoading ? 'fa-solid fa-spinner' : 'fa-solid fa-trash'"
            :spin="isLoading"
            class="text-xs"
          />
        </button>

        <font-awesome-icon
          v-if="mode === 'history'"
          icon="fa-solid fa-chevron-down"
          class="text-text/30 transition-transform duration-300 text-xs"
          :class="{ 'rotate-180': isOpen }"
        />
      </div>
    </div>

    <!-- ITEM LIST COMPACT (PICKING MODE) -->
    <div v-if="mode === 'picking'" class="divide-y divide-secondary/10 relative text-xs">
      <div
        v-if="isInvoiceSelected"
        class="absolute inset-0 bg-primary/5 pointer-events-none z-0"
      ></div>

      <div v-for="(items, locName) in inv.locations" :key="locName" class="relative z-10">
        <!-- Location Header Compact -->
        <div
          class="bg-secondary/50 px-3 py-1 flex items-center justify-between border-b border-secondary/5"
        >
          <div class="flex items-center gap-1.5">
            <font-awesome-icon
              :icon="
                !locName || locName === 'Unknown Loc'
                  ? 'fa-solid fa-triangle-exclamation'
                  : 'fa-solid fa-location-dot'
              "
              class="text-[10px]"
              :class="!locName || locName === 'Unknown Loc' ? 'text-danger' : 'text-primary'"
            />
            <span
              class="text-[10px] font-bold"
              :class="!locName || locName === 'Unknown Loc' ? 'text-danger' : 'text-primary'"
            >
              {{ locName || 'Stok Kosong' }}
            </span>
          </div>
        </div>

        <!-- Item Rows Compact -->
        <table class="w-full text-left">
          <tbody class="divide-y divide-secondary/5">
            <tr
              v-for="item in items"
              :key="item.id"
              class="transition-colors group/item"
              :class="isItemInvalid(item) ? 'bg-danger/5' : ''"
            >
              <td class="pl-3 py-1.5 align-top">
                <div class="flex flex-col">
                  <div class="font-bold text-text mb-0.5 flex items-center gap-1.5 leading-none">
                    {{ item.sku }}
                    <span
                      v-if="isInvoiceSelected && !isItemInvalid(item)"
                      class="text-primary text-[9px]"
                    >
                      <font-awesome-icon icon="fa-solid fa-check-circle" />
                    </span>
                  </div>
                  <div
                    class="text-[9px] text-text/60 leading-tight line-clamp-1 group-hover/item:line-clamp-none transition-all"
                  >
                    {{ item.product_name }}
                  </div>

                  <!-- Warning Stok Compact -->
                  <div
                    v-if="isItemInvalid(item) && item.location_code"
                    class="text-[9px] text-danger font-bold mt-0.5 flex items-center gap-1"
                  >
                    <font-awesome-icon icon="fa-solid fa-triangle-exclamation" class="text-[8px]" />
                    Kurang: {{ item.available_stock }} / {{ item.quantity }}
                  </div>
                  <div
                    v-else-if="!item.location_code"
                    class="text-[9px] text-danger font-bold mt-0.5"
                  >
                    Lokasi tidak ditemukan
                  </div>
                </div>
              </td>
              <td class="px-3 py-1.5 text-right align-top w-12">
                <span class="font-bold" :class="isItemInvalid(item) ? 'text-danger' : 'text-text'">
                  {{ item.quantity }}
                </span>
                <span class="text-[8px] text-text/40 ml-0.5">pcs</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>
