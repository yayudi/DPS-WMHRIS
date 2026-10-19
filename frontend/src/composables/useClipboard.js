import { useToast } from '@/composables/useToast.js'

/**
 * Composable untuk menyalin teks ke clipboard dengan notifikasi toast terintegrasi.
 * Mendukung Clipboard API modern serta fallback document.execCommand.
 * @returns {{ copyToClipboard: (text: string, fieldName?: string) => void }}
 */
export function useClipboard() {
  const { toast } = useToast()

  /**
   * Salin teks ke clipboard
   * @param {string} text - Teks yang akan disalin
   * @param {string} [fieldName='Teks'] - Nama field atau pesan sukses kustom
   */
  const copyToClipboard = (text, fieldName = 'Teks') => {
    if (!text) return

    const getSuccessMsg = () => {
      if (fieldName.includes('disalin') || fieldName.includes('berhasil') || fieldName.includes('!')) {
        return fieldName
      }
      return `${fieldName} berhasil disalin ke clipboard!`
    }

    const handleSuccess = () => {
      toast(getSuccessMsg(), 'success')
    }

    const handleError = () => {
      toast('Gagal menyalin ke clipboard.', 'error')
    }

    // Modern clipboard API if available
    if (navigator?.clipboard?.writeText && window.isSecureContext) {
      navigator.clipboard.writeText(text)
        .then(handleSuccess)
        .catch(() => fallbackCopyTextToClipboard(text, handleSuccess, handleError))
    } else {
      fallbackCopyTextToClipboard(text, handleSuccess, handleError)
    }
  }

  const fallbackCopyTextToClipboard = (text, onSuccess, onError) => {
    const textArea = document.createElement('textarea')
    textArea.value = text
    
    // Avoid scrolling to bottom
    textArea.style.top = '0'
    textArea.style.left = '0'
    textArea.style.position = 'fixed'

    document.body.appendChild(textArea)
    textArea.focus()
    textArea.select()

    try {
      const successful = document.execCommand('copy')
      if (successful) {
        onSuccess()
      } else {
        onError()
      }
    } catch (e) {
      console.error('Fallback copy error:', e)
      onError()
    } finally {
      document.body.removeChild(textArea)
    }
  }

  return {
    copyToClipboard
  }
}
