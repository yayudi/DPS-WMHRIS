// frontend/src/composables/useToast.js
import Swal from 'sweetalert2'
import { useLocaleStore } from '@/core/presentation/stores/localeStore'

const I18N_KEY_PATTERN = /^[a-z0-9_]+(\.[a-z0-9_.-]+)+$/i

const Toast = Swal.mixin({
  toast: true,
  position: 'top-end',
  showConfirmButton: false,
  timerProgressBar: true,
  iconColor: 'white',
  color: 'white',
  customClass: {
    popup: '!rounded-lg !shadow-xl',
    title: 'font-medium text-sm',
    container: 'z-[999999999]'
  },
  didOpen: toast => {
    toast.addEventListener('mouseenter', Swal.stopTimer)
    toast.addEventListener('mouseleave', Swal.resumeTimer)
  }
})

/**
 * Composable untuk menampilkan toast notification dari komponen manapun.
 * Menggunakan SweetAlert2 under the hood.
 * @returns {{ toast: (msg: string, type?: 'info'|'success'|'error'|'warning', duration?: number) => void }}
 */
export function useToast() {
  const toast = (msg: string, type: 'info' | 'success' | 'error' | 'warning' = 'info', duration = 3000) => {
    // Memetakan tipe toast ke variabel warna tema CSS
    const colorMap = {
      success: 'success',
      error: 'danger',
      warning: 'warning',
      info: 'primary'
    }
    
    const colorVar = colorMap[type] || 'primary'

    // Fallback resolusi otomatis jika string pesan berbentuk i18n key mentah (mis. sebelum DB ter-seed)
    let resolvedMsg = typeof msg === 'string' ? msg.trim() : String(msg ?? '')
    if (resolvedMsg && I18N_KEY_PATTERN.test(resolvedMsg)) {
      try {
        const localeStore = useLocaleStore()
        resolvedMsg = localeStore.dictionary[resolvedMsg] ?? resolvedMsg
      } catch {
        // Abaikan jika Pinia belum aktif
      }
    }

    Toast.fire({
      icon: type,
      title: resolvedMsg,
      timer: duration,
      background: `hsl(var(--color-${colorVar}))`
    })
  }
  return { toast }
}
