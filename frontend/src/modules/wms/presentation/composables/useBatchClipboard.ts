// frontend/src/composables/useBatchClipboard.ts
import { useToast } from '@/core/presentation/composables/useToast'
import { useI18n } from '@/core/presentation/composables/useI18n'

export function useBatchClipboard() {
  const { toast } = useToast()
  const { t } = useI18n()

  /**
   * Menyalin daftar item ke clipboard berdasarkan fungsi pemformatan
   * @param items - Daftar data yang akan disalin
   * @param formatterFn - Fungsi yang mengembalikan string untuk setiap baris item
   * @param successMessage - Pesan sukses yang ditampilkan (opsional)
   */
  const copyBatchToClipboard = async <T = any>(
    items: T[],
    formatterFn: (item: T) => string,
    successMessage?: string
  ) => {
    if (!items || items.length === 0) {
      toast(t('wms.clipboard.no_data'), 'warning')
      return
    }

    const text = items.map(formatterFn).join('\n')

    try {
      await navigator.clipboard.writeText(text)
      toast(successMessage || t('wms.clipboard.copy_success'), 'success')
    } catch (err) {
      console.error('Failed to copy text: ', err)
      toast(t('wms.clipboard.copy_failed'), 'error')
    }
  }

  return {
    copyBatchToClipboard
  }
}
