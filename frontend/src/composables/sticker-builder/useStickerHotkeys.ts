import { onMounted, onUnmounted } from 'vue'

export function useStickerHotkeys({
  getShow,
  getFabricCanvas,
  deleteSelected,
  handleSelection,
  syncLayers,
  saveTemplate,
  undo,
  redo,
  duplicateSelected,
  copySelected,
  pasteCopied,
  groupSelected,
  ungroupSelected,
  updateProperty
}) {
  const handleKeydown = e => {
    if (!getShow() || !getFabricCanvas()) return
    const target = e.target
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return

    const canvas = getFabricCanvas()

    if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault()
      deleteSelected()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      canvas.discardActiveObject()
      canvas.requestRenderAll()
      handleSelection()
      syncLayers()
    } else if (e.ctrlKey || e.metaKey) {
      const k = e.key.toLowerCase()
      if (k === 's') {
        e.preventDefault()
        saveTemplate()
      } else if (k === 'z') {
        e.preventDefault()
        if (e.shiftKey) redo()
        else undo()
      } else if (k === 'y') {
        e.preventDefault()
        redo()
      } else if (k === 'd') {
        e.preventDefault()
        duplicateSelected()
      } else if (k === 'c') {
        e.preventDefault()
        copySelected()
      } else if (k === 'v') {
        e.preventDefault()
        pasteCopied()
      } else if (k === 'g') {
        e.preventDefault()
        if (e.shiftKey) ungroupSelected()
        else groupSelected()
      } else if (k === 'b') {
        e.preventDefault()
        const activeObject = canvas.getActiveObject()
        if (activeObject && (activeObject.type === 'i-text' || activeObject.type === 'text')) {
          updateProperty('fontWeight', activeObject.fontWeight === 'bold' ? 'normal' : 'bold')
        }
      } else if (k === 'i') {
        e.preventDefault()
        const activeObject = canvas.getActiveObject()
        if (activeObject && (activeObject.type === 'i-text' || activeObject.type === 'text')) {
          updateProperty('fontStyle', activeObject.fontStyle === 'italic' ? 'normal' : 'italic')
        }
      } else if (k === 'u') {
        e.preventDefault()
        const activeObject = canvas.getActiveObject()
        if (activeObject && (activeObject.type === 'i-text' || activeObject.type === 'text')) {
          updateProperty('underline', !activeObject.underline)
        }
      }
    } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      const activeObject = canvas.getActiveObject()
      if (activeObject && activeObject.id !== 'paper-bg') {
        e.preventDefault()
        const step = e.shiftKey ? 10 : 1
        if (e.key === 'ArrowUp') activeObject.top -= step
        else if (e.key === 'ArrowDown') activeObject.top += step
        else if (e.key === 'ArrowLeft') activeObject.left -= step
        else if (e.key === 'ArrowRight') activeObject.left += step
        activeObject.setCoords()
        canvas.requestRenderAll()
        handleSelection()
        syncLayers()
      }
    }
  }

  onMounted(() => {
    window.addEventListener('keydown', handleKeydown)
  })

  onUnmounted(() => {
    window.removeEventListener('keydown', handleKeydown)
  })
}
