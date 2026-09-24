<script setup>
import { swalAlert } from '@/composables/useSweetAlert'
import { ref, watch } from 'vue'
import BaseModal from '@/components/ui/BaseModal.vue'
import axios from '@/api/axios'
import { useProductSearch } from '@/composables/useProductSearch.js'

const props = defineProps({
  show: Boolean,
  selectedMediaIds: Array,
})

const emit = defineEmits(['close', 'linked'])

const isSubmitting = ref(false)
const selectedProducts = ref([])

const {
  query: searchQuery,
  results: searchResults,
  isSearching,
  clear: clearSearch
} = useProductSearch()

watch(
  () => props.show,
  (newVal) => {
    if (!newVal) {
      clearSearch()
      selectedProducts.value = []
    }
  },
)

const toggleProduct = async (prod) => {
  const isSelected = selectedProducts.value.some((p) => p.id === prod.id)
  if (isSelected) {
    selectedProducts.value = selectedProducts.value.filter((p) => p.id !== prod.id)
  } else {
    selectedProducts.value.push(prod)
  }
}

const removeProduct = (productId) => {
  selectedProducts.value = selectedProducts.value.filter((p) => p.id !== productId)
}

const submitAll = async () => {
  if (isSubmitting.value || selectedProducts.value.length === 0) return

  isSubmitting.value = true
  let successCount = 0
  let failCount = 0

  try {
    const promises = selectedProducts.value.map((prod) =>
      axios
        .post(`/products/${prod.id}/link-media`, {
          mediaIds: props.selectedMediaIds,
        })
        .then(() => successCount++)
        .catch((err) => {
          console.error(`Gagal menghubungkan ke produk ${prod.sku}`, err)
          failCount++
        }),
    )

    // Resolve all promises concurrently without failing fast
    await Promise.allSettled(promises)

    if (failCount > 0) {
      await swalAlert(`Berhasil: ${successCount} produk. Gagal: ${failCount} produk.`)
    }

    emit('linked')
    isSubmitting.value = false // Harus di set false sebelum memanggil close() karena close() punya guard
    close()
  } catch {
    await swalAlert('Terjadi kesalahan fatal saat menyematkan produk.')
    isSubmitting.value = false
  }
}

const close = () => {
  if (isSubmitting.value) return
  emit('close')
}
</script>

<template>
  <BaseModal :show="show" @close="close" maxWidth="max-w-lg">
    <template #title>
      <div class="-mt-1">
        <h3 class="text-lg font-bold text-text">Tautkan ke Produk</h3>
        <p class="text-xs text-text/60 mt-1 font-normal">
          Pilih produk tujuan untuk {{ selectedMediaIds?.length || 0 }} gambar.
        </p>
      </div>
    </template>

    <div class="flex-1 min-h-[300px]">
      <!-- Selected Products Preview -->
      <div v-if="selectedProducts.length > 0" class="mb-4">
        <label class="block text-sm font-semibold text-text/80 mb-2"
          >Produk Terpilih ({{ selectedProducts.length }})</label
        >
        <div class="flex flex-wrap gap-2 p-3 bg-secondary/10 rounded-lg border border-secondary/20">
          <div
            v-for="prod in selectedProducts"
            :key="prod.id"
            class="badge bg-primary/10 text-primary border-primary rounded-md gap-1 py-1 px-2 flex items-center"
          >
            <span class="max-w-[150px] truncate text-xs font-bold" :title="prod.name">{{
              prod.sku
            }}</span>
            <button
              @click="removeProduct(prod.id)"
              class="text-primary hover:text-danger ml-1 transition-colors"
              :disabled="isSubmitting"
            >
              <font-awesome-icon icon="fa-solid fa-times" />
            </button>
          </div>
        </div>
      </div>

      <label class="block text-sm font-semibold text-text/80 mb-2">Cari Produk (SKU / Nama)</label>
      <div class="relative">
        <input
          type="text"
          v-model="searchQuery"
          placeholder="Ketik minimal 2 huruf..."
          class="input input-bordered w-full bg-background text-text border-secondary focus:border-primary focus:ring-1 focus:ring-primary pl-10"
          :disabled="isSubmitting"
        />
        <font-awesome-icon
          icon="fa-solid fa-search"
          class="absolute left-4 top-1/2 -translate-y-1/2 text-text/40"
        />
      </div>

      <div v-if="isSearching" class="text-center py-8">
        <font-awesome-icon icon="fa-solid fa-circle-notch" spin class="text-primary text-2xl" />
      </div>

      <div
        v-else-if="searchQuery.length >= 2 && searchResults.length === 0"
        class="text-center py-8 text-text/50"
      >
        Tidak ada produk yang cocok.
      </div>

      <div v-else-if="searchResults.length > 0" class="mt-4 flex flex-col gap-2">
        <button
          v-for="prod in searchResults"
          :key="prod.id"
          @click="toggleProduct(prod)"
          class="flex items-center justify-between p-3 rounded-lg border transition-colors text-left"
          :class="
            selectedProducts.find((p) => p.id === prod.id)
              ? 'border-primary bg-primary/10'
              : 'border-secondary/20 hover:border-primary/50 hover:bg-primary/5'
          "
          :disabled="isSubmitting"
        >
          <div class="flex flex-col">
            <div class="flex items-center gap-2">
              <span
                class="font-bold text-sm"
                :class="
                  selectedProducts.find((p) => p.id === prod.id) ? 'text-primary' : 'text-text'
                "
                >{{ prod.sku }}</span
              >
              <span
                v-if="prod.is_active === 0"
                class="text-[10px] bg-danger/10 text-danger px-2 py-0.5 rounded font-bold"
                >Arsip</span
              >
            </div>
            <span
              class="text-sm mt-1"
              :class="
                selectedProducts.find((p) => p.id === prod.id) ? 'text-primary/80' : 'text-text/80'
              "
              >{{ prod.name }}</span
            >
          </div>
          <div
            class="flex-shrink-0 w-6 h-6 flex items-center justify-center rounded-full transition-colors"
            :class="
              selectedProducts.find((p) => p.id === prod.id)
                ? 'bg-primary text-background'
                : 'bg-secondary/30 text-text/30'
            "
          >
            <font-awesome-icon
              :icon="
                selectedProducts.find((p) => p.id === prod.id)
                  ? 'fa-solid fa-check'
                  : 'fa-solid fa-plus'
              "
              class="text-xs"
            />
          </div>
        </button>
      </div>

      <div v-else class="flex flex-col items-center justify-center py-10 opacity-30">
        <font-awesome-icon icon="fa-solid fa-boxes-stacked" class="text-5xl mb-3" />
        <p class="text-sm">Gunakan kotak di atas untuk menemukan produk</p>
      </div>
    </div>

    <!-- Footer / Actions -->
    <template #footer>
      <div class="flex justify-end gap-2">
        <button
          @click="close"
          class="px-4 py-2 rounded-lg text-text border border-secondary hover:bg-secondary transition-colors"
          :disabled="isSubmitting"
        >
          Batal
        </button>
        <button
          @click="submitAll"
          class="px-4 py-2 rounded-lg bg-primary text-background font-bold hover:bg-accent transition-colors flex items-center gap-2 min-w-[120px] justify-center"
          :disabled="isSubmitting || selectedProducts.length === 0"
        >
          <font-awesome-icon v-if="isSubmitting" icon="fa-solid fa-spinner" spin />
          <span v-else>Tautkan ({{ selectedProducts.length }})</span>
        </button>
      </div>
    </template>
  </BaseModal>
</template>
