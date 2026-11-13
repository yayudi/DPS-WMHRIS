<script setup>
import { ref } from 'vue'
import { useLocalStorage } from '@vueuse/core'
import { useToast } from '@/core/presentation/composables/useToast'
import { useI18n } from '@/core/presentation/composables/useI18n'
import { productApi } from '@/modules/master_data/infrastructure/product.api'
import { stockApi } from '@/modules/wms/infrastructure/stock.api'
import BaseSelect from '@/core/presentation/components/ui/BaseSelect.vue'
import { useMobile } from '@/core/presentation/composables/useMobile'
import { useBatchClipboard } from '@/modules/wms/presentation/composables/useBatchClipboard'
import ProductSearchSelector from '@/modules/wms/presentation/components/transfer/ProductSearchSelector.vue'

const { isMobile } = useMobile()
const { copyBatchToClipboard } = useBatchClipboard()

const props = defineProps({
  allLocations: { type: Array, required: true },
  isLoadingLocations: { type: Boolean, default: false }
})

const { toast } = useToast()
const { t } = useI18n()

const batchList = useLocalStorage('draft-ml-batch', [])
const notes = useLocalStorage('draft-ml-notes', '')
const isSubmitting = ref(false)

// --- STATE FORM PENAMBAHAN ---
const selectedProduct = ref(null)
const isLocationLocked = ref(true)
const productSearchRef = ref(null)

const stockDetails = ref([]) // Stok untuk produk yang dipilih
const isLoadingDetails = ref(false)

const objectSerializer = {
  read: (v) => {
    try {
      return v === 'null' || !v ? null : JSON.parse(v)
    } catch {
      return null
    }
  },
  write: (v) => JSON.stringify(v)
}

const fromLocation = useLocalStorage('draft-ml-from', null, { serializer: objectSerializer })
const toLocation = useLocalStorage('draft-ml-to', null, { serializer: objectSerializer })
const quantity = useLocalStorage('draft-ml-qty', 1)

// --- FUNGSI FORM PENAMBAHAN ---

async function onProductSelect(product) {
  // Selalu reset lokasi sumber dan stok jika ada perubahan
  fromLocation.value = null
  quantity.value = 1
  stockDetails.value = []

  if (!product) {
    return
  }

  selectedProduct.value = product
  isLoadingDetails.value = true
  try {
    const details = await productApi.fetchProductStockDetails(product.id)
    const validStock = details.filter(item => item.quantity > 0)

    if (validStock.length === 0) {
      toast(t('wms.multi_transfer.no_stock_for_transfer'), 'warning')
      selectedProduct.value = null
    } else {
      stockDetails.value = validStock
    }
  } catch (e) {
    console.error(e)
  } finally {
    isLoadingDetails.value = false
  }
}

function validateQuantity() {
  if (!fromLocation.value) return
  const maxQty = fromLocation.value.quantity
  if (quantity.value > maxQty) {
    quantity.value = maxQty
    toast(t('wms.multi_transfer.qty_exceed_origin', { max: maxQty }), 'warning')
  }
  if (quantity.value < 1) {
    quantity.value = 1
  }
}

function validateBatchItemQuantity(item) {
  if (item.quantity > item.maxQuantity) {
    item.quantity = item.maxQuantity
    toast(t('wms.multi_transfer.qty_exceed_origin', { max: item.maxQuantity }), 'warning')
  }
  if (item.quantity < 1 || isNaN(item.quantity)) {
    item.quantity = 1
  }
}

function onBatchItemLocationChange(item) {
  const newLocation = item.availableStocks.find(loc => loc.location_id === item.fromLocationId)
  if (newLocation) {
    item.fromLocationCode = newLocation.location_code
    item.maxQuantity = newLocation.quantity

    if (item.quantity > item.maxQuantity) {
      item.quantity = item.maxQuantity
      toast(t('wms.multi_transfer.qty_adjusted', { max: item.maxQuantity }), 'warning')
    }
  }

  if (item.fromLocationId === item.toLocationId) {
    toast(t('wms.multi_transfer.same_loc_warning'), 'warning')
  }
}

function onBatchItemToLocationChange(item) {
  const newLocation = props.allLocations.find(loc => loc.id === item.toLocationId)
  if (newLocation) {
    item.toLocationCode = newLocation.code
  }

  if (item.fromLocationId === item.toLocationId) {
    toast(t('wms.multi_transfer.same_loc_warning'), 'warning')
  }
}

// --- FUNGSI BATCH ---

function addItemToBatch() {
  if (!selectedProduct.value || !fromLocation.value || !toLocation.value || quantity.value < 1) {
    toast(t('wms.multi_transfer.incomplete_fields_warning'), 'warning')
    return
  }
  if (fromLocation.value.location_id === toLocation.value.id) {
    toast(t('wms.multi_transfer.same_loc_error'), 'warning')
    return
  }
  if (quantity.value > fromLocation.value.quantity) {
    return
  }

  // Cek duplikat (SKU, Dari, Ke)
  const existing = batchList.value.find(
    item =>
      item.sku === selectedProduct.value.sku &&
      item.fromLocationId === fromLocation.value.location_id &&
      item.toLocationId === toLocation.value.id
  )

  if (existing) {
    existing.quantity += quantity.value
    if (existing.quantity > existing.maxQuantity) {
      existing.quantity = existing.maxQuantity
      toast(t('wms.multi_transfer.max_stock_capped'), 'warning')
    }
  } else {
    batchList.value.push({
      id: crypto.randomUUID(), // ID unik untuk key v-for
      productId: selectedProduct.value.id,
      sku: selectedProduct.value.sku,
      name: selectedProduct.value.name,
      fromLocationId: fromLocation.value.location_id,
      fromLocationCode: fromLocation.value.location_code,
      toLocationId: toLocation.value.id,
      toLocationCode: toLocation.value.code,
      quantity: quantity.value,
      maxQuantity: fromLocation.value.quantity,
      availableStocks: [...stockDetails.value]
    })
  }

  // Reset form penambahan
  selectedProduct.value = null
  stockDetails.value = []
  fromLocation.value = null
  if (!isLocationLocked.value) {
    toLocation.value = null
  }
  quantity.value = 1

  // Kembalikan fokus ke pencarian produk
  if (productSearchRef.value) {
    productSearchRef.value.focusInput()
  }
}

async function copyFromSku() {
  await copyBatchToClipboard(
    batchList.value,
    item => `${item.sku}\t${item.name}\t${item.fromLocationCode}\t${item.toLocationCode}\t${item.quantity}`,
    t('wms.clipboard.copy_success')
  )
}

function removeFromBatch(id) {
  batchList.value = batchList.value.filter(item => item.id !== id)
}

async function submitDetailedBatch() {
  if (batchList.value.length === 0 || isSubmitting.value) {
    return
  }

  const hasInvalidLocations = batchList.value.some(item => item.fromLocationId === item.toLocationId)
  if (hasInvalidLocations) {
    toast(t('wms.multi_transfer.invalid_items_error'), 'danger')
    return
  }

  isSubmitting.value = true
  try {
    const payload = {
      // Kita set type 'TRANSFER', karena ini adalah batch transfer
      type: 'TRANSFER_MULTI',
      notes: notes.value,
      // API /batch-process universal akan menerima ID lokasi di dalam movements
      movements: batchList.value.map(item => ({
        productId: item.productId,
        sku: item.sku,
        quantity: item.quantity,
        fromLocationId: item.fromLocationId,
        toLocationId: item.toLocationId
      }))
    }

    const response = await stockApi.processBatchMovement(payload)
    toast(response.message, 'success')

    // Reset total
    batchList.value = []
    notes.value = ''
  } catch (error) {
    console.error(error) // Auto-added to prevent unused var
  } finally {
    isSubmitting.value = false
  }
}

function hasData() {
  return batchList.value.length > 0 || selectedProduct.value !== null
}

function resetData() {
  batchList.value = []
  selectedProduct.value = null
  fromLocation.value = null
  toLocation.value = null
  quantity.value = 1
  stockDetails.value = []
}

defineExpose({ submitDetailedBatch, hasData, resetData })
</script>

<template>
  <div class="space-y-6">
    <!-- Form Penambahan Item Baru -->
    <div
      class="grid grid-cols-1 md:grid-cols-5 gap-4 items-end p-4 my-4 bg-secondary/50 rounded-xl border border-secondary/20 shadow-sm flex-col relative z-30"
    >
      <!-- Cari Produk -->
      <div class="md:col-span-2">
        <label class="block text-sm font-medium text-text/90 mb-2">{{ t('wms.multi_transfer.search_product_label') }}</label>
        <ProductSearchSelector
          ref="productSearchRef"
          v-model="selectedProduct"
          @update:model-value="onProductSelect"
          :placeholder="t('wms.multi_transfer.search_product_placeholder')"
          :in-stock-only="true"
        />
      </div>

      <!-- Pindahkan Dari -->
      <div>
        <label class="block text-sm font-medium text-text/90 mb-2">{{ t('wms.multi_transfer.from_location_label') }}</label>
        <BaseSelect
          v-model="fromLocation"
          :options="stockDetails"
          :loading="isLoadingDetails"
          :disabled="!selectedProduct || isLoadingDetails"
          label="location_code"
          track-by="location_id"
          :placeholder="t('wms.multi_transfer.select_from_placeholder')"
        >
          <template #option="{ option }">
            <div class="flex justify-between w-full">
              <span>{{ option.location_code }}</span>
              <span class="font-bold">{{ t('wms.multi_transfer.stock_label') }}: {{ option.quantity }}</span>
            </div>
          </template>
          <template #noResult>{{ t('wms.multi_transfer.no_stock_found') }}</template>
        </BaseSelect>
      </div>

      <!-- Ke Lokasi -->
      <div>
        <div class="flex justify-between items-center mb-2">
          <label class="block text-sm font-medium text-text/90">{{ t('common.label.to_location') }}</label>
          <button
            @click="isLocationLocked = !isLocationLocked"
            class="text-[10px] flex items-center gap-1 px-1.5 py-0.5 rounded transition-colors"
            :class="isLocationLocked ? 'bg-primary/10 text-primary font-bold' : 'text-text/40 hover:bg-secondary/20'"
            :title="
              isLocationLocked ? t('wms.multi_transfer.lock_title_locked') : t('wms.multi_transfer.lock_title_unlocked')
            "
          >
            <font-awesome-icon :icon="isLocationLocked ? 'fa-solid fa-lock' : 'fa-solid fa-lock-open'" />
            <span>{{ t('wms.multi_transfer.lock_btn') }}</span>
          </button>
        </div>
        <BaseSelect
          v-model="toLocation"
          :options="allLocations"
          :disabled="isLoadingLocations"
          label="code"
          track-by="id"
          :placeholder="t('wms.multi_transfer.select_to_placeholder')"
        />
      </div>

      <!-- Jumlah & Tombol Tambah -->
      <div class="flex items-end gap-3">
        <div class="flex-grow">
          <label class="block text-sm font-medium text-text/90 mb-2">{{ t('common.label.quantity') }}</label>
          <div class="flex items-center gap-2">
            <input
              v-model.number="quantity"
              @blur="validateQuantity"
              type="number"
              min="1"
              :max="fromLocation ? fromLocation.quantity : undefined"
              class="w-full p-2 border border-secondary/50 rounded-lg bg-background"
              :disabled="!fromLocation"
            />
            <span v-if="fromLocation" class="text-sm text-text/60 whitespace-nowrap"
              >/ {{ fromLocation.quantity }}</span
            >
          </div>
        </div>

        <button
          @click="addItemToBatch"
          class="px-4 py-2 bg-primary text-secondary rounded-lg font-semibold h-[42px] disabled:opacity-50"
          :disabled="!selectedProduct || !fromLocation || !toLocation || quantity < 1"
        >
          <font-awesome-icon icon="fa-solid fa-plus" />
        </button>
      </div>
    </div>

    <!-- Tabel Daftar Batch (Item yang akan ditransfer) -->
    <div class="border-t border-secondary/20 pt-6">
      <h3 class="text-lg font-semibold text-text mb-4">{{ t('wms.multi_transfer.batch_list_title') }} ({{ batchList.length }})</h3>
      <div
        v-if="batchList.length === 0"
        class="text-center text-text/60 py-8 border-2 border-dashed border-secondary/20 rounded-lg"
      >
        {{ t('wms.multi_transfer.empty_items') }}
      </div>
      <div v-else class="max-h-96 overflow-y-auto">
        <table class="text-sm" :class="isMobile ? 'w-full block' : 'min-w-full'">
          <thead :class="isMobile ? 'hidden' : 'bg-secondary/10'">
            <tr>
              <th class="p-2 text-left w-44">SKU</th>
              <th class="p-2 text-left w-[50%] min-w-[200px]">{{ t('common.label.product_name') }}</th>
              <th class="p-2 text-left">{{ t('wms.multi_transfer.th_from') }}</th>
              <th class="p-2 text-left">{{ t('wms.multi_transfer.th_to') }}</th>
              <th class="p-2 text-center w-44">{{ t('common.label.quantity') }}</th>
              <th class="p-2 text-center w-20">{{ t('common.label.action') }}</th>
            </tr>
          </thead>
          <tbody :class="isMobile ? 'block' : 'divide-y divide-secondary/20'">
            <tr
              v-for="item in batchList"
              :key="item.id"
              class="transition-colors relative"
              :class="
                isMobile
                  ? 'block mb-3 p-3 bg-background/50 rounded-xl border border-secondary/20 shadow-sm'
                  : 'hover:bg-primary/5'
              "
            >
              <td
                :class="
                  isMobile ? 'flex justify-between items-center py-1.5 border-b border-secondary/10' : 'p-2 font-mono'
                "
              >
                <span v-if="isMobile" class="text-text/60 text-xs uppercase font-semibold">SKU</span>
                <span class="font-mono">{{ item.sku }}</span>
              </td>
              <td :class="isMobile ? 'flex justify-between items-center py-1.5 border-b border-secondary/10' : 'p-2'">
                <span v-if="isMobile" class="text-text/60 text-xs uppercase font-semibold">{{ t('common.label.product_name') }}</span>
                <span>{{ item.name }}</span>
              </td>
              <td :class="isMobile ? 'flex justify-between items-center py-1.5 border-b border-secondary/10' : 'p-2'">
                <span v-if="isMobile" class="text-text/60 text-xs uppercase font-semibold">{{ t('wms.multi_transfer.th_from') }}</span>
                <select
                  v-model="item.fromLocationId"
                  @change="onBatchItemLocationChange(item)"
                  class="p-1 border border-secondary/50 rounded bg-background text-sm font-mono max-w-[120px] outline-none focus:border-primary"
                  :class="{ 'border-danger text-danger': item.fromLocationId === item.toLocationId }"
                >
                  <option v-for="loc in item.availableStocks" :key="loc.location_id" :value="loc.location_id">
                    {{ loc.location_code }}
                  </option>
                </select>
              </td>
              <td
                :class="
                  isMobile ? 'flex justify-between items-center py-1.5 border-b border-secondary/10' : 'p-2 font-mono'
                "
              >
                <span v-if="isMobile" class="text-text/60 text-xs uppercase font-semibold">{{ t('wms.multi_transfer.th_to') }}</span>
                <select
                  v-model="item.toLocationId"
                  @change="onBatchItemToLocationChange(item)"
                  class="p-1 border border-secondary/50 rounded bg-background text-sm font-mono max-w-[120px] outline-none focus:border-primary"
                  :class="{ 'border-danger text-danger': item.fromLocationId === item.toLocationId }"
                >
                  <option v-for="loc in allLocations" :key="loc.id" :value="loc.id">
                    {{ loc.code }}
                  </option>
                </select>
              </td>
              <td
                :class="
                  isMobile ? 'flex justify-between items-center py-1.5 border-b border-secondary/10' : 'p-2 text-center'
                "
              >
                <span v-if="isMobile" class="text-text/60 text-xs uppercase font-semibold">{{ t('common.label.quantity') }}</span>
                <div class="flex items-center" :class="isMobile ? 'justify-end gap-2' : 'justify-center gap-2'">
                  <input
                    v-model.number="item.quantity"
                    @blur="validateBatchItemQuantity(item)"
                    type="number"
                    min="1"
                    :max="item.maxQuantity"
                    class="w-20 p-1 border border-secondary/50 rounded bg-background text-center font-bold"
                  />
                  <span class="text-xs text-text/60 whitespace-nowrap select-none">/ {{ item.maxQuantity }}</span>
                </div>
              </td>
              <td :class="isMobile ? 'pt-3 mt-2 border-t border-secondary/10 block' : 'p-2 text-center'">
                <button
                  @click="removeFromBatch(item.id)"
                  :class="
                    isMobile
                      ? 'text-accent hover:bg-accent/10 flex items-center justify-center gap-2 w-full py-2 bg-accent/5 rounded-lg transition-colors'
                      : 'text-accent hover:text-accent/80'
                  "
                >
                  <font-awesome-icon icon="fa-solid fa-trash" />
                  <span v-if="isMobile" class="text-sm font-semibold">{{ t('wms.multi_transfer.delete_item') }}</span>
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Catatan & Tombol Aksi Final -->
    <div
      class="pt-6 border-t border-secondary/20 gap-4"
      :class="isMobile ? 'flex flex-col' : 'flex justify-between items-end'"
    >
      <!-- Input Catatan -->
      <div class="flex-grow">
        <label class="block text-sm font-medium text-text/90 mb-2">{{ t('wms.multi_transfer.notes_label') }}</label>
        <input
          v-model="notes"
          type="text"
          :placeholder="t('wms.multi_transfer.notes_placeholder')"
          class="w-full p-2 border border-secondary rounded-lg bg-secondary/20 h-[42px]"
        />
      </div>

      <!-- Tombol Aksi -->
      <div class="flex gap-2">
        <!-- Salin daftar transfer -->
        <button
          @click="copyFromSku()"
          :disabled="isSubmitting || batchList.length === 0"
          class="px-6 py-3 bg-accent text-secondary rounded-lg font-bold disabled:opacity-50"
        >
          <font-awesome-icon icon="fa-solid fa-copy" />
          {{ t('wms.multi_transfer.btn_copy_list') }}
        </button>
        <button
          @click="batchList = []"
          :disabled="isSubmitting || batchList.length === 0"
          class="px-6 py-3 bg-danger text-secondary rounded-lg font-bold disabled:opacity-50"
        >
          <font-awesome-icon icon="fa-solid fa-trash" />
          {{ t('common.btn.cancel') }}
        </button>
        <button
          @click="submitDetailedBatch"
          :disabled="isSubmitting || batchList.length === 0"
          class="px-6 py-3 bg-primary text-secondary rounded-lg font-bold disabled:opacity-50 flex items-center gap-3 group"
        >
          <font-awesome-icon v-if="isSubmitting" icon="fa-solid fa-spinner" class="animate-spin" />
          <span>{{ isSubmitting ? t('common.processing') : t('wms.multi_transfer.btn_submit') }}</span>
          <kbd
            v-if="!isSubmitting"
            class="hidden md:inline-block ml-1 px-1.5 py-0.5 text-[10px] bg-secondary/20 text-secondary border border-secondary/30 rounded font-mono shadow-sm group-hover:bg-secondary/30 transition-colors"
            >Alt+S</kbd
          >
        </button>
      </div>
    </div>
  </div>
</template>
