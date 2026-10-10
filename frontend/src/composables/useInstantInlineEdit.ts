import { useToast } from '@/composables/useToast'

/**
 * Composable untuk menangani inline edit yang langsung disimpan (Instant Save).
 * @param {Function} updateApiCall - Fungsi promise yang memanggil endpoint PUT/PATCH (menerima id, payload).
 * @param {Function} buildPayload - Fungsi yang memetakan item menjadi objek payload yang diminta backend.
 * @param {Function} [onSuccess] - Callback opsional ketika penyimpanan berhasil (misalnya untuk fetch ulang data).
 */
export function useInstantInlineEdit(updateApiCall, buildPayload, onSuccess = null) {
  const { toast } = useToast()

  const handleCellBlur = async (event, item, field, validate = null) => {
    let newValue = event.target.innerText.trim()
    
    if (item[field] !== newValue) {
      if (validate && !validate(newValue)) {
        event.target.innerText = item[field]
        return
      }
      const originalValue = item[field]
      try {
        item[field] = newValue
        const payload = buildPayload(item)
        await updateApiCall(item.id, payload)
        if (onSuccess) onSuccess()
      } catch (error) {
        item[field] = originalValue
        event.target.innerText = originalValue
        toast(error.response?.data?.message || 'Gagal memperbarui data', 'error')
        console.error(error)
      }
    }
  }

  const handleDropdownChange = async (item, field, newValue) => {
    if (item[field] !== newValue) {
      const originalValue = item[field]
      try {
        item[field] = newValue
        const payload = buildPayload(item)
        await updateApiCall(item.id, payload)
        if (onSuccess) onSuccess()
      } catch (error) {
        item[field] = originalValue
        toast(error.response?.data?.message || 'Gagal memperbarui data', 'error')
        console.error(error)
      }
    }
  }

  return {
    handleCellBlur,
    handleDropdownChange
  }
}
