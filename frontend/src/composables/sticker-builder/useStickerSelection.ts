import { ref, shallowRef } from 'vue'
import * as fabric from 'fabric'

export function useStickerSelection(getFabricCanvas, emitChange) {
  const activeObject = shallowRef(null)

  // Transform Properties
  const activeObjLeft = ref(0)
  const activeObjTop = ref(0)
  const activeObjWidth = ref(0)
  const activeObjHeight = ref(0)
  const activeObjAngle = ref(0)
  const activeObjFlipX = ref(false)
  const activeObjFlipY = ref(false)

  // Appearance Properties
  const activeObjFontSize = ref(40)
  const activeObjTextAlign = ref('center')
  const activeObjFontWeight = ref('normal')
  const activeObjFontStyle = ref('normal')
  const activeObjUnderline = ref(false)
  const activeObjLinethrough = ref(false)
  const activeObjFill = ref('#000000')
  const activeObjStroke = ref('#000000')
  const activeObjStrokeWidth = ref(0)
  const activeObjOpacity = ref(1)

  const handleSelection = () => {
    const canvas = getFabricCanvas()
    if (!canvas) return
    const active = canvas.getActiveObject()
    if (active) {
      activeObject.value = active

      // Transform Properties
      activeObjLeft.value = Math.round(active.left || 0)
      activeObjTop.value = Math.round(active.top || 0)
      activeObjWidth.value = Math.round((active.width || 0) * (active.scaleX || 1))
      activeObjHeight.value = Math.round((active.height || 0) * (active.scaleY || 1))
      activeObjAngle.value = Math.round(active.angle || 0)
      activeObjFlipX.value = active.flipX || false
      activeObjFlipY.value = active.flipY || false

      // Appearance Properties
      activeObjFill.value = active.fill || '#000000'
      activeObjStroke.value = active.stroke || '#000000'
      activeObjStrokeWidth.value = active.strokeWidth || 0
      activeObjOpacity.value = active.opacity ?? 1

      // Text Properties
      if (active.type === 'i-text' || active.type === 'text' || active.type === 'textbox') {
        activeObjFontSize.value = active.fontSize || 40
        activeObjTextAlign.value = active.textAlign || 'left'
        activeObjFontWeight.value = active.fontWeight || 'normal'
        activeObjFontStyle.value = active.fontStyle || 'normal'
        activeObjUnderline.value = active.underline || false
        activeObjLinethrough.value = active.linethrough || false
      }
    } else {
      activeObject.value = null
    }
  }

  const updateProperty = (key, value) => {
    const canvas = getFabricCanvas()
    if (!activeObject.value || !canvas) return
    activeObject.value.set(key, value)

    if (key === 'fontSize') activeObjFontSize.value = value
    if (key === 'textAlign') activeObjTextAlign.value = value
    if (key === 'fontWeight') activeObjFontWeight.value = value
    if (key === 'fontStyle') activeObjFontStyle.value = value
    if (key === 'underline') activeObjUnderline.value = value
    if (key === 'linethrough') activeObjLinethrough.value = value
    if (key === 'fill') activeObjFill.value = value
    if (key === 'stroke') activeObjStroke.value = value
    if (key === 'strokeWidth') activeObjStrokeWidth.value = value
    if (key === 'opacity') activeObjOpacity.value = value

    activeObject.value.setCoords()
    emitChange()
  }

  const updateTransformProperty = (key, value) => {
    const canvas = getFabricCanvas()
    if (!activeObject.value || !canvas) return

    const obj = activeObject.value

    if (key === 'width') {
      if (obj.width > 0) obj.set('scaleX', value / obj.width)
      activeObjWidth.value = value
    } else if (key === 'height') {
      if (obj.height > 0) obj.set('scaleY', value / obj.height)
      activeObjHeight.value = value
    } else {
      obj.set(key, value)
      if (key === 'left') activeObjLeft.value = value
      if (key === 'top') activeObjTop.value = value
      if (key === 'angle') activeObjAngle.value = value
      if (key === 'flipX') activeObjFlipX.value = value
      if (key === 'flipY') activeObjFlipY.value = value
    }

    emitChange()
  }

  const alignObjects = alignment => {
    const canvas = getFabricCanvas()
    if (!canvas || !activeObject.value) return

    const objType = activeObject.value.type ? activeObject.value.type.toLowerCase() : ''
    const isGroup = objType === 'activeselection'
    let objectsToAlign = []
    let referenceBox = null

    if (isGroup) {
      objectsToAlign = [...activeObject.value.getObjects()]
      referenceBox = activeObject.value.getBoundingRect()
      canvas.discardActiveObject()
    } else {
      objectsToAlign = [activeObject.value]
      const paperBg = canvas.getObjects().find(o => o.id === 'paper-bg')
      if (!paperBg) return
      referenceBox = paperBg.getBoundingRect()
    }

    objectsToAlign.forEach(obj => {
      const objRect = obj.getBoundingRect()
      let newLeft = obj.left
      let newTop = obj.top

      if (alignment === 'left') {
        newLeft -= objRect.left - referenceBox.left
      } else if (alignment === 'center') {
        const refCenter = referenceBox.left + referenceBox.width / 2
        const objCenter = objRect.left + objRect.width / 2
        newLeft -= objCenter - refCenter
      } else if (alignment === 'right') {
        const refRight = referenceBox.left + referenceBox.width
        const objRight = objRect.left + objRect.width
        newLeft -= objRight - refRight
      } else if (alignment === 'top') {
        newTop -= objRect.top - referenceBox.top
      } else if (alignment === 'middle') {
        const refMiddle = referenceBox.top + referenceBox.height / 2
        const objMiddle = objRect.top + objRect.height / 2
        newTop -= objMiddle - refMiddle
      } else if (alignment === 'bottom') {
        const refBottom = referenceBox.top + referenceBox.height
        const objBottom = objRect.top + objRect.height
        newTop -= objBottom - refBottom
      }

      obj.set({ left: newLeft, top: newTop })
      obj.setCoords()
    })

    if (isGroup) {
      const sel = new fabric.ActiveSelection(objectsToAlign, { canvas: canvas })
      canvas.setActiveObject(sel)
    } else {
      canvas.setActiveObject(objectsToAlign[0])
    }

    emitChange()
  }

  const setVerticalAlign = align => {
    const canvas = getFabricCanvas()
    if (!canvas || !activeObject.value) return

    const obj = activeObject.value
    if (obj && (obj.type === 'i-text' || obj.type === 'text' || obj.type === 'textbox')) {
      const oldOriginY = obj.originY || 'top'
      if (oldOriginY === align) return

      const height = obj.height * (obj.scaleY || 1)

      // Find the current visual top edge
      let topEdge = obj.top
      if (oldOriginY === 'center') {
        topEdge = obj.top - height / 2
      } else if (oldOriginY === 'bottom') {
        topEdge = obj.top - height
      }

      // Determine new top coordinate based on new origin
      let newTop = topEdge
      if (align === 'center') {
        newTop = topEdge + height / 2
      } else if (align === 'bottom') {
        newTop = topEdge + height
      }

      obj.set({
        originY: align,
        top: newTop
      })

      obj.setCoords()
      canvas.requestRenderAll()
      handleSelection()
      emitChange()
    }
  }

  return {
    activeObject,
    activeObjLeft,
    activeObjTop,
    activeObjWidth,
    activeObjHeight,
    activeObjAngle,
    activeObjFlipX,
    activeObjFlipY,
    activeObjFontSize,
    activeObjTextAlign,
    activeObjFontWeight,
    activeObjFontStyle,
    activeObjUnderline,
    activeObjLinethrough,
    activeObjFill,
    activeObjStroke,
    activeObjStrokeWidth,
    activeObjOpacity,
    handleSelection,
    updateProperty,
    updateTransformProperty,
    alignObjects,
    setVerticalAlign
  }
}
