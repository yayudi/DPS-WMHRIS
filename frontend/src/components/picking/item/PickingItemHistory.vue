<!-- frontend/src/components/picking/item/PickingItemHistory.vue -->
<script setup>
import { formatDate } from '@/api/helpers/time.js'
import { useClipboard } from '@/composables/useClipboard.js'

defineProps({
  inv: { type: Object, required: true },
  historyLogs: { type: Array, default: () => [] },
  compact: { type: Boolean, default: false },
  layout: { type: String, default: 'card' } // 'card' | 'row'
})

const { copyToClipboard } = useClipboard()

function getStatusBadge(status) {
  const map = {
    VALIDATED: {
      class: 'text-success bg-success/5 border-success/20',
      label: 'Dipick',
      icon: 'fa-check'
    },
    COMPLETED: {
      class: 'text-success bg-success/5 border-success/20',
      label: 'Selesai',
      icon: 'fa-check-double'
    },
    RETURNED: {
      class: 'text-danger bg-danger/5 border-danger/20',
      label: 'Retur',
      icon: 'fa-rotate-left'
    },
    CANCEL: {
      class: 'text-secondary bg-secondary/5 border-secondary/20',
      label: 'Batal',
      icon: 'fa-ban'
    },
    VOID: {
      class: 'text-danger bg-danger/5 border-danger/20',
      label: 'Void',
      icon: 'fa-ban'
    }
  }
  return (
    map[status] || {
      class: 'text-secondary bg-secondary/5 border-secondary/20',
      label: status || '-',
      icon: 'fa-info'
    }
  )
}
</script>

<template>
  <div>
    <!-- === LAYOUT: ROW (Table View) === -->
    <div v-if="layout === 'row'" class="space-y-3">
      <!-- Item Table -->
      <div class="bg-background border border-secondary/10 rounded-lg overflow-x-auto no-scrollbar">
        <table class="w-full text-xs text-left min-w-[340px]">
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
              <td class="py-2 px-3 font-mono font-bold text-text/80 w-36">
                <div class="flex items-center gap-1.5">
                  <span>{{ item.sku }}</span>
                  <button
                    type="button"
                    @click.stop="copyToClipboard(item.sku, 'SKU')"
                    class="text-text/30 hover:text-primary w-6 h-6 flex items-center justify-center rounded hover:bg-secondary/10 transition-colors text-[10px] shrink-0"
                    title="Salin SKU"
                  >
                    <font-awesome-icon icon="fa-solid fa-copy" />
                  </button>
                </div>
              </td>
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
        <p class="text-[10px] font-bold text-text/40 uppercase mb-2 ml-1">
          Riwayat Revisi (Versi Lama)
        </p>
        <div class="space-y-1">
          <div
            v-for="log in historyLogs"
            :key="log.id"
            class="flex justify-between items-center text-[10px] text-text/50 bg-background border border-secondary/10 px-3 py-1.5 rounded"
          >
            <div class="flex items-center gap-2">
              <span v-if="inv.status === 'VOID'" class="flex items-center gap-1 text-danger font-bold">
                <font-awesome-icon icon="fa-solid fa-ban" class="text-[10px]" /> VOID
              </span>
              <span class="font-mono text-text/70">#{{ log.id }}</span>
              <span class="line-through opacity-70">{{ log.status }}</span>
            </div>
            <span>{{ formatDate(log.created_at, true, true) }}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- === LAYOUT: CARD (Standard & Compact Grid) === -->
    <div v-else>
      <div class="space-y-2" :class="compact ? 'mb-2' : 'mb-4'">
        <div
          v-for="(item, idx) in inv.items"
          :key="idx"
          class="flex justify-between items-start text-xs border-b border-dashed border-secondary/10 last:border-0 pb-1.5 last:pb-0"
        >
          <div class="flex-1 pr-2">
            <div class="font-bold text-text/80 flex items-center gap-1.5">
              <span>{{ item.sku }}</span>
              <button
                type="button"
                @click.stop="copyToClipboard(item.sku, 'SKU')"
                class="text-text/30 hover:text-primary w-6 h-6 flex items-center justify-center rounded hover:bg-secondary/10 transition-colors text-[10px] shrink-0"
                title="Salin SKU"
              >
                <font-awesome-icon icon="fa-solid fa-copy" />
              </button>
            </div>
            <div class="text-[10px] text-text/50 truncate">{{ item.product_name || '-' }}</div>
          </div>
          <div class="text-right shrink-0">
            <span class="font-bold bg-background px-1.5 py-0.5 rounded border border-secondary/10">
              {{ item.quantity }} pcs
            </span>
            <div
              v-if="inv.status === 'VOID'"
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
  </div>
</template>
