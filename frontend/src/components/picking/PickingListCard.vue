<!-- frontend/src/components/picking/PickingListCard.vue -->
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
  sourceBgClass,
  handleCardClick,
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
    class="bg-background border rounded-xl overflow-hidden transition-all duration-200 flex flex-col shadow-md mb-4 break-inside-avoid group"
    :class="[
      mode === 'picking' ? 'cursor-pointer select-none active:scale-[0.995]' : '',
      isInvoiceSelected
        ? 'border-primary ring-2 ring-primary/40 shadow-lg bg-primary/[0.02]'
        : 'border-secondary hover:border-primary/50 hover:shadow-md'
    ]"
    @click="(e) => handleCardClick(e, emit)"
  >
    <!-- HEADER CARD (STANDARD SIZE) -->
    <div
      class="px-3 py-3 flex items-start justify-between border-b bg-secondary/35 relative"
      :class="[mode === 'history' ? 'cursor-pointer' : '']"
      @click="mode === 'history' ? (isOpen = !isOpen) : null"
    >
      <div class="absolute left-0 top-0 bottom-0 w-1" :class="sourceBgClass"></div>

      <div class="flex items-start gap-3 pl-2 min-w-0 flex-1">
        <!-- SELECTION BADGE (CLICK-TO-SELECT) -->
        <div
          v-if="mode === 'picking'"
          class="pt-1 flex items-center justify-center shrink-0"
          :title="
            hasStockIssue ? 'Ada masalah stok (Backorder/Stok Kurang). Backend akan mencari lokasi baru otomatis.' : ''
          "
        >
          <div
            class="w-5 h-5 rounded-md flex items-center justify-center transition-all duration-200"
            :class="[
              isInvoiceSelected
                ? 'bg-primary text-background shadow-sm ring-1 ring-primary scale-105'
                : 'border-2 border-secondary/50 group-hover:border-primary/60 bg-background/50'
            ]"
          >
            <font-awesome-icon v-if="isInvoiceSelected" icon="fa-solid fa-check" class="text-xs" />
          </div>
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
          <div class="flex items-center gap-1.5 mb-0.5">
            <h3
              class="font-bold tracking-tight truncate text-text text-sm hover:text-primary transition-colors cursor-text select-text"
              :title="inv.invoice"
            >
              {{ inv.invoice }}
            </h3>
            <button
              type="button"
              @click.stop="copyToClipboard(inv.invoice, 'Nomor Invoice')"
              class="text-text/30 hover:text-primary w-6 h-6 flex items-center justify-center rounded hover:bg-secondary/10 transition-colors text-xs shrink-0"
              title="Salin Nomor Invoice"
            >
              <font-awesome-icon icon="fa-solid fa-copy" />
            </button>
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

        <!-- Action Buttons & Edit Modal -->
        <PickingItemActions
          :inv="inv"
          :mode="mode"
          :has-stock-issue="hasStockIssue"
          :can-cancel="canCancel"
          :is-loading="isLoading"
          :is-open="isOpen"
          :show-chevron="mode === 'history'"
          @void-invoice="onVoidInvoice(emit)"
          @retry-backorder="onRetryBackorder(emit)"
          @items-updated="(id) => emit('items-updated', id)"
          @toggle-open="isOpen = !isOpen"
        />
      </div>
    </div>

    <!-- ITEM LIST (PICKING MODE) -->
    <PickingItemLocations
      v-if="mode === 'picking'"
      :locations="inv.locations"
      :is-invoice-selected="isInvoiceSelected"
      :validate-stock="validateStock"
    />

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
        <PickingItemHistory :inv="inv" :history-logs="historyLogs" />
      </div>
    </transition>
  </div>
</template>
