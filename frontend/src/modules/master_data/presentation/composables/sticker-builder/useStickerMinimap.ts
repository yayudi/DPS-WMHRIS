import { ref, computed } from 'vue'

export function useStickerMinimap(getFabricCanvas, paperWidth, paperHeight) {
  const canvasWrapper = ref(null)
  const canvasZoom = ref(1)
  const minimapUrl = ref('')
  const minimapRect = ref({ left: 0, top: 0, width: 100, height: 100 })

  const minimapImgWidth = computed(() => {
    const w = paperWidth.value
    const h = paperHeight.value
    const maxW = 256
    const maxH = 128
    const ratio = Math.min(maxW / w, maxH / h)
    return w * ratio
  })

  const minimapImgHeight = computed(() => {
    const w = paperWidth.value
    const h = paperHeight.value
    const maxW = 256
    const maxH = 128
    const ratio = Math.min(maxW / w, maxH / h)
    return h * ratio
  })

  const updateMinimapViewport = () => {
    const canvas = getFabricCanvas()
    if (!canvas || !canvasWrapper.value) return

    const pxPerMm = 7.55
    const w = Math.round(paperWidth.value * pxPerMm)
    const h = Math.round(paperHeight.value * pxPerMm)

    const vpt = canvas.viewportTransform
    const zoom = canvas.getZoom()

    const wrapperW = canvasWrapper.value.clientWidth
    const wrapperH = canvasWrapper.value.clientHeight

    const logicalLeft = -vpt[4] / zoom
    const logicalTop = -vpt[5] / zoom
    const logicalW = wrapperW / zoom
    const logicalH = wrapperH / zoom

    minimapRect.value = {
      left: (logicalLeft / w) * 100,
      top: (logicalTop / h) * 100,
      width: (logicalW / w) * 100,
      height: (logicalH / h) * 100
    }
  }

  let minimapTimeout = null
  const isExporting = ref(false)

  const debouncedUpdateMinimapBg = () => {
    clearTimeout(minimapTimeout)
    minimapTimeout = setTimeout(() => {
      const canvas = getFabricCanvas()
      if (!canvas) return
      const vpt = canvas.viewportTransform.slice()
      const zoom = canvas.getZoom()

      const pxPerMm = 7.55
      const w = Math.round(paperWidth.value * pxPerMm)
      const h = Math.round(paperHeight.value * pxPerMm)

      const prevW = canvas.width
      const prevH = canvas.height

      canvas.setDimensions({ width: w, height: h })
      canvas.setViewportTransform([1, 0, 0, 1, 0, 0])

      isExporting.value = true
      minimapUrl.value = canvas.toDataURL({
        format: 'jpeg',
        quality: 0.5,
        multiplier: 150 / Math.max(w, h)
      })
      isExporting.value = false

      canvas.setDimensions({ width: prevW, height: prevH })
      canvas.setViewportTransform(vpt)
      canvas.setZoom(zoom)
      updateMinimapViewport()
    }, 300)
  }

  return {
    canvasWrapper,
    canvasZoom,
    minimapUrl,
    minimapRect,
    minimapImgWidth,
    minimapImgHeight,
    updateMinimapViewport,
    debouncedUpdateMinimapBg,
    isExporting
  }
}
