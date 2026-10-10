// frontend\src\composables\useListNavigation.js
import { ref, watch, nextTick } from 'vue'

/**
 * Composable untuk menangani navigasi keyboard pada list/dropdown.
 *
 * @param {import('vue').Ref<HTMLElement | null>} listRef - Referensi ke elemen kontainer list
 * @param {import('vue').Ref<Array>} itemsRef - Referensi ke array data item
 * @param {Function} onSelect - Callback yang dipanggil saat user menekan Enter pada item tertentu
 * @param {String} itemSelector - CSS selector untuk item list (default: 'li')
 */
export function useListNavigation(listRef, itemsRef, onSelect, itemSelector = 'li') {
  const selectedIndex = ref(-1)

  // Reset indeks seleksi setiap kali daftar item berubah
  watch(itemsRef, () => {
    selectedIndex.value = -1
  })

  const scrollToSelected = () => {
    nextTick(() => {
      if (!listRef.value) return
      const items = listRef.value.querySelectorAll(itemSelector)
      if (items[selectedIndex.value]) {
        items[selectedIndex.value].scrollIntoView({ block: 'nearest' })
      }
    })
  }

  /**
   * Handler untuk event keydown.
   *
   * @param {KeyboardEvent} event
   * @param {Boolean} isOpen - Apakah dropdown sedang terbuka
   */
  const handleNavigation = (event, isOpen) => {
    if (!isOpen || itemsRef.value.length === 0) return

    if (event.key === 'ArrowDown') {
      event.preventDefault()
      if (selectedIndex.value < itemsRef.value.length - 1) {
        selectedIndex.value++
        scrollToSelected()
      }
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      if (selectedIndex.value > 0) {
        selectedIndex.value--
        scrollToSelected()
      } else if (selectedIndex.value === -1) {
        selectedIndex.value = itemsRef.value.length - 1
        scrollToSelected()
      }
    } else if (event.key === 'Enter') {
      event.preventDefault()
      if (selectedIndex.value >= 0 && selectedIndex.value < itemsRef.value.length) {
        onSelect(itemsRef.value[selectedIndex.value])
      } else {
        onSelect(itemsRef.value[0])
      }
    }
  }

  return {
    selectedIndex,
    handleNavigation
  }
}
