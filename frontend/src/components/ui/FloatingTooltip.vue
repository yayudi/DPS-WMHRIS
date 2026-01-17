<script setup>
defineProps({
  show: Boolean,
  x: Number,
  y: Number,
  title: String,
  loading: Boolean
})
</script>

<template>
  <Teleport to="body">
    <div v-if="show"
      class="fixed z-[99999] min-w-[150px] max-w-xs bg-background text-text text-xs rounded-lg shadow-xl p-3 border border-secondary/50 backdrop-blur-md pointer-events-none"
      :style="{
        left: x + 'px',
        top: y + 'px',
        transform: 'translateX(-50%) translateY(-100%)',
        marginTop: '-8px',
      }">
      <div v-if="title"
        class="font-bold text-primary mb-2 uppercase text-[10px] tracking-wider border-b border-secondary/20 pb-1">
        {{ title }}
      </div>

      <div v-if="loading" class="flex justify-center items-center py-2">
        <font-awesome-icon icon="fa-solid fa-circle-notch" spin class="text-primary text-lg" />
      </div>

      <slot v-else />

      <!-- Arrow -->
      <div
        class="absolute left-1/2 -translate-x-1/2 bottom-[-5px] w-0 h-0 border-l-[5px] border-l-transparent border-r-[5px] border-r-transparent border-t-[5px] border-t-secondary/50">
      </div>
    </div>
  </Teleport>
</template>
