<script setup>
const props = defineProps({
  tabs: {
    type: Array,
    required: true,
    // example: [{ label: "Ringkasan", value: "summary" }, { label: "Detail Log", value: "detail" }]
  },
  modelValue: {
    type: String,
    required: true
  }
})

const emit = defineEmits(["update:modelValue"])

function selectTab(value) {
  emit("update:modelValue", value)
}
</script>

<template>
  <!-- Main container with themed border -->
  <div class="flex w-full md:w-auto bg-secondary/20 p-1 rounded-lg">
    <button
      v-for="tab in tabs"
      :key="tab.value"
      @click="selectTab(tab.value)"
      class="w-1/3 md:w-auto px-4 py-1.5 text-sm font-semibold rounded-md transition-all"
      :class="[
        modelValue === tab.value
          ? 'bg-primary text-white shadow' // Active state
          : 'text-text/70 hover:bg-background/50' // Inactive state
      ]"
    >
      {{ tab.label }}
    </button>
  </div>
</template>
