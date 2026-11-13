import Swal from 'sweetalert2'
import { useI18n } from '@/core/presentation/composables/useI18n'

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
 * @param {string} [confirmText] - Teks tombol konfirmasi
 * @param {string} [cancelText] - Teks tombol batal
 * @returns {Promise<boolean>} True jika user klik konfirmasi, False jika batal.
 */
export const swalConfirm = async (
  title: string,
  text: string = '',
  confirmText?: string,
  cancelText?: string
): Promise<boolean> => {
  let resolvedConfirm = confirmText
  let resolvedCancel = cancelText

  try {
    const { t } = useI18n()
    resolvedConfirm = resolvedConfirm ?? t('common.btn.yes_enter', undefined, 'Ya (Enter)')
    resolvedCancel = resolvedCancel ?? t('common.btn.cancel_esc', undefined, 'Batal (Esc)')
  } catch {
    resolvedConfirm = resolvedConfirm ?? 'Ya (Enter)'
    resolvedCancel = resolvedCancel ?? 'Batal (Esc)'
  }

  const result = await Swal.fire({
    title,
    text,
    icon: 'warning',
    showCancelButton: true,
    confirmButtonText: resolvedConfirm,
    cancelButtonText: resolvedCancel,
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
export const swalAlert = async (
  title: string,
  content: string = '',
  icon: 'success' | 'error' | 'warning' | 'info' | 'question' = 'info',
  isHtml: boolean = false
): Promise<void> => {
  let resolvedClose = 'Tutup'
  try {
    const { t } = useI18n()
    resolvedClose = t('common.btn.close', undefined, 'Tutup')
  } catch {
    resolvedClose = 'Tutup'
  }

  const options: Record<string, any> = {
    title,
    icon,
    confirmButtonText: resolvedClose,
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
