<script setup>
import { ref, toRef } from 'vue'
import { useFloating, offset, flip, shift, arrow, autoUpdate } from '@floating-ui/vue'

defineOptions({
  inheritAttrs: false
})
import { useMobile } from '@/composables/useMobile'

const { isMobile } = useMobile()

const props = defineProps({
  show: Boolean,
  referenceEl: { type: [Object, null] },
  title: String,
  loading: Boolean,
  placement: { type: String, default: 'top' },
  showArrow: { type: Boolean, default: true },
  interactive: { type: Boolean, default: false },
  variant: { type: String, default: 'default' }
})

const floating = ref(null)
const floatingArrow = ref(null)

const {
  floatingStyles,
  middlewareData,
  placement: finalPlacement
} = useFloating(toRef(props, 'referenceEl'), floating, {
  placement: props.placement,
  strategy: 'fixed',
  middleware: [
    offset(8),
    flip(),
    shift({ padding: 8 }),
    props.showArrow ? arrow({ element: floatingArrow }) : undefined
  ].filter(Boolean),
  whileElementsMounted: autoUpdate
})
</script>

<template>
  <Teleport to="body">
    <Transition name="fade">
      <div v-if="show && !isMobile" ref="floating" :style="floatingStyles" v-bind="$attrs"
        class="fixed z-[9999] max-w-xs rounded-lg shadow-xl backdrop-blur-md"
        :class="[
          !interactive ? 'pointer-events-none' : '',
          variant === 'compact'
            ? 'px-2 py-1 bg-text text-background text-[11px] font-medium border border-transparent'
            : 'min-w-[150px] p-3 bg-background text-text text-xs border border-secondary/50'
        ]">
        <div v-if="title"
          class="font-bold text-primary mb-2 uppercase text-[10px] tracking-wider text-center border-b border-primary/50 pb-1">
          {{ title }}
        </div>

        <div v-if="loading" class="flex justify-center items-center py-2">
          <font-awesome-icon icon="fa-solid fa-circle-notch" spin class="text-primary text-lg" />
        </div>

        <slot v-else />

        <!-- Arrow -->
        <div v-if="showArrow" ref="floatingArrow"
          class="absolute w-2.5 h-2.5 rotate-45 pointer-events-none z-[-1]"
          :class="variant === 'compact' ? 'bg-text' : 'bg-background'"
          :style="{
            left: middlewareData.arrow?.x != null ? `${middlewareData.arrow.x}px` : '',
            top: middlewareData.arrow?.y != null ? `${middlewareData.arrow.y}px` : '',
            right: '',
            bottom: '',
            [finalPlacement.split('-')[0] === 'top' ? 'bottom' : finalPlacement.split('-')[0] === 'bottom' ? 'top' : finalPlacement.split('-')[0] === 'left' ? 'right' : 'left']: '-5px',
            borderTop: ['bottom', 'left'].includes(finalPlacement.split('-')[0]) ? 'none' : '',
            borderLeft: ['bottom', 'right'].includes(finalPlacement.split('-')[0]) ? 'none' : '',
            borderRight: ['top', 'left'].includes(finalPlacement.split('-')[0]) ? 'none' : '',
            borderBottom: ['top', 'right'].includes(finalPlacement.split('-')[0]) ? 'none' : ''
          }">
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
  transform: translateY(4px);
}
</style>
