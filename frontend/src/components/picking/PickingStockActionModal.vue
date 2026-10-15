<!-- frontend/src/components/picking/PickingStockActionModal.vue -->
<script setup>
import { ref, computed, watch } from 'vue'
import { useMasterDataStore } from '@/stores/masterData'
import { transferStock } from '@/api/helpers/stock'
import { createStockRequest } from '@/api/helpers/stockRequest'
import { useToast } from '@/composables/useToast'
import { swalConfirm } from '@/composables/useSweetAlert'
import BaseModal from '@/components/ui/BaseModal.vue'

const props = defineProps({
  isOpen: {
    type: Boolean,
    default: false
  },
  actionType: {
    type: String,
    default: 'TRANSFER' // 'TRANSFER' | 'REQUEST'
  },
  itemData: {
    type: Object,
    default: () => null
  },
  orderData: {
    type: Object,
    default: () => null
  }
})

const emit = defineEmits(['close', 'success'])
const { toast } = useToast()
const masterData = useMasterDataStore()

const isLoading = ref(false)
const allLocations = ref([])

// Form Fields
const fromLocationId = ref(null)
const toLocationId = ref(null)
const quantity = ref(1)
const notes = ref('')

// Load all locations for destination selection
watch(
  () => props.isOpen,
  async open => {
    if (!open || !props.itemData) return

    try {
      const locs = await masterData.getLocations()
      allLocations.value = Array.isArray(locs) ? locs : []
    } catch (err) {
      console.error('Failed to load master locations:', err)
      allLocations.value = []
    }

    initFormData()
  },
  { immediate: true }
)

// List of source locations with available stock
const availableSourceLocations = computed(() => {
  if (!props.itemData?.locations) return []
  return props.itemData.locations.filter(l => Number(l.quantity) > 0)
})

// List of target display locations
const displayTargetLocations = computed(() => {
  return allLocations.value.filter(l => String(l.purpose).toUpperCase() === 'DISPLAY')
})

// Fallback all target locations if none with purpose DISPLAY
const targetLocationOptions = computed(() => {
  return displayTargetLocations.value.length > 0 ? displayTargetLocations.value : allLocations.value
})

// Selected Source Location Object
const selectedSourceLocation = computed(() => {
  return availableSourceLocations.value.find(l => l.locationId === Number(fromLocationId.value))
})

const maxAvailableStock = computed(() => {
  return selectedSourceLocation.value ? Number(selectedSourceLocation.value.quantity) : 0
})

function initFormData() {
  const item = props.itemData
  const order = props.orderData

  if (!item) return

  // 1. Determine Source Location (Prefer warehouse/non-display with highest stock)
  const sources = availableSourceLocations.value
  if (sources.length > 0) {
    // Sort descending by quantity
    const sorted = [...sources].sort((a, b) => b.quantity - a.quantity)
    fromLocationId.value = sorted[0].locationId
  } else {
    fromLocationId.value = null
  }

  // 2. Determine Target Location (Prefer existing item location with DISPLAY purpose)
  const existingDisplayLoc = item.locations?.find(l => {
    const match = allLocations.value.find(al => al.id === l.locationId)
    return match && String(match.purpose).toUpperCase() === 'DISPLAY'
  })

  if (existingDisplayLoc) {
    toLocationId.value = existingDisplayLoc.locationId
  } else if (displayTargetLocations.value.length > 0) {
    toLocationId.value = displayTargetLocations.value[0].id
  } else if (allLocations.value.length > 0) {
    toLocationId.value = allLocations.value[0].id
  } else {
    toLocationId.value = null
  }

  // 3. Determine Quantity
  if (order && order.quantity) {
    quantity.value = Number(order.quantity)
  } else {
    const needed = Math.abs(Number(item.deficit)) || Number(item.totalRequired) || 1
    const available = sources.length > 0 ? sources[0].quantity : needed
    quantity.value = Math.min(needed, available) || 1
  }

  // 4. Determine Notes
  const isTransfer = props.actionType === 'TRANSFER'
  if (order && order.invoiceId) {
    notes.value = isTransfer
      ? `Transfer cepat display untuk invoice ${order.invoiceId} (SKU ${item.sku})`
      : `Permintaan stok display invoice ${order.invoiceId} (SKU ${item.sku})`
  } else {
    notes.value = isTransfer
      ? `Transfer cepat display pemenuhan picking list SKU ${item.sku}`
      : `Permintaan restock display pemenuhan picking list SKU ${item.sku}`
  }
}

function setMaxQty() {
  if (selectedSourceLocation.value) {
    quantity.value = selectedSourceLocation.value.quantity
  }
}

function setDeficitQty() {
  const needed = props.orderData ? Number(props.orderData.quantity) : Math.abs(Number(props.itemData?.deficit)) || 1
  quantity.value = Math.min(needed, maxAvailableStock.value) || 1
}

async function handleSubmit() {
  if (!fromLocationId.value) {
    toast.error('Pilih lokasi asal dengan stok tersedia.')
    return
  }
  if (!toLocationId.value) {
    toast.error('Pilih lokasi tujuan display.')
    return
  }
  if (fromLocationId.value === toLocationId.value) {
    toast.error('Lokasi asal dan lokasi tujuan tidak boleh sama.')
    return
  }
  if (!quantity.value || quantity.value <= 0) {
    toast.error('Kuantitas transfer harus lebih dari 0.')
    return
  }
  if (quantity.value > maxAvailableStock.value) {
    toast.error(`Kuantitas melebihi stok yang tersedia (${maxAvailableStock.value} unit).`)
    return
  }

  const isTransfer = props.actionType === 'TRANSFER'
  const actionTitle = isTransfer ? 'Konfirmasi Transfer Cepat?' : 'Kirim Permintaan Stok?'
  const actionDesc = isTransfer
    ? `Pindahkan ${quantity.value} unit ${props.itemData.sku} dari lokasi ${selectedSourceLocation.value?.locationCode} ke lokasi tujuan?`
    : `Buat permintaan ${quantity.value} unit ${props.itemData.sku} untuk diproses bagian gudang?`

  const confirmed = await swalConfirm(actionTitle, actionDesc, isTransfer ? 'Ya, Transfer' : 'Ya, Kirim', 'Batal')
  if (!confirmed) return

  isLoading.value = true
  try {
    if (isTransfer) {
      await transferStock({
        productId: props.itemData.productId,
        fromLocationId: fromLocationId.value,
        toLocationId: toLocationId.value,
        quantity: quantity.value,
        notes: notes.value
      })
      toast.success(`Berhasil mentransfer ${quantity.value} unit ke display!`)
    } else {
      await createStockRequest({
        fromLocationId: fromLocationId.value,
        toLocationId: toLocationId.value,
        notes: notes.value,
        items: [
          {
            productId: props.itemData.productId,
            quantity: quantity.value
          }
        ]
      })
      toast.success('Permintaan stok berhasil diajukan!')
    }

    emit('success', {
      actionType: props.actionType,
      sku: props.itemData.sku,
      quantity: quantity.value
    })
    emit('close')
  } catch (error) {
    console.error('Action failed:', error)
    toast.error(error?.message || 'Gagal memproses aksi stok.')
  } finally {
    isLoading.value = false
  }
}
</script>

<template>
  <Teleport to="body">
    <BaseModal :show="isOpen" max-width="max-w-lg" @close="emit('close')">
      <!-- Custom Header Title Slot -->
      <template #title>
        <div class="flex items-center gap-2.5">
          <div
            class="w-9 h-9 rounded-xl flex items-center justify-center shadow-sm text-xs"
            :class="actionType === 'TRANSFER' ? 'bg-primary text-secondary' : 'bg-warning text-white'"
          >
            <font-awesome-icon :icon="actionType === 'TRANSFER' ? 'fa-solid fa-bolt' : 'fa-solid fa-clipboard-list'" />
          </div>
          <div>
            <h3 class="font-bold text-sm text-text leading-tight">
              {{ actionType === 'TRANSFER' ? 'Transfer Cepat ke Display' : 'Buat Permintaan Stok (Stock Request)' }}
            </h3>
            <p class="text-[11px] text-text/60 font-normal mt-0.5">
              {{
                actionType === 'TRANSFER'
                  ? 'Pindahkan stok fisik dari gudang langsung ke rak display'
                  : 'Ajukan form permintaan stok agar disiapkan oleh tim gudang'
              }}
            </p>
          </div>
        </div>
      </template>

      <!-- Content Body -->
      <div class="space-y-4 pt-1">
        <!-- Product Context Card -->
        <div class="p-3.5 bg-secondary/10 border border-secondary/20 rounded-xl space-y-2">
          <div class="flex items-start justify-between gap-2">
            <div>
              <span class="font-mono font-bold text-sm text-primary">{{ itemData?.sku }}</span>
              <p class="text-xs text-text/80 line-clamp-1 mt-0.5 font-medium">
                {{ itemData?.productName || itemData?.sku }}
              </p>
            </div>
            <span
              v-if="orderData"
              class="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-accent/20 text-accent border border-accent/30"
            >
              Inv: {{ orderData.invoiceId }}
            </span>
          </div>

          <!-- Stock Summary Badges -->
          <div class="grid grid-cols-3 gap-2 pt-1 border-t border-secondary/15 text-xs">
            <div>
              <span class="text-[10px] text-text/50 block">Kebutuhan</span>
              <span class="font-bold text-text">
                {{ orderData ? orderData.quantity : itemData?.totalRequired }} Unit
              </span>
            </div>
            <div>
              <span class="text-[10px] text-text/50 block">Stok Gudang</span>
              <span class="font-bold text-success">{{ itemData?.totalStock }} Unit</span>
            </div>
            <div>
              <span class="text-[10px] text-text/50 block">Defisit Display</span>
              <span class="font-bold text-danger">
                {{ itemData?.deficit < 0 ? Math.abs(itemData?.deficit) : 0 }} Unit
              </span>
            </div>
          </div>
        </div>

        <!-- Form Fields -->
        <div class="space-y-3.5 text-xs">
          <!-- 1. Lokasi Asal (Sumber Stok Gudang) -->
          <div>
            <label class="flex items-center justify-between font-semibold text-text mb-1">
              <span>Lokasi Asal (Sumber Stok)</span>
              <span v-if="selectedSourceLocation" class="text-[11px] text-primary font-normal">
                Tersedia: <strong>{{ selectedSourceLocation.quantity }} unit</strong>
              </span>
            </label>
            <select
              v-model="fromLocationId"
              class="w-full bg-secondary/10 border border-secondary/25 rounded-lg px-3 py-2 text-text focus:outline-none focus:border-primary text-xs"
            >
              <option :value="null" disabled>Pilih Lokasi Sumber</option>
              <option v-for="loc in availableSourceLocations" :key="loc.locationId" :value="loc.locationId">
                {{ loc.locationCode }} (Stok: {{ loc.quantity }} unit)
              </option>
            </select>
            <p v-if="availableSourceLocations.length === 0" class="text-danger text-[11px] mt-1">
              Tidak ada lokasi yang memiliki stok fisik untuk produk ini.
            </p>
          </div>

          <!-- 2. Lokasi Tujuan (Display) -->
          <div>
            <label class="block font-semibold text-text mb-1"> Lokasi Tujuan (Display) </label>
            <select
              v-model="toLocationId"
              class="w-full bg-secondary/10 border border-secondary/25 rounded-lg px-3 py-2 text-text focus:outline-none focus:border-primary text-xs"
            >
              <option :value="null" disabled>Pilih Lokasi Display Tujuan</option>
              <option v-for="loc in targetLocationOptions" :key="loc.id" :value="loc.id">
                {{ loc.code }} ({{ loc.purpose || 'DISPLAY' }})
              </option>
            </select>
          </div>

          <!-- 3. Kuantitas -->
          <div>
            <div class="flex items-center justify-between mb-1">
              <label class="font-semibold text-text">Kuantitas Transfer / Minta</label>
              <div class="flex items-center gap-1.5">
                <button
                  type="button"
                  @click="setDeficitQty"
                  class="text-[10px] text-primary hover:underline font-medium"
                >
                  Sesuai Defisit
                </button>
                <span class="text-text/30">•</span>
                <button type="button" @click="setMaxQty" class="text-[10px] text-primary hover:underline font-medium">
                  Semua Stok ({{ maxAvailableStock }})
                </button>
              </div>
            </div>
            <div class="relative">
              <input
                v-model.number="quantity"
                type="number"
                min="1"
                :max="maxAvailableStock"
                class="w-full bg-secondary/10 border border-secondary/25 rounded-lg px-3 py-2 text-text focus:outline-none focus:border-primary font-bold"
              />
              <span class="absolute right-3 top-2 text-text/40 font-medium">Unit</span>
            </div>
          </div>

          <!-- 4. Catatan -->
          <div>
            <label class="block font-semibold text-text mb-1">Catatan Tambahan (Opsional)</label>
            <textarea
              v-model="notes"
              rows="2"
              class="w-full bg-secondary/10 border border-secondary/25 rounded-lg px-3 py-2 text-text focus:outline-none focus:border-primary resize-none"
              placeholder="Tulis keterangan untuk transfer/permintaan stok..."
            ></textarea>
          </div>
        </div>
      </div>

      <!-- Footer Buttons Slot -->
      <template #footer>
        <button
          type="button"
          @click="emit('close')"
          :disabled="isLoading"
          class="px-4 py-2 border border-secondary/30 hover:bg-secondary/20 text-text rounded-lg text-xs font-semibold transition-all disabled:opacity-50"
        >
          Batal
        </button>
        <button
          type="button"
          @click="handleSubmit"
          :disabled="isLoading || !fromLocationId || !toLocationId || availableSourceLocations.length === 0"
          class="px-4 py-2 rounded-lg text-xs font-bold flex items-center gap-2 transition-all shadow-md disabled:opacity-50"
          :class="
            actionType === 'TRANSFER'
              ? 'bg-primary text-secondary hover:brightness-110'
              : 'bg-warning text-white hover:brightness-110'
          "
        >
          <font-awesome-icon
            :icon="
              isLoading
                ? 'fa-solid fa-circle-notch'
                : actionType === 'TRANSFER'
                  ? 'fa-solid fa-bolt'
                  : 'fa-solid fa-clipboard-check'
            "
            :spin="isLoading"
          />
          <span>{{
            isLoading ? 'Memproses...' : actionType === 'TRANSFER' ? 'Konfirmasi Transfer' : 'Kirim Permintaan'
          }}</span>
        </button>
      </template>
    </BaseModal>
  </Teleport>
</template>
