<script setup lang="ts">
import BatchEditModal from './BatchEditModal.vue'

defineProps<{
  isOpen: boolean
  isExporting?: boolean
  isImporting?: boolean
}>()

defineEmits<{
  (e: 'close'): void
  (e: 'export', payload: any): void
  (e: 'import', payload: FormData): void
}>()
</script>

<template>
  <BatchEditModal
    :is-open="isOpen"
    :is-exporting="isExporting"
    :is-importing="isImporting"
    entity-type="package"
    @close="$emit('close')"
    @export="$emit('export', $event)"
    @import="$emit('import', $event)"
  />
</template>
