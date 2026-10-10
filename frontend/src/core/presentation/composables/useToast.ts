// frontend/src/composables/useToast.js
import Swal from 'sweetalert2'

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
  const toast = (msg, type = 'info', duration = 3000) => {
    // Memetakan tipe toast ke variabel warna tema CSS
    const colorMap = {
      success: 'success',
      error: 'danger',
      warning: 'warning',
      info: 'primary'
    }
    
    const colorVar = colorMap[type] || 'primary'

    Toast.fire({
      icon: type,
      title: msg,
      timer: duration,
      background: `hsl(var(--color-${colorVar}))`
    })
  }
  return { toast }
}
