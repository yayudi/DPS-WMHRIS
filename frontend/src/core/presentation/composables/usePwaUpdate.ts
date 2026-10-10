// frontend/src/composables/usePwaUpdate.js
import { useRegisterSW } from 'virtual:pwa-register/vue'
import { watch } from 'vue'

// Variabel global untuk diakses dari luar (contoh: auth.js)
export let triggerPwaUpdate = null
export let isPwaUpdateAvailable = false

/**
 * Composable for detecting and handling PWA service worker updates.
 * Uses prompt-based registration — user must explicitly accept the update.
 *
 * @returns {{ needRefresh: import('vue').Ref<boolean>, updateServiceWorker: () => Promise<void>, dismissUpdate: () => void }}
 */
export const usePwaUpdate = () => {
  const { needRefresh, updateServiceWorker } = useRegisterSW({
    onNeedRefresh() {
      // Hapus timeout 1 jam, ganti dengan trigger saat login/logout (di auth.js)
      isPwaUpdateAvailable = true
    },
    onRegistered(registration) {
      if (registration) {
        // Check for updates periodically (e.g. every 1 hour)
        setInterval(() => {
          registration.update()
        }, 60 * 60 * 1000)

        // Cek update instan saat user kembali membuka tab aplikasi (Throttled: max 1 kali per 5 menit)
        let lastCheck = 0;
        const THROTTLE_MS = 5 * 60 * 1000; // 5 menit

        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'visible') {
            const now = Date.now();
            if (now - lastCheck > THROTTLE_MS) {
              registration.update();
              lastCheck = now;
            }
          }
        });
      }
    },
    onRegisterError(error) {
      console.error('SW registration error:', error)
    },
  })

  const dismissUpdate = () => {
    needRefresh.value = false
    isPwaUpdateAvailable = false
  }

  // Assign ke variabel global agar bisa dipanggil dari store/auth.js
  triggerPwaUpdate = updateServiceWorker
  
  // Update state global setiap kali needRefresh berubah
  watch(needRefresh, (val) => {
    isPwaUpdateAvailable = val
  })

  return { needRefresh, updateServiceWorker, dismissUpdate }
}
