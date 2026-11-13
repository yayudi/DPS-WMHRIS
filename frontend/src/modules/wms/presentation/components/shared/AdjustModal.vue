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
    error.value = t('wms.adjust.error_location')
    return
  }
  if (quantity.value === 0) {
    error.value = t('wms.adjust.error_zero_qty')
    return
  }
  if (!notes.value.trim()) {
    error.value = t('wms.adjust.error_notes')
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
  <BaseModal :show="show" @close="emit('close')" :title="t('wms.adjust.title')">
    <div v-if="product" class="space-y-4">
      <p class="text-sm text-text/80">
        {{ t('wms.adjust.prompt') }}<strong class="text-text">{{ product.name }}</strong>
      </p>

      <div>
        <label class="block text-sm font-medium text-text/90 mb-1">{{ t('wms.adjust.location_label') }}</label>
        <BaseSelect v-model="locationId" :options="locations" :placeholder="t('wms.adjust.location_placeholder')"
          label="code" track-by="id" />
      </div>

      <div>
        <label class="block text-sm font-medium text-text/90 mb-1">{{ t('wms.adjust.qty_label') }}</label>
        <input v-model.number="quantity" type="number" :placeholder="t('wms.adjust.qty_placeholder')"
          class="w-full px-3 py-2 bg-background border border-secondary/50 text-text rounded-lg" />
        <p class="text-xs text-text/60 mt-1">
          {{ t('wms.adjust.qty_instruction') }}
        </p>
      </div>

      <div>
        <label class="block text-sm font-medium text-text/90 mb-1">{{ t('wms.adjust.reason_label') }}</label>
        <textarea v-model="notes" rows="3" :placeholder="t('wms.adjust.reason_placeholder')"
          class="w-full px-3 py-2 bg-background border border-secondary/50 text-text rounded-lg"></textarea>
      </div>

      <p v-if="error" class="text-accent text-sm">{{ error }}</p>
    </div>

    <template #footer>
      <button @click="emit('close')" class="px-4 py-2 bg-secondary/20 text-text/80 rounded-lg">
        {{ t('common.btn.cancel') }}
      </button>
      <button @click="handleConfirm" class="px-4 py-2 bg-primary text-secondary rounded-lg">
        {{ t('wms.adjust.confirm_btn') }}
      </button>
    </template>
  </BaseModal>
</template>
