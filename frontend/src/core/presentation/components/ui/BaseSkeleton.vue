<template>
  <div 
    v-if="active"
    class="animate-pulse bg-secondary/10"
    :class="[shapeClasses[shape], className]"
    role="presentation"
  ></div>
</template>

<script setup>
defineProps({
  active: {
    type: Boolean,
    default: true
  },
  shape: {
    type: String,
    default: 'rect', // 'rect', 'circle', 'text'
    validator: (value) => ['rect', 'circle', 'text'].includes(value)
  },
  className: {
    type: String,
    default: 'w-full h-4 rounded'
  }
});

const shapeClasses = {
  rect: 'rounded',
  circle: 'rounded-full',
  text: 'rounded h-3 w-3/4'
};
</script>
