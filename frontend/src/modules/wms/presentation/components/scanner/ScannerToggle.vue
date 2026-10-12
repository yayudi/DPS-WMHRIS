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
    :title="modelValue ? 'Mode Scanner Aktif' : 'Mode Manual'"
  >
    <font-awesome-icon icon="fa-solid fa-barcode" />
    <span>{{ modelValue ? 'Scanner' : 'Manual' }}</span>
  </button>
</template>

<script setup>
defineProps({
  modelValue: {
    type: Boolean,
    default: false
  }
})

defineEmits(['update:modelValue'])
</script>
