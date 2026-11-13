<script setup>
import { ref, watch } from 'vue'
import BaseModal from '@/core/presentation/components/ui/BaseModal.vue'
import BaseSelect from '@/core/presentation/components/ui/BaseSelect.vue'
import { useI18n } from '@/core/presentation/composables/useI18n'

const props = defineProps({
  show: Boolean,
  product: Object,
  locations: Array,
})

const emit = defineEmits(['close', 'confirm'])
const { t } = useI18n()

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
    error.value = t('wms.transfer.error_select_both')
    return
  }
  if (fromLocationId.value.id === toLocationId.value.id) {
    error.value = t('wms.transfer.error_same_location')
    return
  }
  if (quantity.value <= 0) {
    error.value = t('wms.transfer.error_positive_qty')
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
  <BaseModal :show="show" @close="emit('close')" :title="t('wms.transfer.modal_title')">
    <div v-if="product" class="space-y-4">
      <p class="text-sm text-text/80">
        {{ t('wms.transfer.prompt_prefix') }} <strong class="text-text">{{ product.name }}</strong>
      </p>

      <!-- From Location -->
      <div>
        <label class="block text-sm font-medium text-text/90 mb-1">{{ t('common.label.from_location') }}</label>
        <BaseSelect v-model="fromLocationId" :options="locations" :placeholder="t('wms.transfer.select_from_placeholder')" label="code"
          track-by="id" />
      </div>

      <!-- To Location -->
      <div>
        <label class="block text-sm font-medium text-text/90 mb-1">{{ t('common.label.to_location') }}</label>
        <BaseSelect v-model="toLocationId" :options="locations" :placeholder="t('wms.transfer.select_to_placeholder')" label="code"
          track-by="id">
          <template #option="{ option }">
            <div class="flex justify-between items-center w-full">
              <span class="font-medium font-mono text-xs">{{ option.code }}</span>
              <span class="text-[10px] px-1.5 py-0.5 rounded border"
                :class="option.quantity === 0 ? 'bg-danger/10 text-danger border-danger/20' : 'bg-success/10 text-success border-success/20'">
                {{ t('wms.transfer.stock_label') }}: {{ option.quantity }}
              </span>
            </div>
          </template>
        </BaseSelect>
      </div>

      <!-- Quantity -->
      <div>
        <label class="block text-sm font-medium text-text/90 mb-1">{{ t('common.label.quantity') }}</label>
        <input v-model.number="quantity" type="number" min="1"
          class="w-full px-3 py-2 bg-background border border-secondary/50 text-text rounded-lg" />
      </div>

      <p v-if="error" class="text-accent text-sm">{{ error }}</p>
    </div>

    <template #footer>
      <button @click="emit('close')" class="px-4 py-2 bg-secondary/20 text-text/80 rounded-lg">
        {{ t('common.btn.cancel') }}
      </button>
      <button @click="handleConfirm" class="px-4 py-2 bg-primary text-secondary rounded-lg">
        {{ t('wms.transfer.confirm_btn') }}
      </button>
    </template>
  </BaseModal>
</template>
