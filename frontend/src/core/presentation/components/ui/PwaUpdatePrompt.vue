<script setup>
import { usePwaUpdate } from '@/core/presentation/composables/usePwaUpdate'
import { useI18n } from '@/core/presentation/composables/useI18n'

const { needRefresh, updateServiceWorker, dismissUpdate } = usePwaUpdate()
const { t } = useI18n()
</script>

<template>
  <Transition name="pwa-slide">
    <div
      v-if="needRefresh"
      id="pwa-update-prompt"
      class="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 w-[90%] max-w-md bg-secondary border border-secondary/30 rounded-xl shadow-2xl px-5 py-4 flex items-center gap-4"
    >
      <div class="flex-shrink-0">
        <font-awesome-icon icon="fa-solid fa-arrow-up-from-bracket" class="text-primary text-xl" />
      </div>
      <div class="flex-1 min-w-0">
        <p class="text-text text-sm font-semibold">{{ t('common.pwa.new_version') }}</p>
        <p class="text-text/60 text-xs mt-0.5">{{ t('common.pwa.update_desc') }}</p>
      </div>
      <div class="flex items-center gap-2 flex-shrink-0">
        <button
          @click="dismissUpdate"
          class="px-3 py-1.5 text-xs font-medium text-text/60 hover:text-text rounded-lg transition-colors"
        >
          {{ t('common.pwa.btn_later') }}
        </button>
        <button
          @click="updateServiceWorker()"
          class="px-3 py-1.5 text-xs font-semibold text-white bg-primary hover:bg-primary/80 rounded-lg transition-colors"
        >
          {{ t('common.pwa.btn_update') }}
        </button>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.pwa-slide-enter-active,
.pwa-slide-leave-active {
  transition: all 0.35s cubic-bezier(0.16, 1, 0.3, 1);
}
.pwa-slide-enter-from,
.pwa-slide-leave-to {
  transform: translateX(-50%) translateY(100%);
  opacity: 0;
}
</style>
