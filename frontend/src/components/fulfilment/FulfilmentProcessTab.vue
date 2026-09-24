<script setup>
import { computed, ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { swalConfirm } from '@/composables/useSweetAlert'
import { useAuthStore } from '@/stores/auth'
import { useFulfilmentCardState } from '@/composables/useFulfilmentCardState'
import { useFulfilmentStore } from '@/stores/fulfilment'
import logoTokopedia from '@/assets/img/tokopedia.svg'
import logoShopee from '@/assets/img/shopee.svg'
import { formatDate } from '@/api/helpers/time.js'
import { onClickOutside } from '@vueuse/core'
import { completeFulfilmentItems, voidFulfilmentList } from '@/api/helpers/fulfilment.js'
import { useToast } from '@/composables/useToast.js'

const authStore = useAuthStore()
const router = useRouter()
const fulfilmentStore = useFulfilmentStore()
const { toast } = useToast()

const inv = computed(() => fulfilmentStore.selectedInvoice)

onMounted(() => {
  if (!inv.value) {
    router.replace({ name: 'WMSFulfilmentTasks' })
  }
})

// Create a wrapper for the props-like object needed by useFulfilmentCardState
const fakeProps = computed(() => ({ inv: inv.value || {} }))

const { totalSKU, canProcess, canCancel, canForceComplete, hasInsufficientStock, getMpStatusBadge } =
  useFulfilmentCardState(fakeProps, authStore)

const isLoading = ref(false)

const actionConfig = computed(() => {
  if (!inv.value) return {}
  const status = inv.value.status || 'PENDING'
  if (status === 'BACKORDER') {
    return {
      action: 'force_complete',
      label: 'Stok Kosong (Backorder)',
      icon: 'fa-exclamation-triangle',
      colorClass: 'bg-danger border-danger text-white hover:bg-danger/90'
    }
  } else if (status === 'PENDING' || status === 'READY TO CHECK' || status === 'READY TO PICK') {
    return {
      action: 'pick',
      label: 'Pick',
      icon: 'fa-box-open',
      colorClass: 'bg-primary border-primary text-white hover:bg-primary/90'
    }
  } else if (status === 'PICKED' || status === 'VALIDATED' || status === 'READY TO PACK') {
    return {
      action: 'pack',
      label: 'Pack',
      icon: 'fa-box',
      colorClass: 'bg-warning border-warning text-white hover:bg-warning/90'
    }
  } else if (status === 'PACKED' || status === 'READY TO SHIP') {
    return {
      action: 'ship',
      label: 'Ship',
      icon: 'fa-truck-fast',
      colorClass: 'bg-success border-success text-white hover:bg-success/90'
    }
  }
  return {
    action: 'force_complete',
    label: 'Selesaikan',
    icon: 'fa-check',
    colorClass: 'bg-primary border-primary text-white hover:bg-primary/90'
  }
})

const isDropdownOpen = ref(false)
const dropdownRef = ref(null)

onClickOutside(dropdownRef, () => {
  isDropdownOpen.value = false
})

function toggleDropdown() {
  isDropdownOpen.value = !isDropdownOpen.value
}

async function onCompleteInvoice(actionName) {
  isDropdownOpen.value = false
  const name = actionName || actionConfig.value.action
  let actionLabel = actionConfig.value.label
  if (name === 'force_complete') actionLabel = 'Force Complete (Bypass)'

  const msg = `${actionLabel} untuk pesanan ${inv.value.original_invoice_id}?`
  if (!(await swalConfirm(msg))) return

  isLoading.value = true
  try {
    const allItems = []
    if (inv.value.locations) {
      Object.values(inv.value.locations).forEach(items => items.forEach(item => allItems.push(item)))
    } else if (inv.value.items) {
      inv.value.items.forEach(item => allItems.push(item))
    }

    const payloadItems = allItems.map(item => ({
      id: item.id,
      fulfilment_list_id: item.fulfilment_list_id,
      product_id: item.product_id,
      quantity: item.quantity,
      location_id: item.suggested_location_id
    }))

    const res = await completeFulfilmentItems({ items: payloadItems, action: name })
    if (res.success) {
      toast(res.message, 'success')
      router.push({ name: 'WMSFulfilmentTasks' })
    } else {
      toast(res.message || 'Gagal menyelesaikan pesanan.', 'warning')
    }
  } catch (error) {
    console.error(error)
    const errData = error.response?.data || error
    if (errData.errors && errData.errors.length > 0) {
      toast(errData.errors[0], 'error')
    } else {
      toast(errData.message || 'Terjadi kesalahan sistem.', 'error')
    }
  } finally {
    isLoading.value = false
  }
}

async function onVoidInvoice() {
  const msg = `Void pesanan ${inv.value.original_invoice_id}?\nSemua status item akan dikembalikan ke stok.`
  if (!(await swalConfirm(msg))) return
  try {
    isLoading.value = true
    const res = await voidFulfilmentList(inv.value.fulfilment_list_id || inv.value.id)
    toast(res.message || 'Fulfilment berhasil divoid', 'success')
    router.push({ name: 'WMSFulfilmentTasks' })
  } catch (error) {
    console.error(error)
    toast(error.message || 'Gagal mem-void Fulfilment', 'error')
  } finally {
    isLoading.value = false
  }
}

const sourceBgClass = computed(() => {
  if (!inv.value) return 'bg-secondary'
  const source = inv.value.source?.toLowerCase()
  if (source === 'tokopedia') return 'bg-success'
  if (source === 'shopee') return 'bg-warning'
  return 'bg-secondary'
})
</script>

<template>
  <div v-if="inv" class="animate-fade-in text-text transition-colors duration-300">
    <div class="mb-4">
      <router-link
        :to="{ name: 'WMSFulfilmentTasks' }"
        class="flex items-center gap-2 text-sm font-bold text-text/60 hover:text-primary transition-colors"
      >
        <font-awesome-icon icon="fa-solid fa-arrow-left" />
        Kembali ke Daftar Tugas
      </router-link>
    </div>

    <div class="bg-background border border-secondary/20 rounded-xl overflow-hidden shadow-sm flex flex-col mb-4">
      <!-- HEADER CARD (Invoice details) -->
      <div class="px-5 py-4 flex flex-col border-b bg-secondary/5 relative">
        <div class="absolute left-0 top-0 bottom-0 w-1" :class="sourceBgClass"></div>

        <div class="flex items-center justify-between mb-3 pl-2">
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
          <span
            v-if="inv.marketplace_status && inv.marketplace_status !== 'NEW'"
            class="text-[10px] font-bold px-3 py-1 rounded-full shadow-sm flex items-center gap-1"
            :class="getMpStatusBadge(inv.marketplace_status)?.class || 'bg-primary/10 text-primary'"
          >
            <font-awesome-icon :icon="`fa-solid ${getMpStatusBadge(inv.marketplace_status)?.icon || 'fa-box'}`" />
            {{ getMpStatusBadge(inv.marketplace_status)?.label || inv.marketplace_status }}
          </span>
          <div class="flex flex-col text-right">
            <span class="text-lg font-black text-text leading-none block">{{ totalSKU }}</span>
            <span class="text-[9px] text-text/40 uppercase font-bold">Total SKU</span>
          </div>
        </div>

        <div class="pl-2 mb-4">
          <div class="text-[10px] text-text/50 uppercase tracking-wider mb-1">Sales Invoice No</div>
          <h3
            class="text-xl font-black text-text hover:text-primary transition-colors cursor-text select-text"
            :title="inv.invoice_no || inv.invoice"
          >
            {{ inv.invoice_no || inv.invoice || '-' }}
          </h3>
          <div class="mt-2 text-sm text-text/80 flex items-center gap-2">
            <span class="text-text/50">Sync Order ID</span>
            <span class="font-bold select-all">{{ inv.original_invoice_id || '-' }}</span>
          </div>
        </div>

        <div class="pl-2 grid grid-cols-2 md:grid-cols-4 gap-4 mb-4 pb-4 border-b border-secondary/10">
          <div>
            <div class="text-[10px] text-text/50 uppercase mb-0.5">Transaction Date</div>
            <div class="text-sm font-semibold text-text">{{ formatDate(inv.order_date, false, false) }}</div>
          </div>
          <div>
            <div class="text-[10px] text-text/50 uppercase mb-0.5">Shop Name</div>
            <div class="text-sm font-semibold text-text">{{ inv.shop_name || '-' }}</div>
          </div>
          <div>
            <div class="text-[10px] text-text/50 uppercase mb-0.5">Expedition</div>
            <div class="text-sm font-semibold text-text">{{ inv.courier || '-' }}</div>
          </div>
          <div>
            <div class="text-[10px] text-text/50 uppercase mb-0.5">Tracking Number (AWB)</div>
            <div class="text-sm font-semibold text-text select-all">{{ inv.awb || '-' }}</div>
          </div>
          <div>
            <div class="text-[10px] text-text/50 uppercase mb-0.5">Location Purpose</div>
            <div class="text-sm font-semibold text-text">{{ inv.location_purpose || '-' }}</div>
          </div>
          <div>
            <div class="text-[10px] text-text/50 uppercase mb-0.5">Marketplace Status</div>
            <div class="text-sm font-semibold text-text">{{ inv.marketplace_status || '-' }}</div>
          </div>
          <div>
            <div class="text-[10px] text-text/50 uppercase mb-0.5">Order Creation</div>
            <div class="text-sm font-semibold text-text">{{ formatDate(inv.created_at, true, false) }}</div>
          </div>
          <div>
            <div class="text-[10px] text-text/50 uppercase mb-0.5">Item Count</div>
            <div class="text-sm font-semibold text-text">{{ totalSKU }} SKU</div>
          </div>
        </div>

        <div class="pl-2 flex items-center justify-between">
          <div class="flex items-center gap-2">
            <div v-if="canProcess" class="relative inline-flex shadow-sm rounded-lg" ref="dropdownRef">
              <button
                @click.stop="onCompleteInvoice(actionConfig.action)"
                :disabled="isLoading"
                :class="[actionConfig.colorClass]"
                class="group relative inline-flex items-center gap-1.5 rounded-l-lg border px-4 py-1.5 text-xs font-bold transition-all hover:shadow-lg active:scale-95 disabled:opacity-50"
                :title="actionConfig.label"
              >
                <font-awesome-icon :icon="`fa-solid ${actionConfig.icon}`" />
                <span>{{ actionConfig.label }}</span>
              </button>

              <button
                v-if="canForceComplete"
                @click.stop="toggleDropdown"
                :disabled="isLoading"
                :class="[actionConfig.colorClass]"
                class="group relative inline-flex items-center rounded-r-lg border-l-0 border px-2 py-1.5 transition-all hover:brightness-90 active:scale-95 disabled:opacity-50"
              >
                <font-awesome-icon icon="fa-solid fa-chevron-down" class="text-[10px]" />
              </button>

              <div
                v-if="isDropdownOpen && canForceComplete"
                class="absolute right-0 top-full mt-1 z-10 w-48 origin-top-right rounded-md bg-surface border border-border shadow-lg focus:outline-none"
              >
                <div class="py-1">
                  <button
                    @click.stop="onCompleteInvoice('force_complete')"
                    class="flex w-full items-center gap-2 px-4 py-2 text-sm text-text font-semibold hover:bg-surface-elevated hover:text-primary transition-colors"
                  >
                    <font-awesome-icon icon="fa-solid fa-bolt" class="text-warning" />
                    Force Complete
                  </button>
                </div>
              </div>
            </div>

            <button
              v-if="canCancel && inv.status !== 'VOID'"
              @click.stop="onVoidInvoice"
              :disabled="isLoading"
              class="group flex items-center gap-1.5 rounded border border-danger bg-danger/10 px-3 py-1.5 text-xs font-bold text-danger/50 transition-colors hover:text-danger disabled:opacity-50"
            >
              <font-awesome-icon :icon="isLoading ? 'fa-solid fa-spinner' : 'fa-solid fa-ban'" :spin="isLoading" />
              <span>Void</span>
            </button>
          </div>
        </div>
      </div>

      <!-- ITEM LIST -->
      <div class="divide-y divide-secondary/10">
        <div v-for="(items, locName) in inv.locations" :key="locName" class="relative z-10">
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

          <div class="divide-y divide-secondary/5">
            <div
              v-for="item in items"
              :key="item.id"
              class="transition-colors p-4 flex items-center gap-4"
              :class="hasInsufficientStock(item) ? 'bg-danger/5' : ''"
            >
              <div
                class="w-16 h-16 bg-secondary/20 rounded-lg flex items-center justify-center shrink-0 border border-secondary/10"
              >
                <font-awesome-icon icon="fa-solid fa-image" class="text-text/20 text-2xl" />
              </div>
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
              <div class="flex flex-col items-end justify-center shrink-0">
                <div class="font-black text-xl mb-2" :class="hasInsufficientStock(item) ? 'text-danger' : 'text-text'">
                  x {{ item.quantity }} <span class="text-xs text-text/40 font-normal">Pcs</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <!-- KELJA TIMELINE (Same as History Tab) -->
      <div
        v-if="inv.kelja_histories && inv.kelja_histories.length > 0"
        class="px-5 py-4 bg-secondary/5 border-t border-secondary/10"
      >
        <p class="text-[10px] font-bold text-text/40 uppercase mb-3">History :</p>
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
                  class="px-2 py-0.5 rounded-full text-[10px] font-bold"
                  :style="{
                    backgroundColor: `color-mix(in srgb, ${log.status?.property_color || 'gray'} 10%, transparent)`,
                    color: log.status?.property_color || 'gray',
                    border: `1px solid color-mix(in srgb, ${log.status?.property_color || 'gray'} 30%, transparent)`
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
  </div>
</template>
