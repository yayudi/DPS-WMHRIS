/**
 * Composable untuk menangani inline edit yang langsung disimpan (Instant Save).
 * @param {Function} updateApiCall - Fungsi promise yang memanggil endpoint PUT/PATCH (menerima id, payload).
 * @param {Function} buildPayload - Fungsi yang memetakan item menjadi objek payload yang diminta backend.
 * @param {Function} [onSuccess] - Callback opsional ketika penyimpanan berhasil (misalnya untuk fetch ulang data).
 */
export function useInstantInlineEdit(updateApiCall, buildPayload, onSuccess = null) {
  const handleCellBlur = async (event, item, field, validate = null) => {
    const newValue = event.target.innerText.trim()
    
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
        console.error(error)
      }
    }
  }

  return {
    handleCellBlur,
    handleDropdownChange
  }
}
