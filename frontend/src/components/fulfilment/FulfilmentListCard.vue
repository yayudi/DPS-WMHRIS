<!-- frontend\src\components\fulfilment\FulfilmentListCard.vue -->
<script setup>
import { computed, ref } from 'vue'
import { formatDate } from '@/api/helpers/time.js'
import { useAuthStore } from '@/stores/auth'
import logoTokopedia from '@/assets/img/tokopedia.svg'
import logoShopee from '@/assets/img/shopee.svg'
import { useFulfilmentCardState } from '@/composables/useFulfilmentCardState'

const props = defineProps({
  inv: { type: Object, required: true },
  mode: { type: String, default: 'picking' },
  historyLogs: { type: Array, default: () => [] }
})

const authStore = useAuthStore()
const emit = defineEmits(['card-click'])

const isOpen = ref(false)

const { totalSKU, hasInsufficientStock, getMpStatusBadge, getStatusBadge, getThemeColorVar } = useFulfilmentCardState(props, authStore)

function handleCardClick(e) {
  if (e.target.closest('.toggle-btn')) {
    isOpen.value = !isOpen.value
    return
  }

  if (props.mode === 'history') {
    isOpen.value = !isOpen.value
  } else {
    emit('card-click', props.inv)
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
  >
    <!-- HEADER CARD (STANDARD SIZE) -->
    <div class="flex flex-col border-b bg-secondary/10 relative cursor-pointer" @click="handleCardClick">
      <div class="absolute left-0 top-0 bottom-0 w-1" :class="sourceBgClass"></div>
      <!-- Top Row: Logo & Status -->
      <div class="flex items-center justify-between mb-3 p-4 pb-0">
        <div class="flex items-center gap-2">
          <div
            class="p-1 rounded-lg bg-white border border-secondary/10 shadow-sm shrink-0 h-8 w-8 flex items-center justify-center overflow-hidden"
          >
            <img v-if="inv.source === 'Tokopedia'" :src="logoTokopedia" class="w-full h-full object-contain p-0.5" />
            <img v-else-if="inv.source === 'Shopee'" :src="logoShopee" class="w-full h-full object-contain p-0.5" />
            <font-awesome-icon v-else icon="fa-solid fa-file-invoice" class="text-primary" />
          </div>
          <span class="font-bold text-sm text-text">{{ inv.shop_name || 'Toko Cabang' }}</span>
        </div>
        <div class="flex flex-col items-end">
          <span class="text-2xl font-black text-primary leading-none block">{{ totalSKU }}</span>
          <span class="text-[9px] text-text/40 uppercase font-bold">Total SKU</span>
        </div>
      </div>

      <!-- Middle Row: Invoice -->
      <div class="px-4 mb-4 flex flex-row items-center gap-2 justify-between">
        <div>
          <div class="text-[10px] text-text/50 uppercase tracking-wider mb-1">Sales Invoice No</div>
          <h3
            class="text-xl font-black text-text hover:text-primary transition-colors cursor-text select-text"
            :title="inv.invoice"
          >
            {{ inv.invoice }}
          </h3>
          <div v-if="inv.source !== 'Offline'" class="mt-2 text-sm text-text/80 flex flex-col items-start gap-2">
            <span class="text-text/50">Marketplace Order ID</span>
            <div class="flex flex-row items-center gap-2">
              <span class="font-bold select-all">{{ inv.original_invoice_id || '-' }}</span>
              <button @click.stop class="text-primary hover:text-primary/70" title="Copy ID">
                <font-awesome-icon icon="fa-solid fa-copy" />
              </button>
            </div>
          </div>
        </div>

        <div class="flex items-end align-center justify-end gap-2 flex-col">
          <span
            v-if="inv.marketplace_status && inv.marketplace_status !== 'NEW'"
            class="text-[10px] font-bold px-3 py-1 rounded-full shadow-sm flex items-center gap-1"
            :class="getMpStatusBadge(inv.marketplace_status)?.class || 'bg-primary/10 text-primary'"
          >
            <font-awesome-icon :icon="`fa-solid ${getMpStatusBadge(inv.marketplace_status)?.icon || 'fa-box'}`" />
            {{ getMpStatusBadge(inv.marketplace_status)?.label || inv.marketplace_status }}
          </span>

          <span
            v-if="inv.status"
            class="text-[10px] font-bold px-3 py-1 rounded-full shadow-sm border flex items-center gap-1"
            :class="getStatusBadge(inv.status)?.class || 'bg-secondary/10 border-secondary/30 text-secondary'"
          >
            <font-awesome-icon :icon="`fa-solid ${getStatusBadge(inv.status)?.icon || 'fa-tasks'}`" />
            {{ getStatusBadge(inv.status)?.label || inv.status }}
          </span>
        </div>
      </div>

      <!-- Info Grid -->
      <div class="px-4 grid grid-cols-1 md:grid-cols-3 gap-4 mb-4 pb-4 border-b border-secondary/10">
        <div>
          <div class="text-[10px] text-text/50 uppercase mb-0.5">Transaction Date</div>
          <div class="text-sm font-semibold text-text">{{ formatDate(inv.order_date, false, false) || '-' }}</div>
        </div>
        <div>
          <div class="text-[10px] text-text/50 uppercase mb-0.5">Expedition</div>
          <div class="text-sm font-semibold text-text">{{ inv.courier || '-' }}</div>
        </div>
        <div>
          <div class="text-[10px] text-text/50 uppercase mb-0.5">Tracking Number</div>
          <div class="text-sm font-semibold text-text select-all">{{ inv.awb || '-' }}</div>
        </div>
      </div>

      <!-- Action Bar (Toggle Item List) -->
      <button
        @click.stop="isOpen = !isOpen"
        class="toggle-btn w-full mt-2 py-3 bg-secondary/50 hover:bg-secondary/20 active:bg-secondary/30 text-text/70 hover:text-primary text-xs font-bold flex items-center justify-center gap-2 transition-colors border-t border-secondary/20"
      >
        <font-awesome-icon :icon="isOpen ? 'fa-solid fa-chevron-up' : 'fa-solid fa-chevron-down'" />
        {{ isOpen ? 'SEMBUNYIKAN DAFTAR BARANG' : 'LIHAT DAFTAR BARANG' }}
      </button>
    </div>

    <!-- ITEM LIST (PICKING MODE) -->
    <Transition
      enter-active-class="transition-all duration-300 ease-in-out origin-top"
      enter-from-class="transform scale-y-95 opacity-0"
      enter-to-class="transform scale-y-100 opacity-100"
      leave-active-class="transition-all duration-200 ease-in-out origin-top"
      leave-from-class="transform scale-y-100 opacity-100"
      leave-to-class="transform scale-y-95 opacity-0"
    >
      <div v-if="mode === 'picking' && isOpen" class="divide-y divide-secondary/10 relative">
        <div v-for="(items, locName) in inv.locations" :key="locName" class="relative z-10">
          <!-- Location Header -->
          <div class="bg-secondary/50 px-5 py-2 flex items-center justify-between border-b border-secondary/5">
            <div class="flex items-center gap-2">
              <font-awesome-icon
                :icon="
                  !locName || locName === 'Unknown Loc'
                    ? 'fa-solid fa-triangle-exclamation'
                    : 'fa-solid fa-location-dot'
                "
                class="text-sm"
                :class="!locName || locName === 'Unknown Loc' ? 'text-danger' : 'text-primary'"
              />
              <span
                class="text-sm font-bold uppercase tracking-wider"
                :class="!locName || locName === 'Unknown Loc' ? 'text-danger' : 'text-primary'"
              >
                {{ locName || 'Stok Kosong / Tidak Diketahui' }}
              </span>
            </div>
          </div>

          <!-- Item Rows -->
          <div class="divide-y divide-secondary/5">
            <div
              v-for="item in items"
              :key="item.id"
              class="transition-colors p-4 flex items-center gap-4"
              :class="hasInsufficientStock(item) ? 'bg-danger/5' : ''"
            >
              <!-- Image Placeholder -->
              <div
                class="w-16 h-16 bg-secondary/20 rounded-lg flex items-center justify-center shrink-0 border border-secondary/10"
              >
                <font-awesome-icon icon="fa-solid fa-image" class="text-text/20 text-2xl" />
              </div>

              <!-- Product Info -->
              <div class="flex-1 min-w-0">
                <div class="font-bold text-text text-sm mb-1 line-clamp-2">{{ item.product_name }}</div>
                <div class="flex items-center gap-2 mb-1">
                  <div
                    class="inline-block border border-secondary/30 bg-background px-2 py-0.5 rounded text-xs font-semibold text-text/70"
                  >
                    {{ item.sku }}
                  </div>
                </div>

                <div
                  v-if="hasInsufficientStock(item) && item.location_code"
                  class="text-[10px] text-danger font-bold mt-1 flex items-center gap-1"
                >
                  <font-awesome-icon icon="fa-solid fa-triangle-exclamation" />
                  Stok Kurang: {{ item.available_stock }} (Butuh {{ item.quantity }})
                </div>
                <div v-else-if="!item.location_code" class="text-[10px] text-danger font-bold mt-1">
                  Lokasi tidak ditemukan
                </div>
              </div>

              <!-- Quantity -->
              <div class="flex flex-col items-end justify-center shrink-0">
                <div class="font-black text-xl mb-2" :class="hasInsufficientStock(item) ? 'text-danger' : 'text-text'">
                  x {{ item.quantity }} <span class="text-xs text-text/40 font-normal">Pcs</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Transition>

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

        <div
          v-if="inv.kelja_histories && inv.kelja_histories.length > 0"
          class="pt-4 border-t border-secondary/20 mt-2"
        >
          <p class="text-[10px] font-bold text-text/40 uppercase mb-3">Kelja Timeline:</p>
          <div
            class="relative pl-3 space-y-4 before:content-[''] before:absolute before:left-[15px] before:top-2 before:bottom-2 before:w-[2px] before:bg-secondary/20"
          >
            <div v-for="log in [...inv.kelja_histories].reverse()" :key="log.id" class="relative flex gap-3 text-xs">
              <div class="absolute -left-[18px] top-1 bg-background rounded-full border border-secondary/20">
                <font-awesome-icon icon="fa-solid fa-clock" class="text-primary text-[10px] m-[3px]" />
              </div>
              <div class="flex-1 flex flex-col">
                <div class="text-text/70 mb-1">by <span class="font-bold">System</span></div>
                <div class="flex items-center gap-2 mb-1">
                  <span class="text-text/50">Changed To</span>
                  <span
                    class="px-2 py-0.5 rounded text-[10px] font-bold shadow-sm"
                    :style="{
                      backgroundColor: `hsl(var(${getThemeColorVar(log.status?.property_color)}) / 0.15)`,
                      color: `hsl(var(${getThemeColorVar(log.status?.property_color)}))`,
                      border: `1px solid hsl(var(${getThemeColorVar(log.status?.property_color)}) / 0.3)`
                    }"
                  >
                    {{ log.status?.description || '-' }}
                  </span>
                </div>
                <div class="text-[10px] text-text/40 font-mono">
                  {{ formatDate(log.created_at, true, true) }}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </transition>
  </div>
</template>
