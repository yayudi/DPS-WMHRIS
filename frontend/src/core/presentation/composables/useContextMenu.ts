import { ref } from 'vue'

/**
 * Composable untuk manajemen state Context Menu.
 */
export function useContextMenu() {
  const contextMenu = ref({
    visible: false,
    x: 0,
    y: 0,
    row: null
  })

  const openContextMenu = (event, row) => {
    contextMenu.value = {
      visible: true,
      x: event.clientX,
      y: event.clientY,
      row
    }
  }

  const closeContextMenu = () => {
    contextMenu.value.visible = false
  }

  return {
    contextMenu,
    openContextMenu,
    closeContextMenu
  }
}
