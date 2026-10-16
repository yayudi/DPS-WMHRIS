<!-- frontend/src/components/picking/PickingListCardCompact.vue -->
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
    class="bg-background border rounded-lg overflow-hidden transition-all duration-200 flex flex-col shadow-sm break-inside-avoid group relative"
    :class="[
      mode === 'picking' ? 'cursor-pointer select-none active:scale-[0.995]' : '',
      isInvoiceSelected
        ? 'border-primary ring-2 ring-primary/40 shadow-md bg-primary/[0.02]'
        : 'border-secondary hover:border-primary/50 hover:shadow-sm'
    ]"
    @click="(e) => handleCardClick(e, emit)"
  >
    <!-- HEADER CARD COMPACT -->
    <div
      class="px-2 py-2 flex items-start justify-between border-b bg-secondary/35 relative"
      :class="[mode === 'history' ? 'cursor-pointer' : '']"
      @click="mode === 'history' ? (isOpen = !isOpen) : null"
    >
      <div class="absolute left-0 top-0 bottom-0 w-1" :class="sourceBgClass"></div>

      <div class="flex items-center gap-2 pl-2 min-w-0 flex-1">
        <!-- SELECTION BADGE (CLICK-TO-SELECT) -->
        <div v-if="mode === 'picking'" class="pt-0.5 flex items-center justify-center shrink-0">
          <div
            class="w-4 h-4 rounded flex items-center justify-center transition-all duration-200"
            :class="[
              isInvoiceSelected
                ? 'bg-primary text-background shadow-sm ring-1 ring-primary scale-105'
                : 'border-2 border-secondary/50 group-hover:border-primary/60 bg-background/50'
            ]"
          >
            <font-awesome-icon v-if="isInvoiceSelected" icon="fa-solid fa-check" class="text-[9px]" />
          </div>
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
          <div class="flex items-center gap-1.5">
            <h3
              class="font-bold tracking-tight truncate text-text text-xs hover:text-primary transition-colors cursor-text select-text leading-tight"
              :title="inv.invoice"
            >
              {{ inv.invoice }}
            </h3>
            <button
              type="button"
              @click.stop="copyToClipboard(inv.invoice, 'Nomor Invoice')"
              class="text-text/30 hover:text-primary w-6 h-6 flex items-center justify-center rounded hover:bg-secondary/10 transition-colors text-[10px] shrink-0"
              title="Salin Nomor Invoice"
            >
              <font-awesome-icon icon="fa-solid fa-copy" />
            </button>
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

        <span
          v-if="inv.location_purpose === 'BRANCH'"
          class="text-[9px] font-bold px-1.5 py-0.5 rounded shadow-sm bg-accent/20 text-accent/80 flex items-center gap-1 border border-accent/20"
        >
          <font-awesome-icon icon="fa-solid fa-code-branch" />
          Cabang
        </span>

        <!-- Compact Actions -->
        <PickingItemActions
          :inv="inv"
          :mode="mode"
          :has-stock-issue="hasStockIssue"
          :can-cancel="canCancel"
          :is-loading="isLoading"
          :is-open="isOpen"
          :show-chevron="mode === 'history'"
          compact
          @void-invoice="onVoidInvoice(emit)"
          @retry-backorder="onRetryBackorder(emit)"
          @items-updated="(id) => emit('items-updated', id)"
          @toggle-open="isOpen = !isOpen"
        />
      </div>
    </div>

    <!-- ITEM LIST COMPACT (PICKING MODE) -->
    <PickingItemLocations
      v-if="mode === 'picking'"
      :locations="inv.locations"
      :is-invoice-selected="isInvoiceSelected"
      :validate-stock="validateStock"
      compact
    />

    <!-- ITEM LIST COMPACT (HISTORY MODE) -->
    <transition
      enter-active-class="transition-[max-height] duration-300 ease-in-out overflow-hidden"
      enter-from-class="max-h-0"
      enter-to-class="max-h-[500px]"
      leave-active-class="transition-[max-height] duration-300 ease-in-out overflow-hidden"
      leave-from-class="max-h-[500px]"
      leave-to-class="max-h-0"
    >
      <div v-if="mode === 'history' && isOpen" class="bg-secondary/20 border-t border-secondary/10 p-2.5 text-xs">
        <PickingItemHistory :inv="inv" :history-logs="historyLogs" compact />
      </div>
    </transition>
  </div>
</template>
