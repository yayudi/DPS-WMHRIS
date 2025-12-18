<script setup>
import { ref, onMounted, watchEffect } from 'vue'
import { useToast } from '@/composables/useToast.js'
import { fetchProductStockDetails } from '@/api/helpers/products.js'
import { processSingleTransfer } from '@/api/helpers/stock.js'
import Multiselect from 'vue-multiselect'

const props = defineProps({
  product: { type: Object, required: true },
  allLocations: { type: Array, required: true },
})

const emit = defineEmits(['transfer-complete', 'cancel'])

const { show } = useToast()

// State Internal
const stockDetails = ref([])
const isLoadingDetails = ref(false)
const isSubmitting = ref(false)

// State Form
const fromLocation = ref(null)
const toLocation = ref(null)
const quantity = ref(1)
const notes = ref('')

watchEffect(async () => {
  if (!props.product?.id) return
  isLoadingDetails.value = true
  try {
    stockDetails.value = await fetchProductStockDetails(props.product.id)
  } catch (error) {
    show('Gagal memuat detail stok produk.', 'error')
  } finally {
    isLoadingDetails.value = false
  }
})

function validateQuantity() {
  if (!fromLocation.value) return
  const maxQty = fromLocation.value.quantity
  if (quantity.value > maxQty) {
    quantity.value = maxQty
    show(`Kuantitas transfer tidak boleh melebihi stok di lokasi asal (${maxQty}).`, 'warning')
  }
  if (quantity.value < 1) {
    quantity.value = 1
  }
}

async function submitTransfer() {
  if (!fromLocation.value || !toLocation.value || quantity.value < 1) {
    show('Harap lengkapi lokasi asal, tujuan, dan kuantitas.', 'error')
    return
  }
  if (fromLocation.value.location_id === toLocation.value.id) {
    show('Lokasi asal dan tujuan tidak boleh sama.', 'error')
    return
  }
  if (quantity.value > fromLocation.value.quantity) {
    show('Kuantitas transfer melebihi stok yang tersedia.', 'error')
    return
  }

  isSubmitting.value = true
  try {
    const payload = {
      sku: props.product.sku,
      fromLocationId: fromLocation.value.location_id,
      toLocationId: toLocation.value.id, // Ambil 'id' dari allLocations
      quantity: quantity.value,
      notes: notes.value,
    }

    const response = await processSingleTransfer(payload)
    show(response.message, 'success')
    emit('transfer-complete')
  } catch (error) {
    show(error.message || 'Gagal melakukan transfer.', 'error')
  } finally {
    isSubmitting.value = false
  }
}
</script>

<template>
  <div v-if="isLoadingDetails" class="text-center py-8 text-text/60">
    <font-awesome-icon icon="fa-solid fa-spinner" class="animate-spin" />
    Memuat detail stok...
  </div>

  <div v-if="!isLoadingDetails" class="space-y-6">
    <h3 class="text-lg font-semibold">
      Stok Saat Ini untuk: <span class="text-primary">{{ product.name }}</span>
    </h3>

    <!-- Tabel Detail Stok -->
    <div class="max-h-64 overflow-y-auto border border-secondary/20 rounded-lg">
      <table class="min-w-full text-sm">
        <thead class="bg-secondary/10">
          <tr>
            <th class="p-2 text-left">Lokasi</th>
            <th class="p-2 text-center">Stok</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-secondary/20">
          <tr v-if="stockDetails.length === 0">
            <td colspan="2" class="p-4 text-center text-text/60">
              Tidak ada stok untuk produk ini di lokasi manapun.
            </td>
          </tr>
          <tr v-for="stock in stockDetails" :key="stock.location_id">
            <td class="p-2 font-mono">{{ stock.location_code }}</td>
            <td class="p-2 font-bold text-center">{{ stock.quantity }}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Form Transfer -->
    <div class="grid grid-cols-1 md:grid-cols-3 gap-4 items-end pt-6 border-t border-secondary/20">
      <div>
        <label class="block text-sm font-medium text-text/90 mb-2">Pindahkan Dari</label>
        <Multiselect
          v-model="fromLocation"
          :options="stockDetails"
          label="location_code"
          track-by="location_id"
          placeholder="Pilih asal"
        >
          <template #option="{ option }">
            <div class="flex justify-between">
              <span>{{ option.location_code }}</span>
              <span class="font-bold">Stok: {{ option.quantity }}</span>
            </div>
          </template>
        </Multiselect>
      </div>
      <div>
        <label class="block text-sm font-medium text-text/90 mb-2">Ke Lokasi</label>
        <Multiselect
          v-model="toLocation"
          :options="allLocations"
          label="code"
          track-by="id"
          placeholder="Pilih tujuan"
        ></Multiselect>
      </div>
      <div>
        <label class="block text-sm font-medium text-text/90 mb-2">Jumlah</label>
        <input
          v-model.number="quantity"
          @blur="validateQuantity"
          type="number"
          min="1"
          :max="fromLocation ? fromLocation.quantity : undefined"
          class="w-full p-2 border border-secondary/50 rounded-lg bg-background"
          :disabled="!fromLocation"
        />
      </div>
    </div>

    <!-- Input Catatan -->
    <div>
      <label class="block text-sm font-medium text-text/90 mb-2">Catatan (Opsional)</label>
      <input
        v-model="notes"
        type="text"
        placeholder="e.g., Pindah stok untuk event"
        class="w-full p-2 border border-secondary/50 rounded-lg bg-background"
      />
    </div>

    <!-- Tombol Aksi -->
    <div class="flex justify-end gap-4">
      <button
        @click="$emit('cancel')"
        :disabled="isSubmitting"
        class="px-6 py-3 bg-secondary/20 text-text/80 rounded-lg font-bold"
      >
        Batal
      </button>
      <button
        @click="submitTransfer"
        :disabled="isSubmitting || !fromLocation || !toLocation || quantity < 1"
        class="px-6 py-3 bg-accent text-white rounded-lg font-bold disabled:opacity-50 flex items-center gap-2"
      >
        <font-awesome-icon v-if="isSubmitting" icon="fa-solid fa-spinner" class="animate-spin" />
        <span>{{ isSubmitting ? 'Memproses...' : 'Submit Transfer' }}</span>
      </button>
    </div>
  </div>
</template>
