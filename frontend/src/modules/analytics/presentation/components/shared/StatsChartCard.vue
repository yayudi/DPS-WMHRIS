<script setup>
/**
 * Standardized card container for charts in statistics pages.
 */
defineProps({
  title: {
    type: String,
    required: true
  },
  subtitle: {
    type: String,
    default: ''
  },
  minHeight: {
    type: String,
    default: '400px'
  }
});
</script>

<template>
  <div 
    class="bg-background border border-secondary p-5 rounded-xl shadow-sm flex flex-col"
    :style="{ minHeight }"
  >
    <div class="mb-4">
      <h4 class="font-bold text-text text-sm">{{ title }}</h4>
      <p v-if="subtitle" class="text-xs text-text/50 mt-1">{{ subtitle }}</p>
    </div>
    
    <div class="flex-1 relative flex flex-col justify-center">
      <slot />
    </div>
  </div>
</template>
