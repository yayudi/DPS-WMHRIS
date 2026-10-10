// frontend/src/composables/usePwaInstall.js
import { ref, computed, onMounted, onUnmounted } from 'vue'

/**
 * Composable untuk mengelola instalasi PWA.
 * Menangani 2 skenario berbeda:
 * - Chrome/Edge: Menggunakan `beforeinstallprompt` event (native prompt)
 * - iOS Safari: Menampilkan instruksi manual "Add to Home Screen"
 *
 * @returns {{ isInstallable: import('vue').Ref<boolean>, isBannerDismissed: import('vue').Ref<boolean>, isIos: import('vue').Ref<boolean>, isStandalone: import('vue').ComputedRef<boolean>, installPwa: () => Promise<void>, dismissPrompt: () => void }}
 */
export const usePwaInstall = () => {
  const deferredPrompt = ref(null)
  const canNativeInstall = ref(false)
  const isBannerDismissed = ref(false)
  const isIos = ref(false)

  /** Deteksi apakah app sudah berjalan dalam mode standalone (sudah di-install) */
  const isStandalone = computed(() =>
    window.matchMedia('(display-mode: standalone)').matches ||
    window.navigator.standalone === true,
  )

  /** Menentukan apakah banner install harus ditampilkan (Chrome native ATAU iOS manual) */
  const isInstallable = computed(() => {
    if (isStandalone.value) return false
    return canNativeInstall.value || isIos.value
  })

  /** Cek apakah user pernah dismiss prompt akhir-akhir ini (batas: 14 hari) */
  const checkDismissStatus = () => {
    const dismissedAt = localStorage.getItem('pwa_install_dismissed')
    if (dismissedAt) {
      const daysSinceDismissed = (Date.now() - Number(dismissedAt)) / (1000 * 60 * 60 * 24)
      if (daysSinceDismissed < 14) {
        isBannerDismissed.value = true
        return
      }
    }
    isBannerDismissed.value = false
  }

  /** Deteksi iOS Safari (bukan Chrome di iOS, bukan standalone) */
  const detectIos = () => {
    const ua = window.navigator.userAgent
    const isIosDevice = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
    // Pastikan bukan browser in-app (Chrome/Firefox di iOS tetap WebKit tapi tidak support A2HS flow yang sama)
    const isSafari = /Safari/.test(ua) && !/CriOS|FxiOS|OPiOS|EdgiOS/.test(ua)
    isIos.value = isIosDevice && isSafari
  }

  const handleBeforeInstallPrompt = (e) => {
    e.preventDefault()
    deferredPrompt.value = e
    canNativeInstall.value = true
    checkDismissStatus()
  }

  const handleAppInstalled = () => {
    canNativeInstall.value = false
    deferredPrompt.value = null
  }

  onMounted(() => {
    detectIos()
    checkDismissStatus()

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
    window.addEventListener('appinstalled', handleAppInstalled)
  })

  onUnmounted(() => {
    window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
    window.removeEventListener('appinstalled', handleAppInstalled)
  })

  const dismissPrompt = () => {
    isBannerDismissed.value = true
    localStorage.setItem('pwa_install_dismissed', Date.now().toString())
  }

  /** Trigger native install prompt (hanya untuk Chrome/Edge, bukan iOS) */
  const installPwa = async () => {
    if (!deferredPrompt.value) return

    deferredPrompt.value.prompt()
    const { outcome } = await deferredPrompt.value.userChoice
    console.log(`User response to the install prompt: ${outcome}`)

    deferredPrompt.value = null
    canNativeInstall.value = false
  }

  return {
    isInstallable,
    isBannerDismissed,
    isIos,
    isStandalone,
    installPwa,
    dismissPrompt,
  }
}
