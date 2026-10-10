// frontend/src/composables/sticker-builder/useStickerSnapping.js

export function useStickerSnapping(getFabricCanvas, isExporting) {
  let snapLines = []
  const snapThreshold = 5

  const getLogicalBounds = obj => {
    const coords = obj.aCoords || obj.calcACoords()
    const xs = [coords.tl.x, coords.tr.x, coords.bl.x, coords.br.x]
    const ys = [coords.tl.y, coords.tr.y, coords.bl.y, coords.br.y]
    const left = Math.min(...xs)
    const top = Math.min(...ys)
    const right = Math.max(...xs)
    const bottom = Math.max(...ys)
    return { left, top, right, bottom, centerX: (left + right) / 2, centerY: (top + bottom) / 2 }
  }

  const initSnapping = () => {
    const fabricCanvas = getFabricCanvas()
    if (!fabricCanvas) return

    const activeEdges = {
      tl: { v: 'left', h: 'top' },
      tr: { v: 'right', h: 'top' },
      bl: { v: 'left', h: 'bottom' },
      br: { v: 'right', h: 'bottom' },
      ml: { v: 'left', h: null },
      mr: { v: 'right', h: null },
      mt: { v: null, h: 'top' },
      mb: { v: null, h: 'bottom' }
    }

    const handleSnapping = (e, isScaling = false) => {
      const target = e.target
      if (!target) return
      snapLines = []
      target.setCoords()

      const corner = e.transform ? e.transform.corner : null
      const targetBounds = getLogicalBounds(target)
      let verticalPoints = [targetBounds.left, targetBounds.centerX, targetBounds.right]
      let horizontalPoints = [targetBounds.top, targetBounds.centerY, targetBounds.bottom]

      if (isScaling && corner) {
        const edges = activeEdges[corner]
        verticalPoints = []
        horizontalPoints = []
        if (edges) {
          if (edges.v === 'left') verticalPoints.push(targetBounds.left)
          else if (edges.v === 'right') verticalPoints.push(targetBounds.right)
          
          if (edges.h === 'top') horizontalPoints.push(targetBounds.top)
          else if (edges.h === 'bottom') horizontalPoints.push(targetBounds.bottom)
        }
      }

      const objects = fabricCanvas.getObjects().filter(obj => obj !== target && obj.id !== 'snapping-line')
      let snapX = null
      let snapY = null
      let minDiffX = snapThreshold
      let minDiffY = snapThreshold

      objects.forEach(obj => {
        const bounds = getLogicalBounds(obj)
        const objVerticals = [bounds.left, bounds.centerX, bounds.right]
        const objHorizontals = [bounds.top, bounds.centerY, bounds.bottom]

        verticalPoints.forEach(tX => {
          objVerticals.forEach(oX => {
            const diff = Math.abs(tX - oX)
            if (diff < minDiffX) {
              minDiffX = diff
              snapX = { diff: oX - tX, lineX: oX, edgeType: corner ? activeEdges[corner]?.v : null }
            }
          })
        })
        horizontalPoints.forEach(tY => {
          objHorizontals.forEach(oY => {
            const diff = Math.abs(tY - oY)
            if (diff < minDiffY) {
              minDiffY = diff
              snapY = { diff: oY - tY, lineY: oY, edgeType: corner ? activeEdges[corner]?.h : null }
            }
          })
        })
      })

      if (!isScaling) {
        if (snapX) {
          target.set('left', target.left + snapX.diff)
          snapLines.push({ x1: snapX.lineX, y1: -99999, x2: snapX.lineX, y2: 99999 })
        }
        if (snapY) {
          target.set('top', target.top + snapY.diff)
          snapLines.push({ x1: -99999, y1: snapY.lineY, x2: 99999, y2: snapY.lineY })
        }
      } else {
        if ((target.angle || 0) % 360 === 0 && corner) {
          if (snapX && snapX.edgeType) {
            const bounds = getLogicalBounds(target)
            const currentW = Math.abs(bounds.right - bounds.left) || 1

            if (snapX.edgeType === 'right') {
              const fixedLeft = bounds.left
              const newW = Math.max(1, Math.abs(snapX.lineX - fixedLeft))
              target.set('scaleX', target.scaleX * (newW / currentW))
              target.setCoords()
              target.set('left', target.left + (fixedLeft - getLogicalBounds(target).left))
            } else if (snapX.edgeType === 'left') {
              const fixedRight = bounds.right
              const newW = Math.max(1, Math.abs(fixedRight - snapX.lineX))
              target.set('scaleX', target.scaleX * (newW / currentW))
              target.setCoords()
              target.set('left', target.left + (fixedRight - getLogicalBounds(target).right))
            }
          }

          if (snapY && snapY.edgeType) {
            const bounds = getLogicalBounds(target)
            const currentH = Math.abs(bounds.bottom - bounds.top) || 1

            if (snapY.edgeType === 'bottom') {
              const fixedTop = bounds.top
              const newH = Math.max(1, Math.abs(snapY.lineY - fixedTop))
              target.set('scaleY', target.scaleY * (newH / currentH))
              target.setCoords()
              target.set('top', target.top + (fixedTop - getLogicalBounds(target).top))
            } else if (snapY.edgeType === 'top') {
              const fixedBottom = bounds.bottom
              const newH = Math.max(1, Math.abs(fixedBottom - snapY.lineY))
              target.set('scaleY', target.scaleY * (newH / currentH))
              target.setCoords()
              target.set('top', target.top + (fixedBottom - getLogicalBounds(target).bottom))
            }
          }
        }
        
        if (snapX) snapLines.push({ x1: snapX.lineX, y1: -99999, x2: snapX.lineX, y2: 99999 })
        if (snapY) snapLines.push({ x1: -99999, y1: snapY.lineY, x2: 99999, y2: snapY.lineY })
      }
      
      if (snapX || snapY) target.setCoords()
    }

    fabricCanvas.on('object:moving', e => handleSnapping(e, false))
    fabricCanvas.on('object:scaling', e => handleSnapping(e, true))
    
    // Rotation snapping
    fabricCanvas.on('object:rotating', e => {
      const target = e.target
      if (!target) return
      
      const snapAngle = 15 // Snap every 15 degrees
      const threshold = 5
      
      let angle = target.angle
      if (angle < 0) angle += 360
      
      const remainder = angle % snapAngle
      
      if (remainder < threshold) {
        target.set('angle', angle - remainder)
      } else if (remainder > snapAngle - threshold) {
        target.set('angle', angle + (snapAngle - remainder))
      }
      
      target.setCoords()
    })

    fabricCanvas.on('mouse:up', () => {
      if (snapLines.length > 0) {
        snapLines = []
        fabricCanvas.requestRenderAll()
      }
    })

    fabricCanvas.on('after:render', opt => {
      if (isExporting.value) return
      const ctx = opt.ctx
      ctx.save()

      if (snapLines.length > 0 && fabricCanvas) {
        const vpt = fabricCanvas.viewportTransform
        ctx.transform(vpt[0], vpt[1], vpt[2], vpt[3], vpt[4], vpt[5])
        ctx.strokeStyle = '#ef4444'
        const zoom = fabricCanvas.getZoom() || 1
        ctx.lineWidth = 1 / zoom
        ctx.setLineDash([5 / zoom, 5 / zoom])

        ctx.beginPath()
        snapLines.forEach(line => {
          ctx.moveTo(line.x1, line.y1)
          ctx.lineTo(line.x2, line.y2)
        })
        ctx.stroke()
      }

      const retina = window.devicePixelRatio || 1
      ctx.setTransform(retina, 0, 0, retina, 0, 0)

      if (fabricCanvas) {
        const vpt = fabricCanvas.viewportTransform
        const zoom = fabricCanvas.getZoom()
        const pxPerMm = 7.55
        const rulerSize = 24

        ctx.fillStyle = '#f1f5f9'
        ctx.fillRect(0, 0, fabricCanvas.width, rulerSize)
        ctx.fillRect(0, 0, rulerSize, fabricCanvas.height)

        ctx.strokeStyle = '#cbd5e1'
        ctx.lineWidth = 1
        ctx.setLineDash([])
        ctx.beginPath()
        ctx.moveTo(0, rulerSize)
        ctx.lineTo(fabricCanvas.width, rulerSize)
        ctx.moveTo(rulerSize, 0)
        ctx.lineTo(rulerSize, fabricCanvas.height)
        ctx.stroke()

        ctx.fillStyle = '#64748b'
        ctx.strokeStyle = '#94a3b8'
        ctx.font = '10px sans-serif'

        let stepMm = 1
        if (zoom < 0.5) stepMm = 10
        else if (zoom < 1.5) stepMm = 5

        const startMmX = Math.floor(-vpt[4] / zoom / pxPerMm)
        const endMmX = Math.ceil((fabricCanvas.width - vpt[4]) / zoom / pxPerMm)
        ctx.beginPath()
        ctx.textAlign = 'center'
        ctx.textBaseline = 'top'
        for (let mm = startMmX; mm <= endMmX; mm++) {
          if (stepMm > 1 && mm % stepMm !== 0 && mm % 5 !== 0 && mm % 10 !== 0) continue
          const screenX = mm * pxPerMm * zoom + vpt[4]
          if (screenX < rulerSize) continue
          const isMajor = mm % 10 === 0
          const isMedium = mm % 5 === 0
          let tickHeight = 5
          if (isMajor) tickHeight = 14
          else if (isMedium) tickHeight = 8
          ctx.moveTo(screenX, rulerSize - tickHeight)
          ctx.lineTo(screenX, rulerSize)
          if (isMajor) ctx.fillText(mm.toString(), screenX, 2)
        }

        const startMmY = Math.floor(-vpt[5] / zoom / pxPerMm)
        const endMmY = Math.ceil((fabricCanvas.height - vpt[5]) / zoom / pxPerMm)
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        for (let mm = startMmY; mm <= endMmY; mm++) {
          if (stepMm > 1 && mm % stepMm !== 0 && mm % 5 !== 0 && mm % 10 !== 0) continue
          const screenY = mm * pxPerMm * zoom + vpt[5]
          if (screenY < rulerSize) continue
          const isMajor = mm % 10 === 0
          const isMedium = mm % 5 === 0
          let tickWidth = 5
          if (isMajor) tickWidth = 14
          else if (isMedium) tickWidth = 8
          ctx.moveTo(rulerSize - tickWidth, screenY)
          ctx.lineTo(rulerSize, screenY)
          if (isMajor) {
            ctx.save()
            ctx.translate(8, screenY)
            ctx.rotate(-Math.PI / 2)
            ctx.fillText(mm.toString(), 0, 0)
            ctx.restore()
          }
        }
        ctx.stroke()

        ctx.fillStyle = '#e2e8f0'
        ctx.fillRect(0, 0, rulerSize, rulerSize)
        ctx.strokeStyle = '#cbd5e1'
        ctx.strokeRect(0, 0, rulerSize, rulerSize)
        ctx.fillStyle = '#64748b'
        ctx.font = '9px sans-serif'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText('mm', rulerSize / 2, rulerSize / 2)
      }
      ctx.restore()
    })
  }

  return { initSnapping }
}
