<script setup>
defineProps({
  modelValue: {
    type: Boolean,
    required: true
  }
})

defineEmits(['update:modelValue'])
</script>

<template>
  <button
    @click="$emit('update:modelValue', !modelValue)"
    class="h-[42px] px-3 py-1.5 text-sm font-medium rounded-lg border transition-colors flex items-center gap-2"
    :class="
      modelValue
        ? 'bg-primary text-background border-primary'
        : 'bg-background text-text/70 border-secondary hover:bg-secondary/20'
    "
  >
    <font-awesome-icon :icon="modelValue ? 'fa-solid fa-filter-circle-xmark' : 'fa-solid fa-filter'" />
    <slot>Filter</slot>
  </button>
</template>
