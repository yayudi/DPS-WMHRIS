<!-- frontend/src/components/ui/BaseSwitch.vue -->
<script setup>
defineProps({
  modelValue: {
    type: Boolean,
    default: false
  },
  leftLabel: {
    type: String,
    default: ''
  },
  rightLabel: {
    type: String,
    default: ''
  }
})

defineEmits(['update:modelValue'])
</script>

<template>
  <label
    class="flex items-center cursor-pointer bg-secondary/5 rounded-lg border border-secondary/20 hover:bg-secondary/10 transition-colors"
  >
    <div
      class="relative inline-grid items-center h-8 rounded-full transition-colors duration-300 shadow-inner px-1"
      :class="modelValue ? 'bg-danger' : 'bg-primary'"
    >
      <!-- Hidden spacer to size the switch based on the longest text + dot padding -->
      <div class="col-start-1 row-start-1 grid px-7 invisible pointer-events-none select-none h-0">
        <span class="text-[10px] font-bold whitespace-nowrap" style="grid-area: 1/1">{{ leftLabel || 'OFF' }}</span>
        <span class="text-[10px] font-bold whitespace-nowrap" style="grid-area: 1/1">{{ rightLabel || 'ON' }}</span>
      </div>

      <!-- Text when switch is ON (right label) -->
      <span
        class="absolute left-2.5 text-[10px] font-bold text-background select-none transition-opacity duration-300 z-0 whitespace-nowrap"
        :class="modelValue ? 'opacity-100' : 'opacity-0'"
      >
        {{ rightLabel || 'ON' }}
      </span>

      <!-- Text when switch is OFF (left label) -->
      <span
        class="absolute right-2.5 text-[10px] font-bold text-background select-none transition-opacity duration-300 z-0 whitespace-nowrap"
        :class="!modelValue ? 'opacity-100' : 'opacity-0'"
      >
        {{ leftLabel || 'OFF' }}
      </span>

      <input
        type="checkbox"
        :checked="modelValue"
        @change="$emit('update:modelValue', $event.target.checked)"
        class="sr-only"
      />
      <div
        class="dot absolute top-1 bg-background w-6 h-6 rounded-full transition-all duration-300 shadow-md z-10"
        :style="{ left: modelValue ? 'calc(100% - 28px)' : '4px' }"
      ></div>
    </div>
  </label>
</template>
