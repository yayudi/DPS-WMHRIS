<script setup>
import { computed } from 'vue'
import { isCheatSheetOpen } from '@/core/presentation/composables/useAppHotkeys'
import BaseModal from '@/core/presentation/components/ui/BaseModal.vue'
import { useI18n } from '@/core/presentation/composables/useI18n'

const { t } = useI18n()

const globalHotkeys = computed(() => [
  { keys: ['Alt', '1'], desc: t('common.hotkey.wms') },
  { keys: ['Alt', '2'], desc: t('common.hotkey.media') },
  { keys: ['Alt', '3'], desc: t('common.hotkey.attendance') },
  { keys: ['Alt', '4'], desc: t('common.hotkey.stats') },
  { keys: ['Alt', '5'], desc: t('common.hotkey.admin') },
  { keys: ['Alt', 'H'], desc: t('common.hotkey.system_guide') },
  { keys: ['Alt', 'T'], desc: t('common.hotkey.toggle_theme') },
  { keys: ['Alt', 'Shift', 'L'], desc: t('common.hotkey.logout') },
  { keys: ['Alt', 'Q'], desc: t('common.hotkey.help') }
])

const localHotkeys = computed(() => [
  { keys: ['/'], desc: t('common.hotkey.focus_search') },
  { keys: ['Alt', 'S'], desc: t('common.hotkey.save_form') },
  { keys: ['Alt', 'N'], desc: t('common.hotkey.add_new') },
  { keys: ['Alt', 'R'], desc: t('common.hotkey.refresh_table') },
  { keys: ['Alt', 'A'], desc: t('common.hotkey.select_all') },
  { keys: ['Ctrl', 'D'], desc: t('common.hotkey.duplicate_row') },
  { keys: ['Shift', 'Del'], desc: t('common.hotkey.delete_row') },
  { keys: ['Esc'], desc: t('common.hotkey.close_modal') }
])

function close() {
  isCheatSheetOpen.value = false
}
</script>

<template>
  <BaseModal :show="isCheatSheetOpen" @close="close" maxWidth="max-w-2xl">
    <template #title>
      <h2 class="text-xl font-bold text-primary flex items-center gap-2 -mt-1">
        <font-awesome-icon icon="fa-solid fa-keyboard" />
        {{ t('common.hotkey.modal_title') }}
      </h2>
    </template>

    <div class="space-y-8 text-text">
      <section>
        <h3 class="text-lg font-semibold mb-4 text-text/90 border-b border-secondary/20 pb-2">{{ t('common.hotkey.section_global') }}</h3>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div
            v-for="hk in globalHotkeys"
            :key="hk.desc"
            class="flex justify-between items-center bg-secondary/25 p-3 rounded-lg border border-secondary/10"
          >
            <span class="text-sm font-medium">{{ hk.desc }}</span>
            <div class="flex gap-1">
              <kbd
                v-for="k in hk.keys"
                :key="k"
                class="bg-background border border-secondary/40 text-text/80 rounded px-2 py-1 text-xs font-mono shadow-sm"
              >
                {{ k }}
              </kbd>
            </div>
          </div>
        </div>
      </section>

      <section>
        <h3 class="text-lg font-semibold mb-4 text-text/90 border-b border-secondary/20 pb-2">{{ t('common.hotkey.section_form') }}</h3>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div
            v-for="hk in localHotkeys"
            :key="hk.desc"
            class="flex justify-between items-center bg-secondary/25 p-3 rounded-lg border border-secondary/10"
          >
            <span class="text-sm font-medium">{{ hk.desc }}</span>
            <div class="flex gap-1">
              <kbd
                v-for="k in hk.keys"
                :key="k"
                class="bg-background border border-secondary/40 text-text/80 rounded px-2 py-1 text-xs font-mono shadow-sm"
              >
                {{ k }}
              </kbd>
            </div>
          </div>
        </div>
      </section>
    </div>
  </BaseModal>
</template>

<style scoped>
.animate-fade-in-up {
  animation: fadeInUp 0.2s ease-out;
}

@keyframes fadeInUp {
  from {
    opacity: 0;
    transform: translateY(10px);
  }

  to {
    opacity: 1;
    transform: translateY(0);
  }
}
</style>
