<!-- frontend/src/components/picking/PickingListRow.vue -->
<script setup>
import { formatDate } from '@/api/helpers/time.js'
import { useAuthStore } from '@/stores/auth'
import logoTokopedia from '@/assets/img/tokopedia.svg'
import logoShopee from '@/assets/img/shopee.svg'
import { usePickingCardState } from '@/composables/usePickingCardState'
import { useClipboard } from '@/composables/useClipboard.js'
import PickingItemActions from '@/components/picking/item/PickingItemActions.vue'
import PickingItemLocations from '@/components/picking/item/PickingItemLocations.vue'
import PickingItemHistory from '@/components/picking/item/PickingItemHistory.vue'

const props = defineProps({
  inv: { type: Object, required: true },
  selectedItems: { type: Set, default: () => new Set() },
  validateStock: { type: Function, default: () => true },
  mode: { type: String, default: 'picking' }, // 'picking' | 'history'
  historyLogs: { type: Array, default: () => [] }
})

const authStore = useAuthStore()
const emit = defineEmits(['toggle-invoice', 'void-invoice', 'retry-backorder', 'items-updated'])
const { copyToClipboard } = useClipboard()

const {
  isOpen,
  isLoading,
  onVoidInvoice,
  onRetryBackorder,
  totalSKU,
  hasStockIssue,
  isInvoiceSelected,
  canCancel,
  getMpStatusBadge
} = usePickingCardState(props, authStore)
</script>

<template>
  <div
    class="bg-background border-b border-secondary/10 last:border-b-0 hover:bg-secondary/5 transition-colors group"
    :class="{ 'bg-primary/5': isInvoiceSelected }"
  >
    <!-- ROW HEADER -->
    <div class="px-4 py-3 flex items-center gap-4">
      <!-- Selection Badge (Picking Mode Only) -->
      <div
        v-if="mode === 'picking'"
        class="flex-shrink-0 cursor-pointer"
        @click.stop="emit('toggle-invoice', { inv: props.inv, checked: !isInvoiceSelected })"
      >
        <div
          class="w-4 h-4 rounded flex items-center justify-center transition-all duration-200"
          :class="[
            isInvoiceSelected
              ? 'bg-primary text-background shadow-sm ring-1 ring-primary scale-105'
              : 'border-2 border-secondary/50 group-hover:border-primary/60 bg-background'
          ]"
        >
          <font-awesome-icon v-if="isInvoiceSelected" icon="fa-solid fa-check" class="text-[9px]" />
        </div>
      </div>

      <!-- Main Info (Clickable to Expand) -->
      <div
        class="flex-1 min-w-0 grid grid-cols-12 gap-x-4 gap-y-2 items-center cursor-pointer py-1"
        @click="isOpen = !isOpen"
      >
        <!-- Invoice & Source (Col: 8 di Mobile, 4 di SM, 3 di LG) -->
        <div class="col-span-8 sm:col-span-4 lg:col-span-3 flex items-center gap-3">
          <div
            class="w-10 h-10 flex items-center justify-center rounded-lg bg-background border border-secondary/20 shrink-0 shadow-sm"
          >
            <img v-if="inv.source === 'Tokopedia'" :src="logoTokopedia" class="w-6 h-6 object-contain" />
            <img v-else-if="inv.source === 'Shopee'" :src="logoShopee" class="w-6 h-6 object-contain" />
            <font-awesome-icon v-else icon="fa-solid fa-file-invoice" class="text-primary text-lg" />
          </div>

          <div class="min-w-0">
            <div
              class="font-black text-[13px] sm:text-sm text-text truncate group-hover:text-primary transition-colors flex items-center gap-1.5"
            >
              <span>{{ inv.invoice || inv.original_invoice_id }}</span>
              <button
                type="button"
                @click.stop="copyToClipboard(inv.invoice || inv.original_invoice_id, 'Nomor Invoice')"
                class="text-text/30 hover:text-primary w-6 h-6 flex items-center justify-center rounded hover:bg-secondary/10 transition-colors text-xs shrink-0"
                title="Salin Nomor Invoice"
              >
                <font-awesome-icon icon="fa-solid fa-copy" />
              </button>
              <!-- Status Badge di Header untuk History -->
              <span
                v-if="mode === 'history' && inv.status === 'CANCEL'"
                class="text-[9px] px-1.5 py-0.5 rounded bg-danger/10 text-danger border border-danger/20 font-bold shrink-0"
              >
                BATAL
              </span>
            </div>

            <div class="text-[10px] text-text/60 flex items-center gap-1.5 mt-0.5">
              <span class="font-bold">{{ inv.source }}</span>
              <span v-if="inv.marketplace_status" class="w-1 h-1 rounded-full bg-secondary/30"></span>
              <span
                v-if="inv.marketplace_status"
                :class="getMpStatusBadge(inv.marketplace_status).class"
                class="px-1.5 rounded text-[9px] border font-bold"
              >
                {{ getMpStatusBadge(inv.marketplace_status).label }}
              </span>
            </div>
          </div>
        </div>

        <!-- Customer & Shop (Col: Sembunyi di Mobile, 3 di SM, 3 di LG) -->
        <div class="col-span-2 sm:col-span-3 lg:col-span-3 hidden sm:block">
          <div class="text-xs font-bold text-text truncate">
            <font-awesome-icon icon="fa-solid fa-user" class="text-text/30 mr-1.5" />
            {{ inv.customer_name || '-' }}
          </div>
          <div v-if="inv.shop_name" class="text-[10px] font-medium text-text/50 truncate flex items-center gap-1.5 mt-1">
            <font-awesome-icon icon="fa-solid fa-store" class="opacity-40" />
            {{ inv.shop_name }}
          </div>
        </div>

        <!-- Dates (Col: Sembunyi di Mobile/SM, 2 di LG) -->
        <div class="col-span-3 lg:col-span-2 hidden lg:flex flex-col justify-center gap-1.5 border-l border-secondary/10 pl-4 h-full">
          <div class="text-[10px] text-text/70 flex items-center gap-1.5 truncate" title="Waktu Order Marketplace">
            <font-awesome-icon icon="fa-solid fa-business-time" class="opacity-50 w-3 text-center" />
            <span>{{ formatDate(inv.order_date, true, true) }}</span>
          </div>
          <div class="text-[10px] text-text/70 flex items-center gap-1.5 truncate" title="Waktu Masuk Sistem">
            <font-awesome-icon icon="fa-solid fa-clock" class="opacity-50 w-3 text-center" />
            <span>{{ formatDate(inv.created_at, true, true) }}</span>
          </div>
        </div>

        <!-- Stats & Status (Col: Sembunyi di Mobile, 3 di SM, 2 di LG) -->
        <div class="col-span-2 sm:col-span-3 lg:col-span-2 hidden sm:flex flex-col lg:flex-row lg:items-center justify-end lg:justify-between gap-2 border-l border-secondary/10 pl-4 h-full">
          <div class="flex flex-col items-end lg:items-start leading-none gap-1.5">
            <div class="text-xs font-black text-text">
              {{ totalSKU }} <span class="font-normal text-[10px] text-text/50 uppercase tracking-wider">SKU</span>
            </div>
            
            <div v-if="hasStockIssue && mode === 'picking'" class="text-[9px] text-danger font-bold flex items-center gap-1 bg-danger/10 px-1.5 py-0.5 rounded border border-danger/20">
              <font-awesome-icon icon="fa-solid fa-triangle-exclamation" /> Isu Stok
            </div>
            <div v-else-if="mode === 'picking'" class="text-[9px] text-success font-bold flex items-center gap-1 bg-success/10 px-1.5 py-0.5 rounded border border-success/20">
              <font-awesome-icon icon="fa-solid fa-check-circle" /> Stok Aman
            </div>
          </div>
          
          <div class="flex flex-col items-end gap-1.5">
            <span
              v-if="inv.location_purpose === 'BRANCH'"
              class="text-[9px] font-bold px-1.5 py-0.5 rounded shadow-sm bg-accent/20 text-accent/80 flex items-center gap-1 border border-accent/20 leading-none"
            >
              <font-awesome-icon icon="fa-solid fa-code-branch" />
              Cabang
            </span>
            <span
              v-if="mode === 'history' && inv.status === 'PICKED'"
              class="text-[9px] font-bold px-1.5 py-0.5 rounded shadow-sm bg-success/20 text-success flex items-center gap-1 border border-success/20 leading-none"
            >
              <font-awesome-icon icon="fa-solid fa-check-double" />
              Selesai
            </span>
          </div>
        </div>

        <!-- Actions (Col: 4 di Mobile, 2 di SM, 2 di LG) -->
        <div class="col-span-4 sm:col-span-2 lg:col-span-2 flex justify-end items-center">
          <PickingItemActions
            :inv="inv"
            :mode="mode"
            :has-stock-issue="hasStockIssue"
            :can-cancel="canCancel"
            :is-loading="isLoading"
            :is-open="isOpen"
            is-row
            :show-chevron="true"
            @void-invoice="onVoidInvoice(emit)"
            @retry-backorder="onRetryBackorder(emit)"
            @items-updated="(id) => emit('items-updated', id)"
            @toggle-open="isOpen = !isOpen"
          />
        </div>
      </div>
    </div>

    <!-- EXPANDABLE DETAILS -->
    <transition
      enter-active-class="transition-[max-height] duration-300 ease-in-out overflow-hidden"
      enter-from-class="max-h-0"
      enter-to-class="max-h-[500px]"
      leave-active-class="transition-[max-height] duration-300 ease-in-out overflow-hidden"
      leave-from-class="max-h-[500px]"
      leave-to-class="max-h-0"
    >
      <div v-if="isOpen" class="bg-secondary/5 border-t border-secondary/10 px-4 py-3 sm:px-14">
        <!-- MODE: PICKING (Group by Location) -->
        <PickingItemLocations
          v-if="mode === 'picking'"
          layout="row"
          :locations="inv.locations"
          :is-invoice-selected="isInvoiceSelected"
          :validate-stock="validateStock"
        />

        <!-- MODE: HISTORY (Flat List + Logs) -->
        <PickingItemHistory
          v-else
          layout="row"
          :inv="inv"
          :history-logs="historyLogs"
        />
      </div>
    </transition>
  </div>
</template>
