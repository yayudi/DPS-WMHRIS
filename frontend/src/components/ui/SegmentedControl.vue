<script setup>
import { ref } from 'vue'
import FloatingTooltip from '@/components/ui/FloatingTooltip.vue'

defineProps({
  modelValue: {
    type: [String, Number, Boolean, Object],
    required: true
  },
  options: {
    type: Array,
    required: true,
    validator: opts => opts.every(opt => 'value' in opt)
  },
  label: {
    type: String,
    default: ''
  },
  labelVariant: {
    type: String,
    default: 'default',
    validator: v => ['default', 'compact'].includes(v)
  },
  hideLabelOnMobile: {
    type: Boolean,
    default: false
  }
})

defineEmits(['update:modelValue'])

const hoveredOption = ref(null)
const buttonRefs = ref({})

const setRef = (el, val) => {
  if (el) buttonRefs.value[val] = el
}
</script>

<template>
  <div class="flex flex-col w-fit">
    <label
      v-if="label"
      class="block mb-1"
      :class="
        labelVariant === 'compact'
          ? 'text-center text-[10px] font-bold text-text/60 uppercase tracking-wider px-1'
          : 'text-sm font-medium text-text/80'
      "
    >
      {{ label }}
    </label>
    <div class="h-[42px] flex w-full p-1 space-x-1 bg-secondary rounded-lg relative" @mouseleave="hoveredOption = null">
      <button
        v-for="option in options"
        :key="option.value"
        :ref="el => setRef(el, option.value)"
        type="button"
        @mouseenter="hoveredOption = option.value"
        @click="$emit('update:modelValue', option.value)"
        :class="[
          'flex-1 flex items-center justify-center px-2 py-1.5 text-[11px] sm:text-xs font-bold rounded-md transition-all duration-200 outline-none',
          modelValue === option.value
            ? 'bg-background text-text shadow-sm ring-1 ring-secondary/20'
            : 'text-text/60 hover:text-text hover:bg-secondary/10 focus-visible:bg-secondary/10'
        ]"
      >
        <div class="flex items-center justify-center gap-2 whitespace-nowrap">
          <font-awesome-icon v-if="option.icon" :icon="option.icon" class="text-xs shrink-0" />
          <span v-if="option.label" :class="[hideLabelOnMobile && option.icon ? 'hidden md:inline' : '']">{{ option.label }}</span>
        </div>
      </button>
    </div>

    <FloatingTooltip
      :show="hoveredOption !== null"
      :referenceEl="hoveredOption !== null ? buttonRefs[hoveredOption] : null"
      placement="top"
      variant="compact"
    >
      <span class="text-xs font-medium">{{ options.find(o => o.value === hoveredOption)?.label }}</span>
    </FloatingTooltip>
  </div>
</template>
