<script setup>
import { usePwaInstall } from '@/composables/usePwaInstall'
const { isInstallable, isBannerDismissed, isIos, installPwa, dismissPrompt } = usePwaInstall()
</script>

<template>
  <Transition name="pwa-install-slide">
    <div v-if="isInstallable && !isBannerDismissed" id="pwa-install-banner"
      class="fixed bottom-20 sm:bottom-4 left-1/2 -translate-x-1/2 z-40 w-[90%] max-w-md bg-secondary border border-primary/20 rounded-xl shadow-2xl px-5 py-4">
      <!-- iOS Safari: Instruksi manual -->
      <div v-if="isIos" class="flex flex-col gap-3">
        <div class="flex items-start gap-3">
          <div class="flex-shrink-0 bg-background/50 p-2 rounded-lg">
            <font-awesome-icon icon="fa-solid fa-mobile-screen-button" class="text-primary text-2xl" />
          </div>
          <div class="flex-1 min-w-0">
            <p class="text-text text-sm font-semibold">Install Aplikasi WMS</p>
            <p class="text-text/60 text-xs mt-1 leading-relaxed">
              Untuk menginstall di iPhone/iPad:
            </p>
          </div>
          <button @click="dismissPrompt" class="flex-shrink-0 p-1 text-text/40 hover:text-text transition-colors"
            aria-label="Tutup">
            <font-awesome-icon icon="fa-solid fa-xmark" />
          </button>
        </div>

        <div class="flex items-center gap-3 bg-background/30 rounded-lg px-3 py-2.5 text-xs text-text/80">
          <span class="font-medium">1.</span>
          <span>Ketuk tombol <strong class="text-primary">Share</strong></span>
          <font-awesome-icon icon="fa-solid fa-arrow-up-from-bracket" class="text-primary text-sm" />
        </div>
        <div class="flex items-center gap-3 bg-background/30 rounded-lg px-3 py-2.5 text-xs text-text/80">
          <span class="font-medium">2.</span>
          <span>Pilih <strong class="text-primary">"Add to Home Screen"</strong></span>
          <font-awesome-icon icon="fa-solid fa-plus-square" class="text-primary text-sm" />
        </div>
      </div>

      <!-- Chrome/Edge: Tombol install native -->
      <div v-else class="flex items-center gap-4">
        <div class="flex-shrink-0 bg-background/50 p-2 rounded-lg">
          <font-awesome-icon icon="fa-solid fa-mobile-screen-button" class="text-primary text-2xl" />
        </div>
        <div class="flex-1 min-w-0">
          <p class="text-text text-sm font-semibold">Install Aplikasi WMS</p>
          <p class="text-text/60 text-xs mt-0.5">Akses lebih cepat & optimal langsung dari layar Home HP Anda.</p>
        </div>
        <div class="flex flex-col items-center gap-2 flex-shrink-0">
          <button @click="installPwa"
            class="w-full px-4 py-1.5 text-xs font-semibold text-white bg-primary hover:bg-primary/80 rounded-lg transition-colors">
            Install
          </button>
          <button @click="dismissPrompt"
            class="w-full px-4 py-1 text-xs font-medium text-text/50 hover:text-text rounded-lg transition-colors">
            Nanti
          </button>
        </div>
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
