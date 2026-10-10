import { ref, watch } from 'vue'

/**
 * Composable untuk mengatur visibilitas kolom pada tabel (disimpan di localStorage)
 * @param {string} storageKey - Kunci untuk menyimpan data di localStorage
 * @param {Array<string>} defaultColumns - Array string ID kolom yang default tampil
 */
export function useColumnVisibility(storageKey, defaultColumns = []) {
  const visibleColumns = ref(new Set(defaultColumns))
  const savedColumns = localStorage.getItem(storageKey)

  if (savedColumns) {
    try {
      visibleColumns.value = new Set(JSON.parse(savedColumns))
    } catch (e) {
      console.error(`Error parsing saved columns for ${storageKey}`, e)
    }
  }

  watch(
    visibleColumns,
    (newVal) => {
      localStorage.setItem(storageKey, JSON.stringify([...newVal]))
    },
    { deep: true }
  )

  const toggleColumn = (columnId) => {
    if (visibleColumns.value.has(columnId)) {
      visibleColumns.value.delete(columnId)
    } else {
      visibleColumns.value.add(columnId)
    }
  }

  return {
    visibleColumns,
    toggleColumn
  }
}
