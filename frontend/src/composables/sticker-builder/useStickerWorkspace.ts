// frontend/src/composables/sticker-builder/useStickerWorkspace.js
import * as fabric from 'fabric'
import { watch, onUnmounted } from 'vue'

export function useStickerWorkspace({
  canvasEl,
  canvasWrapper,
  paperWidth,
  paperHeight,
  paperSizes,
  selectedPaperSize,
  props,
  templateName,
  getFabricCanvas,
  setFabricCanvas,
  canvasZoom,
  setupCustomControls,
  handleSelection,
  syncLayers,
  updateMinimapViewport,
  debouncedUpdateMinimapBg,
  initSnapping
}) {
  let isCanvasCentered = false
  let resizeObserver = null
  const pxPerMm = 7.55

  const centerCanvas = () => {
    const fabricCanvas = getFabricCanvas()
    if (!fabricCanvas || !canvasWrapper.value) return
    const w = Math.round(paperWidth.value * pxPerMm)
    const h = Math.round(paperHeight.value * pxPerMm)
    const wrapperW = canvasWrapper.value.clientWidth
    const wrapperH = canvasWrapper.value.clientHeight

    const padding = 40
    const availableW = wrapperW - padding * 2
    const availableH = wrapperH - padding * 2

    const scaleX = availableW / w
    const scaleY = availableH / h

    let newZoom = Math.min(scaleX, scaleY)
    if (newZoom > 2) newZoom = 2
    if (newZoom < 0.1) newZoom = 0.1

    canvasZoom.value = newZoom

    const scaledW = w * newZoom
    const scaledH = h * newZoom

    const offsetX = (wrapperW - scaledW) / 2
    const offsetY = (wrapperH - scaledH) / 2

    // console.log('[StickerCanvas] centerCanvas dipanggil:', {
    //   paperSize: `${w}x${h}`,
    //   wrapperSize: `${wrapperW}x${wrapperH}`,
    //   scaleX,
    //   scaleY,
    //   newZoom,
    //   offsetX,
    //   offsetY
    // })

    fabricCanvas.setViewportTransform([newZoom, 0, 0, newZoom, offsetX, offsetY])
    fabricCanvas.requestRenderAll()
    debouncedUpdateMinimapBg()
  }

  const applyPaperSize = () => {
    const fabricCanvas = getFabricCanvas()
    if (!fabricCanvas || !canvasWrapper.value) return
    const w = Math.round(paperWidth.value * pxPerMm)
    const h = Math.round(paperHeight.value * pxPerMm)

    const paperRect = fabricCanvas.getObjects().find(o => o.id === 'paper-bg')
    if (paperRect) {
      paperRect.set({ width: w, height: h, originX: 'left', originY: 'top' })
    }
    centerCanvas()
  }

  const initCanvas = () => {
    let fabricCanvas = getFabricCanvas()
    if (fabricCanvas || !canvasWrapper.value) return
    isCanvasCentered = false

    fabricCanvas = new fabric.Canvas(canvasEl.value, {
      width: 0,
      height: 0,
      backgroundColor: '#f3f4f6',
      preserveObjectStacking: true
    })
    setFabricCanvas(fabricCanvas)

    if (props.initialTemplate && props.initialTemplate.config_json) {
      let parsedConfig = props.initialTemplate.config_json
      if (typeof parsedConfig === 'string') {
        try {
          parsedConfig = JSON.parse(parsedConfig)
        } catch {
          // Abaikan error parsing
        }
      }

      fabricCanvas.loadFromJSON(parsedConfig).then(() => {
        const objects = fabricCanvas.getObjects()
        if (parsedConfig && parsedConfig.objects) {
          parsedConfig.objects.forEach((rawObj, index) => {
            if (rawObj.isDynamicBarcode && objects[index]) {
              objects[index].set({
                isDynamicBarcode: rawObj.isDynamicBarcode,
                barcodeType: rawObj.barcodeType,
                barcodeValue: rawObj.barcodeValue,
                barcodeDisplayValue: rawObj.barcodeDisplayValue
              })
            }
          })
        }

        objects.forEach(obj => {
          if (obj) obj.set({ strokeUniform: true })
        })

        if (parsedConfig.paper_size_id && paperSizes.value.length) {
          const found = paperSizes.value.find(p => p.id === parsedConfig.paper_size_id)
          if (found) {
            selectedPaperSize.value = found
            paperWidth.value = found.labelWidth || 80
            paperHeight.value = found.labelHeight || 40
          }
        }

        const w = Math.round(paperWidth.value * pxPerMm)
        const h = Math.round(paperHeight.value * pxPerMm)
        const paperRect = new fabric.Rect({
          left: 0,
          top: 0,
          originX: 'left',
          originY: 'top',
          width: w,
          height: h,
          fill: '#ffffff',
          selectable: false,
          evented: false,
          id: 'paper-bg',
          shadow: new fabric.Shadow({ color: 'rgba(0,0,0,0.1)', blur: 20, offsetX: 0, offsetY: 10 })
        })
        fabricCanvas.insertAt(0, paperRect)

        fabricCanvas.getObjects().forEach(o => {
          if (o.type === 'rect' && o.fill === '#ffffff' && o.left === 0 && o.top === 0 && o.id !== 'paper-bg') {
            fabricCanvas.remove(o)
          }
        })

        centerCanvas()
        isCanvasCentered = true
        syncLayers()
        updateMinimapViewport()
      })
    } else {
      const w = Math.round(paperWidth.value * pxPerMm)
      const h = Math.round(paperHeight.value * pxPerMm)

      const paperRect = new fabric.Rect({
        left: 0,
        top: 0,
        originX: 'left',
        originY: 'top',
        width: w,
        height: h,
        fill: '#ffffff',
        selectable: false,
        evented: false,
        id: 'paper-bg',
        shadow: new fabric.Shadow({ color: 'rgba(0,0,0,0.1)', blur: 20, offsetX: 0, offsetY: 10 })
      })
      fabricCanvas.add(paperRect)
    }

    setupCustomControls(getFabricCanvas, syncLayers)

    const attachDeleteControl = obj => {
      if (obj && obj.controls && obj.id !== 'paper-bg') {
        obj.controls.deleteControl = fabric.Object.prototype.controls.deleteControl
      }
    }
    fabricCanvas.getObjects().forEach(attachDeleteControl)

    fabricCanvas.on('selection:created', () => {
      handleSelection()
      syncLayers()
    })
    fabricCanvas.on('selection:updated', () => {
      handleSelection()
      syncLayers()
    })
    fabricCanvas.on('selection:cleared', () => {
      handleSelection()
      syncLayers()
    })
    fabricCanvas.on('object:added', e => {
      attachDeleteControl(e.target)
      syncLayers()
    })
    fabricCanvas.on('object:removed', () => {
      syncLayers()
    })
    fabricCanvas.on('object:modified', () => {
      syncLayers()
    })

    fabricCanvas.on('mouse:wheel', function (opt) {
      const delta = opt.e.deltaY
      let zoom = fabricCanvas.getZoom()
      zoom *= 0.999 ** delta
      if (zoom > 5) zoom = 5
      if (zoom < 0.1) zoom = 0.1
      fabricCanvas.zoomToPoint({ x: opt.e.offsetX, y: opt.e.offsetY }, zoom)
      opt.e.preventDefault()
      opt.e.stopPropagation()
      canvasZoom.value = zoom
      updateMinimapViewport()
    })

    let isDragging = false
    let lastPosX = 0
    let lastPosY = 0
    fabricCanvas.on('mouse:down', function (opt) {
      const evt = opt.e
      if (evt.altKey === true) {
        isDragging = true
        fabricCanvas.selection = false
        lastPosX = evt.clientX
        lastPosY = evt.clientY
        fabricCanvas.defaultCursor = 'grabbing'
      }
    })
    fabricCanvas.on('mouse:move', function (opt) {
      if (isDragging) {
        const e = opt.e
        const vpt = fabricCanvas.viewportTransform
        vpt[4] += e.clientX - lastPosX
        vpt[5] += e.clientY - lastPosY
        fabricCanvas.requestRenderAll()
        lastPosX = e.clientX
        lastPosY = e.clientY
        updateMinimapViewport()
      }
    })
    fabricCanvas.on('mouse:up', function () {
      if (isDragging) {
        fabricCanvas.setViewportTransform(fabricCanvas.viewportTransform)
        isDragging = false
        fabricCanvas.selection = true
        fabricCanvas.defaultCursor = 'default'
        updateMinimapViewport()
      }
    })

    resizeObserver = new ResizeObserver(entries => {
      for (let entry of entries) {
        const width = Math.round(entry.contentRect.width)
        const height = Math.round(entry.contentRect.height)
        if (width > 0 && height > 0 && fabricCanvas) {
          const currentWidth = fabricCanvas.width || 0
          const currentHeight = fabricCanvas.height || 0
          if (Math.abs(currentWidth - width) > 1 || Math.abs(currentHeight - height) > 1) {
            fabricCanvas.setDimensions({ width, height })
            if (!isCanvasCentered) {
              centerCanvas()
              isCanvasCentered = true
            } else {
              updateMinimapViewport()
            }
          }
        }
      }
    })
    resizeObserver.observe(canvasWrapper.value)
    initSnapping()
  }

  onUnmounted(() => {
    if (resizeObserver) resizeObserver.disconnect()
    const fabricCanvas = getFabricCanvas()
    if (fabricCanvas) {
      fabricCanvas.dispose()
      setFabricCanvas(null)
    }
  })

  watch(
    () => props.show,
    newVal => {
      if (newVal) {
        if (props.initialTemplate) {
          templateName.value = props.initialTemplate.name
          let parsedConfig = props.initialTemplate.config_json
          if (typeof parsedConfig === 'string') {
            try {
              parsedConfig = JSON.parse(parsedConfig)
            } catch {
              /* ignore */
            }
          }
          if (parsedConfig && parsedConfig.paper_size_id && paperSizes.value.length) {
            const found = paperSizes.value.find(p => p.id === parsedConfig.paper_size_id)
            if (found) {
              selectedPaperSize.value = found
              paperWidth.value = found.labelWidth || 80
              paperHeight.value = found.labelHeight || 40
            } else {
              if (props.initialTemplate.paper_size) {
                const [w, h] = props.initialTemplate.paper_size.split('x').map(Number)
                paperWidth.value = w || 80
                paperHeight.value = h || 40
              }
              selectedPaperSize.value = null
            }
          } else {
            if (props.initialTemplate.paper_size) {
              const [w, h] = props.initialTemplate.paper_size.split('x').map(Number)
              paperWidth.value = w || 80
              paperHeight.value = h || 40
            }
            selectedPaperSize.value = null
          }
        } else {
          templateName.value = ''
          selectedPaperSize.value = null
          paperWidth.value = 80
          paperHeight.value = 40
        }
        setTimeout(() => {
          initCanvas()
        }, 100)
      }
    }
  )

  watch(selectedPaperSize, newVal => {
    if (newVal) {
      paperWidth.value = newVal.labelWidth || 80
      paperHeight.value = newVal.labelHeight || 40
      applyPaperSize()
    }
  })
  watch(paperWidth, applyPaperSize)
  watch(paperHeight, applyPaperSize)

  return { initCanvas, applyPaperSize, centerCanvas }
}
