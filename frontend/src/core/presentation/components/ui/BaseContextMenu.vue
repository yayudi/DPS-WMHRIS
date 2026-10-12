<script setup>
import { onMounted, onUnmounted, ref } from 'vue'

const props = defineProps({
  visible: Boolean,
  x: Number,
  y: Number,
  options: {
    type: Array,
    default: () => [] // Array of { label, action, icon, divider, danger, disabled, shortcut }
  }
})

const emit = defineEmits(['close', 'action'])
const menuRef = ref(null)

const closeMenu = () => {
  emit('close')
}

const handleClickOutside = (event) => {
  if (props.visible && menuRef.value && !menuRef.value.contains(event.target)) {
    closeMenu()
  }
}

onMounted(() => {
  document.addEventListener('click', handleClickOutside)
  document.addEventListener('contextmenu', (e) => {
    // If we right-click outside, close the current menu
    if (props.visible && menuRef.value && !menuRef.value.contains(e.target)) {
      closeMenu()
    }
  })
})

onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside)
})
</script>

<template>
  <Teleport to="body">
    <Transition name="fade-scale">
      <div 
        v-if="visible" 
        ref="menuRef"
        class="fixed z-[100] bg-background/95 backdrop-blur-md border border-secondary/20 shadow-xl rounded-lg py-1.5 min-w-[200px] text-sm overflow-hidden" 
        :style="{ top: `${y}px`, left: `${x}px` }"
        @click.stop
        @contextmenu.prevent
      >
        <template v-for="(item, index) in options" :key="index">
          <div v-if="item.divider" class="h-px bg-secondary/10 my-1.5"></div>
          <button 
            v-else
            @click="emit('action', item.action); closeMenu()"
            class="w-full text-left px-4 py-1.5 flex items-center gap-3 transition-colors"
            :class="[
              item.danger ? 'hover:bg-danger/10 text-danger' : 'hover:bg-secondary/10 text-text/80 hover:text-text',
              item.disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'
            ]"
            :disabled="item.disabled"
          >
            <font-awesome-icon :icon="item.icon" class="w-4 text-center opacity-70" />
            <span class="flex-1">{{ item.label }}</span>
            <span v-if="item.shortcut" class="text-[10px] text-text/40 tracking-widest font-mono ml-4">{{ item.shortcut }}</span>
          </button>
        </template>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>


.fade-scale-enter-active,
.fade-scale-leave-active {
  transition: opacity 0.15s ease, transform 0.15s cubic-bezier(0.16, 1, 0.3, 1);
  transform-origin: top left;
}

.fade-scale-enter-from,
.fade-scale-leave-to {
  opacity: 0;
  transform: scale(0.95);
}
</style>
