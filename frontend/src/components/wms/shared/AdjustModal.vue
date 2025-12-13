<!-- frontend\src\components\WmsAdjustModal.vue -->
<script setup>
import { ref, watch } from 'vue'
import Modal from '@/components/ui/Modal.vue'
import Multiselect from 'vue-multiselect'

const props = defineProps({
  show: Boolean,
  product: Object,
  locations: Array,
})

const emit = defineEmits(['close', 'confirm'])

const locationId = ref(null)
const quantity = ref(0)
const notes = ref('')
const error = ref('')

watch(
  () => props.product,
  (newProduct) => {
    if (newProduct) {
      locationId.value = null
      quantity.value = 0
      notes.value = ''
      error.value = ''
    }
  },
)

function handleConfirm() {
  if (!locationId.value) {
    error.value = 'Lokasi harus dipilih.'
    return
  }
  if (quantity.value === 0) {
    error.value = 'Jumlah penyesuaian tidak boleh nol.'
    return
  }
  if (!notes.value.trim()) {
    error.value = 'Catatan atau alasan penyesuaian wajib diisi.'
    return
  }

  emit('confirm', {
    productId: props.product.id,
    locationId: locationId.value.id,
    quantity: quantity.value,
    notes: notes.value,
  })
}
</script>

<template>
  <Modal :show="show" @close="emit('close')" title="Penyesuaian Stok">
    <div v-if="product" class="space-y-4">
      <p class="text-sm text-text/80">
        Anda akan menyesuaikan stok produk: <strong class="text-text">{{ product.name }}</strong>
      </p>

      <div>
        <label class="block text-sm font-medium text-text/90 mb-1">Lokasi Stok</label>
        <Multiselect
          v-model="locationId"
          :options="locations"
          :allow-empty="false"
          placeholder="Pilih lokasi yang akan disesuaikan"
          label="code"
          track-by="id"
        ></Multiselect>
      </div>

      <div>
        <label class="block text-sm font-medium text-text/90 mb-1">Jumlah Penyesuaian</label>
        <input
          v-model.number="quantity"
          type="number"
          placeholder="Gunakan angka negatif untuk mengurangi (cth: -5)"
          class="w-full px-3 py-2 bg-background border border-secondary/50 text-text rounded-lg"
        />
        <p class="text-xs text-text/60 mt-1">
          Gunakan angka positif untuk menambah stok dan negatif untuk mengurangi.
        </p>
      </div>

      <div>
        <label class="block text-sm font-medium text-text/90 mb-1">Alasan Penyesuaian</label>
        <textarea
          v-model="notes"
          rows="3"
          placeholder="Contoh: Stok opname, barang rusak, ditemukan selisih, dll."
          class="w-full px-3 py-2 bg-background border border-secondary/50 text-text rounded-lg"
        ></textarea>
      </div>

      <p v-if="error" class="text-accent text-sm">{{ error }}</p>
    </div>

    <template #footer>
      <button @click="emit('close')" class="px-4 py-2 bg-secondary/20 text-text/80 rounded-lg">
        Batal
      </button>
      <button @click="handleConfirm" class="px-4 py-2 bg-primary text-white rounded-lg">
        Konfirmasi Penyesuaian
      </button>
    </template>
  </Modal>
</template>
