<script setup>
import { ref, onMounted } from 'vue'
import { usePwaInstall } from '@/composables/usePwaInstall'

const { isInstallable, isBannerDismissed } = usePwaInstall()
const isHotkeyBannerDismissed = ref(true)

onMounted(() => {
  const dismissedAt = localStorage.getItem('hotkey_banner_dismissed')
  if (!dismissedAt) {
    isHotkeyBannerDismissed.value = false

    // Auto-close timeout (10 seconds)
    setTimeout(() => {
      dismissHotkeyBanner()
    }, 10000)
  }
})

const dismissHotkeyBanner = () => {
  if (isHotkeyBannerDismissed.value) return
  isHotkeyBannerDismissed.value = true
  localStorage.setItem('hotkey_banner_dismissed', Date.now().toString())
}
</script>

<template>
  <Transition name="pwa-install-slide">
    <div v-if="!isHotkeyBannerDismissed && (!isInstallable || isBannerDismissed)" id="hotkey-info-banner"
      class="fixed bottom-20 sm:bottom-4 left-1/2 -translate-x-1/2 z-40 w-[90%] max-w-sm bg-secondary border border-primary/20 rounded-xl shadow-2xl px-5 py-4 flex items-start gap-4">
      <div class="flex-shrink-0 bg-background/50 p-2 rounded-lg mt-4">
        <font-awesome-icon icon="fa-solid fa-keyboard" class="text-primary text-xl" />
      </div>
      <div class="flex-1 min-w-0 text-text font-mono text-[10px]">
        <p class="text-text text-sm font-semibold">Gunakan Keyboard Shortcut!</p>
        <p class="flex items-center gap-2 mt-0.5">
          <kbd class="px-1.5 py-0.5 bg-background border border-secondary/50 rounded-md shadow-sm">Alt</kbd>
          + <kbd class="px-1.5 py-0.5 bg-background border border-secondary/50 rounded-md shadow-sm">/</kbd>
          untuk melihat daftar Hotkey
        </p>
        <p class="flex items-center gap-2 mt-0.5">
          <kbd class="px-1.5 py-0.5 bg-background border border-secondary/50 rounded-md shadow-sm">Alt</kbd>
          + <kbd class="px-1.5 py-0.5 bg-background border border-secondary/50 rounded-md shadow-sm">H</kbd>untuk panduan sistem.
        </p>
        <p class="flex items-center gap-2 mt-0.5">
          <kbd class="px-1.5 py-0.5 bg-background border border-secondary/50 rounded-md shadow-sm">Alt</kbd>
          + <kbd class="px-1.5 py-0.5 bg-background border border-secondary/50 rounded-md shadow-sm">S</kbd>untuk submit/simpan form.
        </p>
      </div>
      <div class="flex-shrink-0">
        <button @click="dismissHotkeyBanner"
          class="p-1.5 text-text/40 hover:text-text hover:bg-background/50 rounded-lg transition-colors"
          aria-label="Tutup">
          <font-awesome-icon icon="fa-solid fa-xmark" />
        </button>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.pwa-install-slide-enter-active,
.pwa-install-slide-leave-active {
  transition: all 0.4s cubic-bezier(0.16, 1, 0.3, 1);
}

.pwa-install-slide-enter-from,
.pwa-install-slide-leave-to {
  transform: translateX(-50%) translateY(120%);
  opacity: 0;
}
</style>
