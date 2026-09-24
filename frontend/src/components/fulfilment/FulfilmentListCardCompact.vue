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

const emit = defineEmits(['card-click'])
const authStore = useAuthStore()
const isOpen = ref(false)

const { totalSKU, hasInsufficientStock, getMpStatusBadge } = useFulfilmentCardState(props, authStore)

const sourceBgClass = computed(() => {
  const source = props.inv.source?.toLowerCase()
  if (source === 'tokopedia') return 'bg-success'
  if (source === 'shopee') return 'bg-warning'
  return 'bg-secondary'
})
</script>

<template>
  <div
    class="bg-background border rounded-lg overflow-hidden transition-all duration-300 flex flex-col shadow-sm break-inside-avoid group relative"
  >
    <!-- HEADER CARD COMPACT -->
    <div
      class="px-2 py-2 flex items-start justify-between border-b bg-secondary/35 relative cursor-pointer"
      @click="mode === 'history' ? (isOpen = !isOpen) : null"
      @click.stop="mode !== 'history' ? emit('card-click', inv) : null"
    >
      <div class="absolute left-0 top-0 bottom-0 w-1" :class="sourceBgClass"></div>

      <div class="flex items-center gap-2 pl-2 min-w-0 flex-1">
        <!-- LOGO -->
        <div
          class="p-0.5 rounded bg-background border border-secondary/10 shadow-sm shrink-0 h-6 w-6 flex items-center justify-center overflow-hidden"
        >
          <img v-if="inv.source === 'Tokopedia'" :src="logoTokopedia" class="w-full h-full object-contain p-0.5" />
          <img v-else-if="inv.source === 'Shopee'" :src="logoShopee" class="w-full h-full object-contain p-0.5" />
          <font-awesome-icon v-else icon="fa-solid fa-file-invoice" class="text-primary text-xs" />
        </div>

        <div class="min-w-0 flex flex-col">
          <div class="flex items-center gap-2">
            <h3
              class="font-bold tracking-tight truncate text-text text-xs hover:text-primary transition-colors cursor-pointer select-text leading-tight"
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

        <span
          v-if="inv.location_purpose === 'BRANCH'"
          class="text-[9px] font-bold px-1.5 py-0.5 rounded shadow-sm bg-accent/20 text-accent/80 flex items-center gap-1 border border-accent/20"
        >
          <font-awesome-icon icon="fa-solid fa-code-branch" />
          Cabang
        </span>

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
      <div v-for="(items, locName) in inv.locations" :key="locName" class="relative z-10">
        <!-- Location Header Compact -->
        <div class="bg-secondary/50 px-3 py-1 flex items-center justify-between border-b border-secondary/5">
          <span v-if="inv.status === 'VOID'" class="flex items-center gap-1">
            <i class="fa-solid fa-ban text-[10px]"></i> VOID
          </span>
          <div v-else class="flex items-center gap-1.5">
            <font-awesome-icon
              :icon="
                !locName || locName === 'Unknown Loc' ? 'fa-solid fa-triangle-exclamation' : 'fa-solid fa-location-dot'
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
              :class="hasInsufficientStock(item) ? 'bg-danger/5' : ''"
            >
              <td class="pl-3 py-1.5 align-top">
                <div class="flex flex-col">
                  <div class="font-bold text-text mb-0.5 flex items-center gap-1.5 leading-none">
                    {{ item.sku }}
                  </div>
                  <div
                    class="text-[9px] text-text/60 leading-tight line-clamp-1 group-hover/item:line-clamp-none transition-all"
                  >
                    {{ item.product_name }}
                  </div>
                </div>
              </td>
              <td class="px-3 py-1.5 text-right align-top w-12">
                <span class="font-bold" :class="hasInsufficientStock(item) ? 'text-danger' : 'text-text'">
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
