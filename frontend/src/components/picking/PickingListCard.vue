<!-- frontend\src\components\picking\PickingListCard.vue -->
<script setup>
import { swalConfirm } from '@/composables/useSweetAlert'
import { computed, ref } from 'vue'
import { formatDate } from '@/api/helpers/time.js'
import { useAuthStore } from '@/stores/auth'
import logoTokopedia from '@/assets/img/tokopedia.svg'
import logoShopee from '@/assets/img/shopee.svg'
import { usePickingCardState } from '@/composables/usePickingCardState'

const props = defineProps({
  inv: { type: Object, required: true },
  selectedItems: { type: Set, default: () => new Set() },
  validateStock: { type: Function, default: () => true },
  mode: { type: String, default: 'picking' }, // 'picking' | 'history'
  historyLogs: { type: Array, default: () => [] }
})

const authStore = useAuthStore()
const emit = defineEmits(['toggle-invoice', 'void-invoice', 'retry-backorder'])

const isOpen = ref(false)
const isLoading = ref(false)

const {
  totalSKU,
  hasStockIssue,
  isInvoiceSelected,
  canCancel,
  hasInsufficientStock,
  isItemAllowed,
  getMpStatusBadge,
  getStatusBadge
} = usePickingCardState(props, authStore)

// --- ACTIONS ---
async function onToggleInvoice(event) {
  let checked = !isInvoiceSelected.value
  if (event && event.target && event.target.type === 'checkbox') {
    checked = event.target.checked
  }
  emit('toggle-invoice', { inv: props.inv, checked })
}
async function onVoidInvoice() {
  const msg = `Void pesanan ${props.inv.original_invoice_id}?\nSemua status item (termasuk yang berhasil di-pick) akan dikembalikan ke stok.`
  if (!(await swalConfirm(msg))) return
  try {
    isLoading.value = true
    emit('void-invoice', props.inv.id)
  } catch (error) {
    console.error(error)
  } finally {
    setTimeout(() => {
      isLoading.value = false
    }, 500)
  }
}
async function onRetryBackorder() {
  isLoading.value = true
  try {
    emit('retry-backorder', props.inv.id)
  } finally {
    setTimeout(() => {
      isLoading.value = false
    }, 500)
  }
}

const sourceBgClass = computed(() => {
  const source = props.inv.source?.toLowerCase()
  if (source === 'tokopedia') return 'bg-success'
  if (source === 'shopee') return 'bg-warning'
  return 'bg-secondary'
})
</script>

<template>
  <div
    class="bg-background border rounded-xl overflow-hidden transition-all duration-300 flex flex-col shadow-md mb-4 break-inside-avoid group"
    :class="[
      isInvoiceSelected
        ? 'border-primary ring-1 ring-primary/30 shadow-md'
        : 'border-secondary hover:border-primary/50 hover:shadow-md'
    ]"
  >
    <!-- HEADER CARD (STANDARD SIZE) -->
    <div
      class="px-3 py-3 flex items-start justify-between border-b bg-secondary/35 relative cursor-pointer"
      @click="mode === 'history' ? (isOpen = !isOpen) : onToggleInvoice()"
    >
      <div class="absolute left-0 top-0 bottom-0 w-1" :class="sourceBgClass"></div>

      <div class="flex items-start gap-3 pl-2 min-w-0 flex-1">
        <!-- MAIN CHECKBOX -->
        <div
          v-if="mode === 'picking'"
          class="pt-1"
          :title="
            hasStockIssue ? 'Ada masalah stok (Backorder/Stok Kurang). Backend akan mencari lokasi baru otomatis.' : ''
          "
        >
          <input
            type="checkbox"
            :checked="isInvoiceSelected"
            @click.stop
            @change="onToggleInvoice($event)"
            class="w-5 h-5 rounded border-secondary/40 text-primary cursor-pointer accent-primary transition-all hover:scale-110"
          />
        </div>

        <!-- LOGO -->
        <div
          class="p-1 rounded-lg bg-white border border-secondary/10 shadow-sm shrink-0 h-9 w-9 flex items-center justify-center overflow-hidden"
        >
          <img v-if="inv.source === 'Tokopedia'" :src="logoTokopedia" class="w-full h-full object-contain p-0.5" />
          <img v-else-if="inv.source === 'Shopee'" :src="logoShopee" class="w-full h-full object-contain p-0.5" />
          <font-awesome-icon v-else icon="fa-solid fa-file-invoice" class="text-primary text-lg" />
        </div>

        <div class="min-w-0 flex flex-col">
          <div class="flex items-center gap-2 mb-0.5">
            <h3
              class="font-bold tracking-tight truncate text-text text-sm hover:text-primary transition-colors cursor-text select-text"
              :title="inv.invoice"
            >
              {{ inv.invoice }}
            </h3>
          </div>

          <div class="text-[10px] text-text/60 flex flex-col gap-0.5">
            <span class="truncate max-w-[150px] md:max-w-[200px]" v-if="inv.customer_name">
              <font-awesome-icon icon="fa-solid fa-user" class="mr-1 opacity-50" />
              {{ inv.customer_name }}
            </span>
            <span class="flex items-center gap-1">
              <font-awesome-icon icon="fa-solid fa-business-time" class="opacity-50" />
              {{ formatDate(inv.order_date, true, true) }}
            </span>
            <span class="flex items-center gap-1">
              <font-awesome-icon icon="fa-solid fa-clock" class="opacity-50" />
              {{ formatDate(inv.created_at, true, true) }}
            </span>

            <span class="text-[11px] text-text/60 flex items-center gap-1">
              <font-awesome-icon icon="fa-solid fa-store" class="opacity-50" />
              {{ inv.shop_name || '-' }}
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
          v-if="inv.location_purpose === 'BRANCH'"
          class="text-[9px] font-bold px-2 py-0.5 rounded-full shadow-sm bg-accent/20 text-accent/80 flex items-center gap-1 border border-accent/20"
        >
          <font-awesome-icon icon="fa-solid fa-code-branch" />
          Cabang
        </span>

        <span
          v-if="inv.marketplace_status && inv.marketplace_status !== 'NEW'"
          class="text-[9px] font-bold px-2 py-0.5 rounded-full shadow-sm flex items-center gap-1"
          :class="getMpStatusBadge(inv.marketplace_status)?.class"
        >
          <font-awesome-icon :icon="`fa-solid ${getMpStatusBadge(inv.marketplace_status)?.icon}`" />
          {{ getMpStatusBadge(inv.marketplace_status)?.label }}
        </span>

        <div class="flex items-center gap-1 mt-0.5">
          <button
            v-if="mode === 'picking' && hasStockIssue"
            @click.stop="onRetryBackorder"
            :disabled="isLoading"
            class="group flex items-center gap-1 rounded border border-warning bg-warning/10 px-2 py-1 text-[10px] font-bold text-warning/70 transition-colors hover:text-warning disabled:opacity-50"
            title="Cek ulang stok (Targeted Refresh)"
          >
            <font-awesome-icon
              :icon="isLoading ? 'fa-solid fa-spinner' : 'fa-solid fa-rotate-right'"
              :spin="isLoading"
            />
            <span>Cek Stok</span>
          </button>

          <button
            v-if="canCancel && inv.status !== 'VOID'"
            @click.stop="onVoidInvoice"
            :disabled="isLoading"
            class="group flex items-center gap-1 rounded border border-danger bg-danger/10 px-2 py-1 text-[10px] font-bold text-danger/50 transition-colors hover:text-danger disabled:opacity-50"
            title="Void"
          >
            <font-awesome-icon :icon="isLoading ? 'fa-solid fa-spinner' : 'fa-solid fa-ban'" :spin="isLoading" />
            <span>Void</span>
          </button>
        </div>

        <font-awesome-icon
          v-if="mode === 'history'"
          icon="fa-solid fa-chevron-down"
          class="text-text/30 transition-transform duration-300 mt-1"
          :class="{ 'rotate-180': isOpen }"
        />
      </div>
    </div>

    <!-- ITEM LIST (PICKING MODE) -->
    <div v-if="mode === 'picking'" class="divide-y divide-secondary/10 relative">
      <div v-if="isInvoiceSelected" class="absolute inset-0 bg-primary/5 pointer-events-none z-0"></div>

      <div v-for="(items, locName) in inv.locations" :key="locName" class="relative z-10">
        <!-- Location Header -->
        <div class="bg-secondary/50 px-4 py-1.5 flex items-center justify-between border-b border-secondary/5">
          <div class="flex items-center gap-2">
            <font-awesome-icon
              :icon="
                !locName || locName === 'Unknown Loc' ? 'fa-solid fa-triangle-exclamation' : 'fa-solid fa-location-dot'
              "
              class="text-xs"
              :class="!locName || locName === 'Unknown Loc' ? 'text-danger' : 'text-primary'"
            />
            <span
              class="text-xs font-bold"
              :class="!locName || locName === 'Unknown Loc' ? 'text-danger' : 'text-primary'"
            >
              {{ locName || 'Stok Kosong / Tidak Diketahui' }}
            </span>
          </div>
        </div>

        <!-- Item Rows -->
        <table class="w-full text-left text-sm">
          <tbody class="divide-y divide-secondary/5">
            <tr
              v-for="item in items"
              :key="item.id"
              class="transition-colors"
              :class="hasInsufficientStock(item) ? 'bg-danger/5' : ''"
            >
              <td class="pl-4 py-2">
                <div class="font-bold text-xs text-text mb-0.5 flex items-center gap-2">
                  {{ item.sku }}
                  <span v-if="isInvoiceSelected && isItemAllowed(item)" class="text-primary text-[10px]">
                    <font-awesome-icon icon="fa-solid fa-check-circle" />
                  </span>
                </div>
                <div class="text-[10px] text-text/60 leading-tight line-clamp-2">
                  {{ item.product_name }}
                </div>
                <div
                  v-if="hasInsufficientStock(item) && item.location_code"
                  class="text-[9px] text-danger font-bold mt-1 flex items-center gap-1"
                >
                  <font-awesome-icon icon="fa-solid fa-triangle-exclamation" />
                  Stok Kurang: {{ item.available_stock }} (Butuh {{ item.quantity }})
                </div>
                <div v-else-if="!item.location_code" class="text-[9px] text-danger font-bold mt-1">
                  Lokasi tidak ditemukan
                </div>
              </td>
              <td class="px-4 py-2 text-right align-top w-16">
                <span class="font-bold text-sm" :class="hasInsufficientStock(item) ? 'text-danger' : 'text-text'">
                  {{ item.quantity }}
                </span>
                <span class="text-[9px] text-text/40 ml-0.5">pcs</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- ITEM LIST (HISTORY MODE) -->
    <transition
      enter-active-class="transition-[max-height] duration-300 ease-in-out overflow-hidden"
      enter-from-class="max-h-0"
      enter-to-class="max-h-[500px]"
      leave-active-class="transition-[max-height] duration-300 ease-in-out overflow-hidden"
      leave-from-class="max-h-[500px]"
      leave-to-class="max-h-0"
    >
      <div v-if="mode === 'history' && isOpen" class="bg-secondary/20 border-t border-secondary/10 p-3">
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
              <span class="font-bold bg-background px-1.5 py-0.5 rounded border border-secondary/10">
                {{ item.quantity }} pcs
              </span>
              <div
                v-if="mode === 'history' && inv.status === 'VOID'"
                class="text-[9px] px-1.5 py-0.5 rounded bg-danger/10 text-danger border border-danger/20 font-bold shrink-0 mb-1 w-fit"
              >
                VOID
              </div>
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
