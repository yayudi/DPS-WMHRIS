<!-- frontend\src\components\WMSTransferModal.vue -->
<script setup>
import { ref, watch } from 'vue'
import Modal from '@/components/Modal.vue'
import Multiselect from 'vue-multiselect'

const props = defineProps({
  show: Boolean,
  product: Object,
  locations: Array,
})

const emit = defineEmits(['close', 'confirm'])

const fromLocationId = ref(null)
const toLocationId = ref(null)
const quantity = ref(1)
const error = ref('')

// Reset state saat modal dibuka atau produk berubah
watch(
  () => props.product,
  (newProduct) => {
    if (newProduct) {
      fromLocationId.value = null
      toLocationId.value = null
      quantity.value = 1
      error.value = ''
    }
  },
)

function handleConfirm() {
  if (!fromLocationId.value || !toLocationId.value) {
    error.value = 'Lokasi asal dan tujuan harus dipilih.'
    return
  }
  if (fromLocationId.value.id === toLocationId.value.id) {
    error.value = 'Lokasi asal dan tujuan tidak boleh sama.'
    return
  }
  if (quantity.value <= 0) {
    error.value = 'Kuantitas harus lebih dari 0.'
    return
  }

  emit('confirm', {
    productId: props.product.id,
    fromLocationId: fromLocationId.value.id,
    toLocationId: toLocationId.value.id,
    quantity: quantity.value,
  })
}
</script>

<template>
  <Modal :show="show" @close="emit('close')" title="Transfer Stok">
    <div v-if="product" class="space-y-4">
      <p class="text-sm text-text/80">
        Anda akan mentransfer produk: <strong class="text-text">{{ product.name }}</strong>
      </p>

      <!-- From Location -->
      <div>
        <label class="block text-sm font-medium text-text/90 mb-1">Dari Lokasi</label>
        <Multiselect
          v-model="fromLocationId"
          :options="locations"
          :allow-empty="false"
          placeholder="Pilih lokasi asal"
          label="code"
          track-by="id"
        ></Multiselect>
      </div>

      <!-- To Location -->
      <div>
        <label class="block text-sm font-medium text-text/90 mb-1">Ke Lokasi</label>
        <Multiselect
          v-model="toLocationId"
          :options="locations"
          :allow-empty="false"
          placeholder="Pilih lokasi tujuan"
          label="code"
          track-by="id"
        ></Multiselect>
      </div>

      <!-- Quantity -->
      <div>
        <label class="block text-sm font-medium text-text/90 mb-1">Jumlah</label>
        <input
          v-model.number="quantity"
          type="number"
          min="1"
          class="w-full px-3 py-2 bg-background border border-secondary/50 text-text rounded-lg"
        />
      </div>

      <p v-if="error" class="text-accent text-sm">{{ error }}</p>
    </div>

    <template #footer>
      <button @click="emit('close')" class="px-4 py-2 bg-secondary/20 text-text/80 rounded-lg">
        Batal
      </button>
      <button @click="handleConfirm" class="px-4 py-2 bg-primary text-white rounded-lg">
        Konfirmasi Transfer
      </button>
    </template>
  </Modal>
</template>
