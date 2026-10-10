// frontend/src/composables/useBatchClipboard.js
import { useToast } from '@/composables/useToast'

export function useBatchClipboard() {
  const { toast } = useToast()

  /**
   * Menyalin daftar item ke clipboard berdasarkan fungsi pemformatan
   * @param {Array} items - Daftar data yang akan disalin
   * @param {Function} formatterFn - Fungsi yang mengembalikan string untuk setiap baris item
   * @param {string} successMessage - Pesan sukses yang ditampilkan (opsional)
   */
  const copyBatchToClipboard = async (
    items,
    formatterFn,
    successMessage = 'Daftar berhasil disalin ke clipboard.'
  ) => {
    if (!items || items.length === 0) {
      toast('Tidak ada data untuk disalin.', 'warning')
      return
    }

    const text = items.map(formatterFn).join('\n')

    try {
      await navigator.clipboard.writeText(text)
      toast(successMessage, 'success')
    } catch (err) {
      console.error('Failed to copy text: ', err)
      toast('Gagal menyalin teks ke clipboard.', 'error')
    }
  }

  return {
    copyBatchToClipboard
  }
}
