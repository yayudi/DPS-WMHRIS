<script setup>
import { swalAlert } from '@/core/presentation/composables/useSweetAlert'
import { ref, watch } from 'vue'
import BaseModal from '@/core/presentation/components/ui/BaseModal.vue'
import { productApi } from '@/modules/master_data/infrastructure/product.api'
import { useProductSearch } from '@/modules/wms/application/useProductSearch'
import { useI18n } from '@/core/presentation/composables/useI18n'

const props = defineProps({
  show: Boolean,
  selectedMediaIds: Array,
})

const emit = defineEmits(['close', 'linked'])
const { t } = useI18n()

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
      productApi
        .linkMedia(prod.id, {
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
      await swalAlert(t('core.media.link_summary_result', { success: successCount, fail: failCount }))
    }

    emit('linked')
    isSubmitting.value = false // Harus di set false sebelum memanggil close() karena close() punya guard
    close()
  } catch {
    await swalAlert(t('core.media.link_fatal_error'))
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
        <h3 class="text-lg font-bold text-text">{{ t('core.media.link_product_title') }}</h3>
        <p class="text-xs text-text/60 mt-1 font-normal">
          {{ t('core.media.link_product_subtitle', { count: selectedMediaIds?.length || 0 }) }}
        </p>
      </div>
    </template>

    <div class="flex-1 min-h-[300px]">
      <!-- Selected Products Preview -->
      <div v-if="selectedProducts.length > 0" class="mb-4">
        <label class="block text-sm font-semibold text-text/80 mb-2"
          >{{ t('core.media.link_selected_label', { count: selectedProducts.length }) }}</label
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

      <label class="block text-sm font-semibold text-text/80 mb-2">{{ t('core.media.link_search_label') }}</label>
      <div class="relative">
        <input
          type="text"
          v-model="searchQuery"
          :placeholder="t('core.media.link_search_placeholder')"
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
        {{ t('core.media.link_no_match') }}
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
                >{{ t('common.status.archived') }}</span
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
        <p class="text-sm">{{ t('core.media.link_search_hint') }}</p>
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
          {{ t('common.btn.cancel') }}
        </button>
        <button
          @click="submitAll"
          class="px-4 py-2 rounded-lg bg-primary text-background font-bold hover:bg-accent transition-colors flex items-center gap-2 min-w-[120px] justify-center"
          :disabled="isSubmitting || selectedProducts.length === 0"
        >
          <font-awesome-icon v-if="isSubmitting" icon="fa-solid fa-spinner" spin />
          <span v-else>{{ t('core.media.link_btn', { count: selectedProducts.length }) }}</span>
        </button>
      </div>
    </template>
  </BaseModal>
</template>
