<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import BaseModal from '@/core/presentation/components/ui/BaseModal.vue'
import BaseSelect from '@/core/presentation/components/ui/BaseSelect.vue'
import type {
  OnHoldFulfillmentSummary,
  ReplenishmentDeficit,
  SuggestedReplenishmentSource,
  ManualTransferPayload
} from '../../../domain/replenishment.entity'
import type { StockLocation } from '../../../domain/stock.entity'

interface Props {
  show: boolean
  context: {
    fulfillment: OnHoldFulfillmentSummary
    deficit: ReplenishmentDeficit
    source?: SuggestedReplenishmentSource
  } | null
  locations: StockLocation[]
  loading?: boolean
}

const props = defineProps<Props>()
const emit = defineEmits<{
  (e: 'close'): void
  (e: 'confirm', payload: ManualTransferPayload): void
}>()

const fromLocation = ref<any>(null)
const toLocation = ref<any>(null)
const quantity = ref<number>(1)
const notes = ref<string>('')
const scannedBarcode = ref<string>('')
const errorMessage = ref<string>('')

// Filter locations for source (STORAGE preferred)
const sourceLocationOptions = computed(() => {
  if (!props.context) return []
  const building = props.context.fulfillment.assigned_building
  return props.locations.filter(loc => {
    // Include all storage locations in the same building or general storage
    return (loc.building === building || !loc.building) && loc.purpose !== 'DISPLAY'
  })
})

// Filter locations for destination (DISPLAY in the same building)
const displayLocationOptions = computed(() => {
  if (!props.context) return []
  const building = props.context.fulfillment.assigned_building
  const matches = props.locations.filter(loc => {
    return loc.purpose === 'DISPLAY' && (loc.building === building || !loc.building)
  })
  if (matches.length > 0) return matches
  // Fallback: any display location
  return props.locations.filter(loc => loc.purpose === 'DISPLAY')
})

// Initialize fields when context changes or modal opens
watch(
  () => props.context,
  (ctx) => {
    errorMessage.value = ''
    scannedBarcode.value = ''

    if (!ctx) {
      fromLocation.value = null
      toLocation.value = null
      quantity.value = 1
      notes.value = ''
      return
    }

    // Set suggested source if available
    if (ctx.source) {
      const foundSource = props.locations.find(l => l.id === ctx.source!.location_id)
      if (foundSource) {
        fromLocation.value = foundSource
      } else {
        fromLocation.value = {
          id: ctx.source.location_id,
          code: ctx.source.location_code,
          name: ctx.source.location_code,
          building: ctx.source.building,
          purpose: ctx.source.purpose
        }
      }
    } else if (ctx.deficit.suggested_sources.length > 0) {
      const firstSource = ctx.deficit.suggested_sources[0]
      const foundSource = props.locations.find(l => l.id === firstSource.location_id)
      if (foundSource) {
        fromLocation.value = foundSource
      } else {
        fromLocation.value = {
          id: firstSource.location_id,
          code: firstSource.location_code,
          name: firstSource.location_code,
          building: firstSource.building,
          purpose: firstSource.purpose
        }
      }
    } else {
      fromLocation.value = sourceLocationOptions.value[0] || null
    }

    // Auto-select first matching display rack
    toLocation.value = displayLocationOptions.value[0] || null

    // Pre-fill deficit quantity
    quantity.value = ctx.deficit.deficit_quantity || 1
    notes.value = `Manual Replenishment for Order ${ctx.fulfillment.reference_id}`
  },
  { immediate: true }
)

const maxAvailable = computed(() => {
  if (!props.context) return 9999
  if (props.context.source) return props.context.source.available_quantity
  const found = props.context.deficit.suggested_sources.find(
    s => s.location_id === fromLocation.value?.id
  )
  return found ? found.available_quantity : 9999
})

function setQuantity(val: number) {
  quantity.value = Math.max(1, Math.min(val, maxAvailable.value))
}

function handleBarcodeScan() {
  if (!scannedBarcode.value.trim()) return
  const code = scannedBarcode.value.trim().toUpperCase()

  // Match source or destination
  const matchedSource = props.locations.find(l => l.code.toUpperCase() === code)
  if (matchedSource) {
    if (matchedSource.purpose === 'DISPLAY') {
      toLocation.value = matchedSource
    } else {
      fromLocation.value = matchedSource
    }
    scannedBarcode.value = ''
    errorMessage.value = ''
    return
  }
  errorMessage.value = `Barcode lokasi "${code}" tidak ditemukan dalam sistem.`
}

function handleConfirm() {
  errorMessage.value = ''
  if (!props.context) return

  if (!fromLocation.value || !fromLocation.value.id) {
    errorMessage.value = 'Silakan pilih lantai asal (STORAGE).'
    return
  }

  if (!toLocation.value || !toLocation.value.id) {
    errorMessage.value = 'Silakan pilih lantai tujuan (DISPLAY).'
    return
  }

  if (fromLocation.value.id === toLocation.value.id) {
    errorMessage.value = 'Lantai asal dan tujuan tidak boleh sama.'
    return
  }

  if (quantity.value <= 0) {
    errorMessage.value = 'Jumlah kuantitas yang dipindahkan harus minimal 1 pcs.'
    return
  }

  emit('confirm', {
    product_id: props.context.deficit.product_id,
    from_location_id: fromLocation.value.id,
    to_location_id: toLocation.value.id,
    quantity: quantity.value,
    notes: notes.value
  })
}
</script>

<template>
  <BaseModal :show="show" title="Transfer Replenishment Manual" @close="emit('close')">
    <div v-if="context" class="space-y-4 text-sm text-text">
      <!-- Product & Deficit Banner -->
      <div class="p-3 bg-secondary/15 rounded-xl border border-secondary/30 flex flex-col gap-2">
        <div class="flex items-center justify-between">
          <span class="font-bold text-primary font-mono text-xs px-2 py-0.5 bg-primary/10 rounded border border-primary/20">
            {{ context.deficit.sku || 'SKU-' + context.deficit.product_id }}
          </span>
          <span class="text-xs text-text/70">
            Gedung: <strong class="text-text font-semibold">{{ context.fulfillment.assigned_building }}</strong>
          </span>
        </div>
        <div class="font-medium text-base text-text">
          {{ context.deficit.product_name || 'Produk ID: ' + context.deficit.product_id }}
        </div>
        <div class="grid grid-cols-3 gap-2 pt-2 border-t border-secondary/20 text-center text-xs">
          <div class="bg-surface/60 p-2 rounded-lg">
            <div class="text-text/70">Target Order</div>
            <div class="font-bold text-text text-sm">{{ context.deficit.target_quantity }} pcs</div>
          </div>
          <div class="bg-surface/60 p-2 rounded-lg">
            <div class="text-text/70">Saldo Display</div>
            <div class="font-bold text-warning text-sm">{{ context.deficit.display_available_quantity }} pcs</div>
          </div>
          <div class="bg-danger/10 border border-danger/20 p-2 rounded-lg">
            <div class="text-danger font-semibold">Defisit (Kurang)</div>
            <div class="font-extrabold text-danger text-sm">{{ context.deficit.deficit_quantity }} pcs</div>
          </div>
        </div>
      </div>

      <!-- Quick Scan Field -->
      <div>
        <label class="block text-xs font-semibold text-text/80 mb-1">
          Scan Barcode / Kode Lantai (Opsional untuk Verifikasi Fisik)
        </label>
        <div class="flex gap-2">
          <input
            v-model="scannedBarcode"
            type="text"
            placeholder="Scan barcode atau ketik kode lantai..."
            class="flex-1 px-3 py-2 bg-background border border-secondary/40 text-text rounded-lg text-xs font-mono focus:outline-none focus:border-primary"
            @keyup.enter="handleBarcodeScan"
          />
          <button
            type="button"
            class="px-3 py-2 bg-secondary/30 hover:bg-secondary/50 rounded-lg text-xs font-medium transition"
            @click="handleBarcodeScan"
          >
            Verifikasi
          </button>
        </div>
      </div>

      <!-- Source Rack (STORAGE) -->
      <div>
        <div class="flex items-center justify-between mb-1">
          <label class="block text-xs font-semibold text-text/90">
            Dari Lantai Asal (STORAGE)
          </label>
          <span v-if="context.source" class="text-[11px] text-success font-medium">
            Tersedia: {{ context.source.available_quantity }} pcs
          </span>
        </div>
        <BaseSelect
          v-model="fromLocation"
          :options="sourceLocationOptions"
          placeholder="Pilih lantai asal (STORAGE)"
          label="code"
          track-by="id"
        >
          <template #option="{ option }">
            <div class="flex justify-between items-center w-full py-0.5">
              <span class="font-mono font-medium text-xs">{{ option.code }}</span>
              <span class="text-[10px] px-1.5 py-0.5 rounded border bg-secondary/30 border-secondary/50 text-text/80">
                {{ option.building }} - {{ option.purpose }}
              </span>
            </div>
          </template>
        </BaseSelect>
      </div>

      <!-- Destination Rack (DISPLAY) -->
      <div>
        <label class="block text-xs font-semibold text-text/90 mb-1">
          Ke Lantai Tujuan (DISPLAY)
        </label>
        <BaseSelect
          v-model="toLocation"
          :options="displayLocationOptions"
          placeholder="Pilih lantai tujuan (DISPLAY)"
          label="code"
          track-by="id"
        >
          <template #option="{ option }">
            <div class="flex justify-between items-center w-full py-0.5">
              <span class="font-mono text-xs text-primary font-bold">{{ option.code }}</span>
              <span class="text-[10px] px-1.5 py-0.5 rounded border bg-primary/10 border-primary/20 text-primary">
                {{ option.building }} - DISPLAY
              </span>
            </div>
          </template>
        </BaseSelect>
      </div>

      <!-- Quantity -->
      <div>
        <div class="flex items-center justify-between mb-1">
          <label class="block text-xs font-semibold text-text/90">
            Jumlah Yang Dipindahkan (Pcs)
          </label>
          <div class="flex gap-1.5">
            <button
              type="button"
              class="text-[11px] px-2 py-0.5 rounded bg-secondary/30 hover:bg-secondary/50 font-medium"
              @click="setQuantity(context.deficit.deficit_quantity)"
            >
              Defisit ({{ context.deficit.deficit_quantity }})
            </button>
            <button
              v-if="context.source && context.source.available_quantity > 0"
              type="button"
              class="text-[11px] px-2 py-0.5 rounded bg-secondary/30 hover:bg-secondary/50 font-medium"
              @click="setQuantity(context.source.available_quantity)"
            >
              Max Lantai ({{ context.source.available_quantity }})
            </button>
          </div>
        </div>
        <div class="flex items-center gap-2">
          <button
            type="button"
            class="w-9 h-9 flex items-center justify-center rounded-lg bg-secondary/20 hover:bg-secondary/40 font-bold text-lg"
            @click="setQuantity(quantity - 1)"
          >
            -
          </button>
          <input
            v-model.number="quantity"
            type="number"
            min="1"
            :max="maxAvailable"
            class="flex-1 px-3 py-2 bg-background border border-secondary/40 text-text text-center rounded-lg font-bold text-base focus:outline-none focus:border-primary"
          />
          <button
            type="button"
            class="w-9 h-9 flex items-center justify-center rounded-lg bg-secondary/20 hover:bg-secondary/40 font-bold text-lg"
            @click="setQuantity(quantity + 1)"
          >
            +
          </button>
        </div>
      </div>

      <!-- Notes -->
      <div>
        <label class="block text-xs font-semibold text-text/90 mb-1">Catatan Pemindahan</label>
        <input
          v-model="notes"
          type="text"
          placeholder="Catatan..."
          class="w-full px-3 py-2 bg-background border border-secondary/40 text-text rounded-lg text-xs focus:outline-none focus:border-primary"
        />
      </div>

      <!-- Error alert -->
      <div v-if="errorMessage" class="p-2.5 bg-danger/10 border border-danger/30 text-danger rounded-lg text-xs font-medium">
        {{ errorMessage }}
      </div>

      <!-- Actions -->
      <div class="flex justify-end gap-2 pt-3 border-t border-secondary/20">
        <button
          type="button"
          class="px-4 py-2 rounded-lg bg-secondary/30 hover:bg-secondary/50 text-xs font-medium transition"
          @click="emit('close')"
        >
          Batal
        </button>
        <button
          type="button"
          :disabled="loading"
          class="px-5 py-2 rounded-lg bg-primary hover:bg-primary/90 text-white text-xs font-semibold flex items-center gap-2 shadow-sm transition disabled:opacity-50"
          @click="handleConfirm"
        >
          <span v-if="loading" class="animate-spin text-sm">⟳</span>
          <span>Konfirmasi Pindah ke Display</span>
        </button>
      </div>
    </div>
  </BaseModal>
</template>
