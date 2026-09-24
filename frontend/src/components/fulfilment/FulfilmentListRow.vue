<script setup>
import { ref } from 'vue'
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

const { totalSKU, hasStockIssue, getMpStatusBadge, getStatusBadge } = useFulfilmentCardState(props, authStore)

function handleRowClick(e) {
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
</script>

<template>
  <div class="bg-background border-b border-secondary/10 last:border-b-0 hover:bg-secondary/5 transition-colors group">
    <!-- ROW HEADER -->
    <div class="px-4 py-3 flex items-center gap-4">
      <div
        class="flex-1 min-w-0 grid grid-cols-12 gap-x-4 gap-y-2 items-center cursor-pointer py-1"
        @click="handleRowClick"
      >
        <div class="col-span-10 sm:col-span-4 lg:col-span-3 flex items-center gap-3">
          <div
            class="w-10 h-10 flex items-center justify-center rounded-lg bg-background border border-secondary/20 shrink-0 shadow-sm"
          >
            <img v-if="inv.source === 'Tokopedia'" :src="logoTokopedia" class="w-6 h-6 object-contain" />
            <img v-else-if="inv.source === 'Shopee'" :src="logoShopee" class="w-6 h-6 object-contain" />
            <font-awesome-icon v-else icon="fa-solid fa-file-invoice" class="text-primary text-lg" />
          </div>
          <div class="min-w-0">
            <div
              class="font-black text-[13px] sm:text-sm text-text truncate group-hover:text-primary transition-colors flex items-center gap-2"
            >
              {{ inv.invoice || inv.original_invoice_id }}
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

        <div class="col-span-2 sm:col-span-3 lg:col-span-3 hidden sm:block">
          <div class="text-xs font-bold text-text truncate">
            <font-awesome-icon icon="fa-solid fa-user" class="text-text/30 mr-1.5" />
            {{ inv.customer_name || '-' }}
          </div>
          <div
            v-if="inv.shop_name"
            class="text-[10px] font-medium text-text/50 truncate flex items-center gap-1.5 mt-1"
          >
            <font-awesome-icon icon="fa-solid fa-store" class="opacity-40" />
            {{ inv.shop_name }}
          </div>
        </div>

        <div
          class="col-span-3 lg:col-span-2 hidden lg:flex flex-col justify-center gap-1.5 border-l border-secondary/10 pl-4 h-full"
        >
          <div class="text-[10px] text-text/70 flex items-center gap-1.5 truncate" title="Waktu Order Marketplace">
            <font-awesome-icon icon="fa-solid fa-business-time" class="opacity-50 w-3 text-center" />
            <span>{{ formatDate(inv.order_date, true, true) }}</span>
          </div>
          <div class="text-[10px] text-text/70 flex items-center gap-1.5 truncate" title="Waktu Masuk Sistem">
            <font-awesome-icon icon="fa-solid fa-clock" class="opacity-50 w-3 text-center" />
            <span>{{ formatDate(inv.created_at, true, true) }}</span>
          </div>
        </div>

        <div
          class="col-span-2 sm:col-span-4 lg:col-span-3 hidden sm:flex flex-col lg:flex-row lg:items-center justify-end lg:justify-between gap-2 border-l border-secondary/10 pl-4 h-full"
        >
          <div class="flex flex-col items-end lg:items-start leading-none gap-1.5">
            <div class="text-xs font-black text-text">
              {{ totalSKU }} <span class="font-normal text-[10px] text-text/50 uppercase tracking-wider">SKU</span>
            </div>

            <div
              v-if="hasStockIssue && mode === 'picking'"
              class="text-[9px] text-danger font-bold flex items-center gap-1 bg-danger/10 px-1.5 py-0.5 rounded border border-danger/20"
            >
              <font-awesome-icon icon="fa-solid fa-triangle-exclamation" /> Isu Stok
            </div>
            <div
              v-else-if="mode === 'picking'"
              class="text-[9px] text-success font-bold flex items-center gap-1 bg-success/10 px-1.5 py-0.5 rounded border border-success/20"
            >
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

        <div class="col-span-2 sm:col-span-1 lg:col-span-1 flex justify-end items-center gap-2 toggle-btn">
          <div
            class="w-7 h-7 flex items-center justify-center rounded-full bg-secondary/10 text-text/40 group-hover:bg-secondary/20 transition-colors shrink-0"
          >
            <font-awesome-icon
              icon="fa-solid fa-chevron-down"
              class="text-[10px] transition-transform duration-300"
              :class="{ 'rotate-180': isOpen }"
            />
          </div>
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
        <!-- === MODE: PICKING (Group by Location) === -->
        <div v-if="mode === 'picking'" class="space-y-3">
          <div v-for="(items, locName) in inv.locations" :key="locName">
            <div class="flex items-center gap-2 mb-1.5">
              <span
                class="text-[10px] font-bold px-2 py-0.5 rounded bg-background border border-secondary/20 shadow-sm"
                :class="
                  !locName || locName === 'Unknown Loc' ? 'text-danger border-danger/30 bg-danger/5' : 'text-primary'
                "
              >
                <font-awesome-icon icon="fa-solid fa-location-dot" class="mr-1" />
                {{ locName || 'Stok Kosong' }}
              </span>
            </div>

            <div class="bg-background border border-secondary/10 rounded-lg overflow-hidden">
              <table class="w-full text-xs text-left">
                <tbody class="divide-y divide-secondary/5">
                  <tr v-for="item in items" :key="item.id" class="hover:bg-secondary/5 transition-colors">
                    <td class="py-2 px-3 font-mono font-bold text-text/80 w-32">{{ item.sku }}</td>
                    <td class="py-2 px-3 text-text/70">{{ item.product_name }}</td>
                    <td class="py-2 px-3 w-32">
                      <div v-if="!item.location_code" class="text-danger font-bold">Lokasi (-)</div>
                    </td>
                    <td class="py-2 px-3 text-right font-bold w-16 bg-secondary/5 border-l border-secondary/5">
                      {{ item.quantity }}
                      <span class="text-[9px] font-normal text-text/40">pcs</span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <!-- === MODE: HISTORY (Flat List + Logs) === -->
        <div v-else class="space-y-3">
          <!-- Item Table -->
          <div class="bg-background border border-secondary/10 rounded-lg overflow-hidden">
            <table class="w-full text-xs text-left">
              <thead class="bg-secondary/5 text-text/50 font-medium">
                <tr>
                  <th class="py-1.5 px-3">SKU</th>
                  <th class="py-1.5 px-3">Produk</th>
                  <th class="py-1.5 px-3 text-right">Qty</th>
                  <th class="py-1.5 px-3 text-center">Status</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-secondary/5">
                <tr v-for="(item, idx) in inv.items" :key="idx" class="hover:bg-secondary/5 transition-colors">
                  <td class="py-2 px-3 font-mono font-bold text-text/80 w-32">{{ item.sku }}</td>
                  <td class="py-2 px-3 text-text/70">{{ item.product_name || '-' }}</td>
                  <td class="py-2 px-3 text-right font-bold w-16">
                    {{ item.quantity }}
                  </td>
                  <td class="py-2 px-3 text-center w-24">
                    <span
                      class="text-[9px] px-1.5 py-0.5 rounded border flex items-center justify-center gap-1 w-full"
                      :class="getStatusBadge(item.item_status).class"
                    >
                      <font-awesome-icon :icon="`fa-solid ${getStatusBadge(item.item_status).icon}`" />
                      {{ getStatusBadge(item.item_status).label }}
                    </span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <!-- History Logs (Revisions) -->
          <div v-if="historyLogs && historyLogs.length > 0" class="pt-2 border-t border-secondary/10">
            <p class="text-[10px] font-bold text-text/40 uppercase mb-2 ml-1">Riwayat Revisi (Versi Lama)</p>
            <div class="space-y-1">
              <div
                v-for="log in historyLogs"
                :key="log.id"
                class="flex justify-between items-center text-[10px] text-text/50 bg-background border border-secondary/10 px-3 py-1.5 rounded"
              >
                <div class="flex items-center gap-2">
                  <span v-if="inv.status === 'VOID'" class="flex items-center gap-1">
                    <i class="fa-solid fa-ban text-[10px]"></i> VOID
                  </span>
                  <span class="font-mono text-text/70">#{{ log.id }}</span>
                  <span class="line-through opacity-70">{{ log.status }}</span>
                </div>
                <span>{{ formatDate(log.created_at, true, true) }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </transition>
  </div>
</template>
