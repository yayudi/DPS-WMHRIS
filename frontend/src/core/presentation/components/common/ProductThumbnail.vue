<script setup>
defineProps({
  imageUrl: { type: String, default: null },
  size: { type: String, default: 'md' }, // 'sm' | 'md'
})

defineEmits(['click'])

const sizeClasses = {
  sm: 'w-8 h-8 rounded-md',
  md: 'w-10 h-10 rounded-lg',
}
</script>

<template>
  <div
    @click.stop="$emit('click')"
    class="bg-secondary/10 border border-secondary/20 overflow-hidden shrink-0 flex items-center justify-center cursor-pointer hover:ring-2 hover:ring-primary/50 transition-all relative group/img"
    :class="sizeClasses[size] || sizeClasses.md"
  >
    <img v-if="imageUrl" :src="imageUrl" class="w-full h-full object-cover" loading="lazy" />
    <font-awesome-icon v-else icon="fa-solid fa-image" class="text-text/20 text-sm" />

    <div
      class="absolute inset-0 bg-black/30 opacity-0 group-hover/img:opacity-100 flex items-center justify-center transition-opacity"
    >
      <font-awesome-icon icon="fa-solid fa-expand" class="text-secondary text-xs drop-shadow-md" />
    </div>
  </div>
</template>
