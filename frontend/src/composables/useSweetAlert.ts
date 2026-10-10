// frontend/src/composables/useSweetAlert.js
import Swal from 'sweetalert2'

// Custom class based on standard Tailwind to match the project's vibe
const tailwindCustomClass = {
  popup: 'bg-background text-text rounded-xl shadow-2xl border border-secondary/50 dark:border-secondary',
  title: 'text-text font-bold',
  htmlContainer: 'text-text opacity-90',
  confirmButton: 'bg-primary hover:opacity-90 text-white font-semibold py-2.5 px-5 rounded-lg mx-2 transition-all',
  cancelButton: 'bg-secondary hover:opacity-90 text-text font-semibold py-2.5 px-5 rounded-lg mx-2 transition-all',
  denyButton: 'bg-danger hover:opacity-90 text-white font-semibold py-2.5 px-5 rounded-lg mx-2 transition-all'
}

/**
 * Dialog konfirmasi (Pengganti window.confirm)
 * @param {string} title - Judul konfirmasi
 * @param {string} text - Pesan detail konfirmasi
 * @param {string} confirmText - Teks tombol konfirmasi (default: 'Ya')
 * @param {string} cancelText - Teks tombol batal (default: 'Batal')
 * @returns {Promise<boolean>} True jika user klik konfirmasi, False jika batal.
 */
export const swalConfirm = async (title, text = '', confirmText = 'Ya (Enter)', cancelText = 'Batal (Esc)') => {
  const result = await Swal.fire({
    title,
    text,
    icon: 'warning',
    showCancelButton: true,
    confirmButtonText: confirmText,
    cancelButtonText: cancelText,
    reverseButtons: true, // Typically, cancel on left, confirm on right looks better
    customClass: tailwindCustomClass,
    buttonsStyling: false, // Disable default Swal styles for buttons to use Tailwind
    background: 'hsl(var(--color-background))' // Inject theme background explicitly
  })

  return result.isConfirmed
}

/**
 * Alert umum / Dialog pesan (Pengganti window.alert)
 * @param {string} title - Judul alert
 * @param {string} content - Pesan alert (text atau html)
 * @param {'success'|'error'|'warning'|'info'|'question'} icon - Ikon alert
 * @param {boolean} isHtml - Jika true, content akan di-render sebagai HTML
 * @returns {Promise<void>}
 */
export const swalAlert = async (title, content = '', icon = 'info', isHtml = false) => {
  const options = {
    title,
    icon,
    confirmButtonText: 'Tutup',
    customClass: tailwindCustomClass,
    buttonsStyling: false,
    background: 'hsl(var(--color-background))'
  }

  if (isHtml) {
    options.html = content
  } else {
    options.text = content
  }

  await Swal.fire(options)
}

/**
 * Composable factory function
 * Berguna jika kita butuh dipanggil dari dalam komponen setup Vue,
 * meskipun export function di atas juga bisa diimport langsung.
 */
export function useSweetAlert() {
  return {
    swalConfirm,
    swalAlert
  }
}
