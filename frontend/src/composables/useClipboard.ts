import { useToast } from '@/composables/useToast'

export function useClipboard() {
  const { toast } = useToast()

  const copyToClipboard = (text, fieldName = 'Teks') => {
    if (!text) return

    // Fallback using modern clipboard API if available
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text).then(() => {
        toast(`${fieldName} berhasil disalin ke clipboard!`, 'success')
      }).catch(() => {
        fallbackCopyTextToClipboard(text, fieldName)
      })
    } else {
      fallbackCopyTextToClipboard(text, fieldName)
    }
  }

  const fallbackCopyTextToClipboard = (text, fieldName) => {
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
      document.execCommand('copy')
      toast(`${fieldName} berhasil disalin ke clipboard!`, 'success')
    } catch (e) {
      console.error(e) // Prevent unused var
      toast('Gagal menyalin teks.', 'error')
    }

    document.body.removeChild(textArea)
  }

  return {
    copyToClipboard
  }
}
