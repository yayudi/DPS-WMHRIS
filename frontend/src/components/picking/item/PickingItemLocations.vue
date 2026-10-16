<!-- frontend/src/components/picking/item/PickingItemLocations.vue -->
<script setup>
import { useClipboard } from '@/composables/useClipboard.js'

const props = defineProps({
  locations: { type: Object, default: () => ({}) },
  isInvoiceSelected: { type: Boolean, default: false },
  validateStock: { type: Function, default: () => true },
  compact: { type: Boolean, default: false },
  layout: { type: String, default: 'card' } // 'card' | 'row'
})

const { copyToClipboard } = useClipboard()

function isItemInvalid(item) {
  if (!item.location_code) return true
  return !props.validateStock({ ...item, quantity: Number(item.quantity) })
}

function hasInsufficientStock(item) {
  if (item.status === 'BACKORDER' || !item.location_code) return true
  const available = Number(item.available_stock || 0)
  const needed = Number(item.quantity || 0)
  return available < needed
}

function isItemAllowed(item) {
  return props.validateStock(item)
}
</script>

<template>
  <div class="relative">
    <div v-if="isInvoiceSelected && layout === 'card'" class="absolute inset-0 bg-primary/5 pointer-events-none z-0"></div>

    <!-- === LAYOUT: ROW (Table Drawer View) === -->
    <div v-if="layout === 'row'" class="space-y-3">
      <div v-for="(items, locName) in locations" :key="locName">
        <div class="flex items-center gap-2 mb-1.5">
          <span
            class="text-[10px] font-bold px-2 py-0.5 rounded bg-background border border-secondary/20 shadow-sm"
            :class="!locName || locName === 'Unknown Loc' ? 'text-danger border-danger/30 bg-danger/5' : 'text-primary'"
          >
            <font-awesome-icon icon="fa-solid fa-location-dot" class="mr-1" />
            {{ locName || 'Stok Kosong' }}
          </span>
        </div>

        <div class="bg-background border border-secondary/10 rounded-lg overflow-x-auto no-scrollbar">
          <table class="w-full text-xs text-left min-w-[340px]">
            <tbody class="divide-y divide-secondary/5">
              <tr v-for="item in items" :key="item.id" class="hover:bg-secondary/5 transition-colors">
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
                <td class="py-2 px-3 text-text/70">{{ item.product_name }}</td>
                <td class="py-2 px-3 w-32">
                  <div
                    v-if="isItemInvalid(item) && item.location_code"
                    class="text-danger font-bold flex items-center gap-1"
                  >
                    <font-awesome-icon icon="fa-solid fa-triangle-exclamation" />
                    <span>Stok: {{ item.available_stock }}</span>
                  </div>
                  <div v-else-if="!item.location_code" class="text-danger font-bold">
                    Lokasi (-)
                  </div>
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

    <!-- === LAYOUT: CARD (Standard & Compact Grid) === -->
    <div v-else class="divide-y divide-secondary/10 relative" :class="compact ? 'text-xs' : ''">
      <div v-for="(items, locName) in locations" :key="locName" class="relative z-10">
        <!-- Location Header -->
        <div
          class="bg-secondary/50 flex items-center justify-between border-b border-secondary/5"
          :class="compact ? 'px-3 py-1' : 'px-4 py-1.5'"
        >
          <div class="flex items-center" :class="compact ? 'gap-1.5' : 'gap-2'">
            <font-awesome-icon
              :icon="!locName || locName === 'Unknown Loc' ? 'fa-solid fa-triangle-exclamation' : 'fa-solid fa-location-dot'"
              :class="[
                compact ? 'text-[10px]' : 'text-xs',
                !locName || locName === 'Unknown Loc' ? 'text-danger' : 'text-primary'
              ]"
            />
            <span
              class="font-bold"
              :class="[
                compact ? 'text-[10px]' : 'text-xs',
                !locName || locName === 'Unknown Loc' ? 'text-danger' : 'text-primary'
              ]"
            >
              {{ locName || 'Stok Kosong / Tidak Diketahui' }}
            </span>
          </div>
        </div>

        <!-- Item Rows -->
        <table class="w-full text-left" :class="compact ? '' : 'text-sm'">
          <tbody class="divide-y divide-secondary/5">
            <tr
              v-for="item in items"
              :key="item.id"
              class="transition-colors"
              :class="[
                compact ? 'group/item' : '',
                hasInsufficientStock(item) ? 'bg-danger/5' : ''
              ]"
            >
              <td :class="compact ? 'pl-3 py-1.5 align-top' : 'pl-4 py-2'">
                <div class="flex flex-col">
                  <div
                    class="font-bold text-text flex items-center gap-1.5"
                    :class="compact ? 'mb-0.5 leading-none' : 'text-xs mb-0.5'"
                  >
                    <span class="hover:text-primary transition-colors">{{ item.sku }}</span>
                    <button
                      type="button"
                      @click.stop="copyToClipboard(item.sku, 'SKU')"
                      class="text-text/30 hover:text-primary w-6 h-6 flex items-center justify-center rounded hover:bg-secondary/10 transition-colors shrink-0"
                      :class="compact ? 'text-[9px]' : 'text-[10px]'"
                      title="Salin SKU"
                    >
                      <font-awesome-icon icon="fa-solid fa-copy" />
                    </button>
                    <span
                      v-if="isInvoiceSelected && isItemAllowed(item)"
                      class="text-primary"
                      :class="compact ? 'text-[9px]' : 'text-[10px]'"
                    >
                      <font-awesome-icon icon="fa-solid fa-check-circle" />
                    </span>
                  </div>

                  <div
                    class="text-text/60 leading-tight transition-all"
                    :class="[
                      compact
                        ? 'text-[9px] line-clamp-1 group-hover/item:line-clamp-none'
                        : 'text-[10px] line-clamp-2'
                    ]"
                  >
                    {{ item.product_name }}
                  </div>

                  <!-- Warning Defisit Stok -->
                  <div
                    v-if="hasInsufficientStock(item) && item.location_code"
                    class="text-danger font-bold mt-0.5 flex items-center gap-1"
                    :class="compact ? 'text-[9px]' : 'text-[9px] mt-1'"
                  >
                    <font-awesome-icon icon="fa-solid fa-triangle-exclamation" :class="compact ? 'text-[8px]' : ''" />
                    {{ compact ? `Kurang: ${item.available_stock} / ${item.quantity}` : `Stok Kurang: ${item.available_stock} (Butuh ${item.quantity})` }}
                  </div>
                  <div
                    v-else-if="!item.location_code"
                    class="text-[9px] text-danger font-bold"
                    :class="compact ? 'mt-0.5' : 'mt-1'"
                  >
                    Lokasi tidak ditemukan
                  </div>
                </div>
              </td>

              <!-- Qty -->
              <td
                class="text-right align-top"
                :class="compact ? 'px-3 py-1.5 w-12' : 'px-4 py-2 w-16'"
              >
                <span
                  class="font-bold"
                  :class="[
                    compact ? '' : 'text-sm',
                    hasInsufficientStock(item) ? 'text-danger' : 'text-text'
                  ]"
                >
                  {{ item.quantity }}
                </span>
                <span class="text-text/40 ml-0.5" :class="compact ? 'text-[8px]' : 'text-[9px]'">pcs</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>
