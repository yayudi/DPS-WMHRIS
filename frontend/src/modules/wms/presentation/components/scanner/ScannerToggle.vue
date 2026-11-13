<template>
  <button
    type="button"
    @click="$emit('update:modelValue', !modelValue)"
    :class="[
      'shrink-0 flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold transition-all border',
      modelValue
        ? 'bg-primary/10 border-primary text-primary shadow-sm'
        : 'bg-secondary/10 border-secondary/20 text-text/50 hover:bg-secondary/30'
    ]"
    :title="modelValue ? t('wms.scanner.mode_active') : t('wms.scanner.mode_manual')"
  >
    <font-awesome-icon icon="fa-solid fa-barcode" />
    <span>{{ modelValue ? t('wms.scanner.scanner') : t('wms.scanner.manual') }}</span>
  </button>
</template>

<script setup>
import { useI18n } from '@/core/presentation/composables/useI18n'

const { t } = useI18n()

defineProps({
  modelValue: {
    type: Boolean,
    default: false
  }
})

defineEmits(['update:modelValue'])
</script>
