import { useToast } from '@/core/presentation/composables/useToast'
import { useI18n } from '@/core/presentation/composables/useI18n'

export function useClipboard() {
  const { toast } = useToast()
  const { t } = useI18n()

  const copyToClipboard = (text: string, fieldName?: string) => {
    if (!text) return
    const targetField = fieldName || t('common.label.text')

    // Fallback using modern clipboard API if available
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text).then(() => {
        toast(t('common.toast.copy_success', { field: targetField }), 'success')
      }).catch(() => {
        fallbackCopyTextToClipboard(text, targetField)
      })
    } else {
      fallbackCopyTextToClipboard(text, targetField)
    }
  }

  const fallbackCopyTextToClipboard = (text: string, targetField: string) => {
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
      toast(t('common.toast.copy_success', { field: targetField }), 'success')
    } catch (e) {
      console.error(e) // Prevent unused var
      toast(t('common.toast.copy_error'), 'error')
    }

    document.body.removeChild(textArea)
  }

  return {
    copyToClipboard
  }
}
