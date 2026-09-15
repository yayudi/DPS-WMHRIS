<!-- frontend\src\components\ui\Tabs.vue -->
<script setup>
defineProps({
  tabs: {
    type: Array,
    required: true
  },
  modelValue: {
    type: String,
    required: true
  }
})

const emit = defineEmits(['update:modelValue'])

function selectTab(value) {
  emit('update:modelValue', value)
}
</script>

<template>
  <!-- Main container with themed border -->
  <div class="flex w-full md:w-auto bg-secondary p-1 rounded-lg">
    <button
      v-for="tab in tabs"
      :key="tab.value"
      @click="selectTab(tab.value)"
      class="h-[35px] flex-1 md:w-auto px-4 py-1.5 text-sm font-semibold rounded-md transition-all whitespace-nowrap"
      :class="[
        modelValue === tab.value
          ? 'bg-primary text-background shadow' // Active state
          : 'text-text/70 hover:bg-secondary/80 hover:text-primary' // Inactive state
      ]"
    >
      <font-awesome-icon v-if="tab.icon" :icon="tab.icon" class="mr-2" />
      {{ tab.label }}
    </button>
  </div>
</template>
