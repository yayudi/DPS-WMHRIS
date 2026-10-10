import * as fabric from 'fabric'
import { faXmark } from '@fortawesome/free-solid-svg-icons'

export function useStickerFabric() {
  const setupCustomControls = (getFabricCanvas, syncLayers) => {
    function renderDeleteIcon(ctx, left, top, styleOverride, fabricObject) {
      const size = 24
      ctx.save()
      ctx.translate(left, top)
      ctx.rotate(fabric.util.degreesToRadians(fabricObject.angle))

      // Draw red circle background
      ctx.beginPath()
      ctx.arc(0, 0, size / 2, 0, Math.PI * 2)
      ctx.fillStyle = '#ef4444' // Tailwind text-red-500
      ctx.fill()
      ctx.closePath()

      // Draw FontAwesome Xmark icon in white
      const iconWidth = faXmark.icon[0]
      const iconHeight = faXmark.icon[1]
      const pathData = faXmark.icon[4]

      // Scale the path to fit inside the circle
      const scale = (size * 0.5) / Math.max(iconWidth, iconHeight)

      ctx.scale(scale, scale)
      ctx.translate(-iconWidth / 2, -iconHeight / 2)

      ctx.fillStyle = '#ffffff'
      ctx.fill(new Path2D(pathData))

      ctx.restore()
    }

    function deleteObjectControl(eventData, transform) {
      const target = transform.target
      const canvas = getFabricCanvas()
      if (canvas) {
        canvas.remove(target)
        canvas.discardActiveObject()
        canvas.requestRenderAll()
        if (syncLayers) syncLayers()
      }
      return true
    }

    const deleteControl = new fabric.Control({
      x: 0.5,
      y: -0.5,
      offsetY: -16,
      offsetX: 16,
      cursorStyle: 'pointer',
      mouseUpHandler: deleteObjectControl,
      render: renderDeleteIcon,
      cornerSize: 24
    })

    const protoControls = fabric.Object.prototype.controls || {}
    protoControls.deleteControl = deleteControl
    fabric.Object.prototype.controls = protoControls

    if (fabric.Textbox) {
      fabric.Textbox.prototype.controls = fabric.Textbox.prototype.controls || Object.assign({}, protoControls)
      fabric.Textbox.prototype.controls.deleteControl = deleteControl
    }
    if (fabric.Rect) {
      fabric.Rect.prototype.controls = fabric.Rect.prototype.controls || Object.assign({}, protoControls)
      fabric.Rect.prototype.controls.deleteControl = deleteControl
    }
    if (fabric.Circle) {
      fabric.Circle.prototype.controls = fabric.Circle.prototype.controls || Object.assign({}, protoControls)
      fabric.Circle.prototype.controls.deleteControl = deleteControl
    }
    if (fabric.Line) {
      fabric.Line.prototype.controls = fabric.Line.prototype.controls || Object.assign({}, protoControls)
      fabric.Line.prototype.controls.deleteControl = deleteControl
    }
    if (fabric.Image) {
      fabric.Image.prototype.controls = fabric.Image.prototype.controls || Object.assign({}, protoControls)
      fabric.Image.prototype.controls.deleteControl = deleteControl
    }
  }

  return { setupCustomControls }
}
