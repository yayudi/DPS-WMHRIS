import { ref } from 'vue'
import * as fabric from 'fabric'
import JsBarcode from 'jsbarcode'
import QRCode from 'qrcode'
import { resolveUrl } from '@/composables/useImageUrl'
import { swalAlert } from '@/composables/useSweetAlert'

export function useStickerElements(getFabricCanvas, syncLayers) {
  const isDynamicMenuOpen = ref(false)
  const isBarcodeModalOpen = ref(false)
  const isMediaPickerOpen = ref(false)
  const barcodeConfig = ref({
    type: 'barcode',
    value: '{{ sku }}',
    displayValue: true
  })

  const openMediaPicker = () => { isMediaPickerOpen.value = true }
  const closeMediaPicker = () => { isMediaPickerOpen.value = false }
  const openBarcodeModal = () => { isBarcodeModalOpen.value = true }
  const closeBarcodeModal = () => { isBarcodeModalOpen.value = false }
  const toggleDynamicMenu = () => { isDynamicMenuOpen.value = !isDynamicMenuOpen.value }


  const addSpecificText = variable => {
    const canvas = getFabricCanvas()
    if (!canvas) return
    const text = new fabric.Textbox(`{{ ${variable} }}`, {
      left: 50,
      top: 50,
      width: 200,
      fontFamily: 'Inter, Arial, sans-serif',
      fontSize: 40,
      fill: '#000000',
      fontWeight: 'bold',
      textAlign: 'center'
    })
    canvas.add(text)
    canvas.setActiveObject(text)
    canvas.requestRenderAll()
    isDynamicMenuOpen.value = false
    syncLayers()
  }

  const addText = () => {
    const canvas = getFabricCanvas()
    if (!canvas) return
    const text = new fabric.Textbox('Teks Baru', {
      left: 50,
      top: 50,
      width: 200,
      fontFamily: 'Inter, Arial, sans-serif',
      fontSize: 40,
      fill: '#000000',
      fontWeight: 'bold',
      textAlign: 'center'
    })
    canvas.add(text)
    canvas.setActiveObject(text)
    canvas.requestRenderAll()
    syncLayers()
  }

  const addDynamicText = () => {
    const canvas = getFabricCanvas()
    if (!canvas) return
    const text = new fabric.Textbox('{{ field }}', {
      left: 50,
      top: 50,
      width: 200,
      fontFamily: 'Inter, Arial, sans-serif',
      fontSize: 40,
      fill: '#000000',
      fontWeight: 'bold',
      textAlign: 'center'
    })
    canvas.add(text)
    canvas.setActiveObject(text)
    canvas.requestRenderAll()
    isDynamicMenuOpen.value = false
    syncLayers()
  }

  const insertMediaToCanvas = asset => {
    const canvas = getFabricCanvas()
    if (!canvas || !asset) return
    const imgElement = document.createElement('img')
    imgElement.crossOrigin = 'anonymous'
    imgElement.src = resolveUrl(asset.main_path)
    imgElement.onload = () => {
      const img = new fabric.Image(imgElement, {
        left: 10,
        top: 10
      })
      if (img.height > 80) {
        img.scaleToHeight(80)
      }
      if (img.width > 80 && img.getScaledWidth() > 80) {
        img.scaleToWidth(80)
      }
      canvas.add(img)
      canvas.setActiveObject(img)
      canvas.requestRenderAll()
      syncLayers()
    }
  }

  const generateBarcodeDataURL = async config => {
    if (config.type === 'qrcode') {
      return await QRCode.toDataURL(config.value || ' ', { errorCorrectionLevel: 'M', margin: 2 })
    } else {
      const canvasEl = document.createElement('canvas')
      JsBarcode(canvasEl, config.value || ' ', {
        format: 'CODE128',
        displayValue: config.displayValue,
        margin: 10,
        background: '#ffffff',
        lineColor: '#000000'
      })
      return canvasEl.toDataURL('image/png')
    }
  }

  const addBarcode = async () => {
    const canvas = getFabricCanvas()
    if (!canvas) return
    isBarcodeModalOpen.value = false

    try {
      const dataUrl = await generateBarcodeDataURL(barcodeConfig.value)
      const imgElement = document.createElement('img')
      imgElement.src = dataUrl
      imgElement.onload = () => {
        const img = new fabric.Image(imgElement, {
          left: 50,
          top: 50,
          isDynamicBarcode: true,
          barcodeType: barcodeConfig.value.type,
          barcodeValue: barcodeConfig.value.value,
          barcodeDisplayValue: barcodeConfig.value.displayValue
        })
        if (img.width > 100) {
          img.scaleToWidth(100)
        }
        canvas.add(img)
        canvas.setActiveObject(img)
        canvas.requestRenderAll()
        syncLayers()
      }
    } catch (err) {
      console.error('Failed to generate barcode/qrcode', err)
      await swalAlert('Gagal membuat Barcode/QR Code. Pastikan format teks valid.')
    }
  }

  const addRectangle = async () => {
    const canvas = getFabricCanvas()
    if (!canvas) return
    const rect = new fabric.Rect({
      left: 50,
      top: 50,
      width: 40,
      height: 40,
      fill: '#000000',
      strokeUniform: true
    })
    canvas.add(rect)
    canvas.setActiveObject(rect)
    canvas.requestRenderAll()
    syncLayers()
  }

  const addCircle = () => {
    const canvas = getFabricCanvas()
    if (!canvas) return
    const circle = new fabric.Circle({
      left: 50,
      top: 50,
      radius: 20,
      fill: '#000000',
      strokeUniform: true
    })
    canvas.add(circle)
    canvas.setActiveObject(circle)
    canvas.requestRenderAll()
    syncLayers()
  }

  const addTriangle = () => {
    const canvas = getFabricCanvas()
    if (!canvas) return
    const triangle = new fabric.Triangle({
      left: 50,
      top: 50,
      width: 40,
      height: 40,
      fill: '#000000',
      strokeUniform: true
    })
    canvas.add(triangle)
    canvas.setActiveObject(triangle)
    canvas.requestRenderAll()
    syncLayers()
  }

  const addLine = () => {
    const canvas = getFabricCanvas()
    if (!canvas) return
    const line = new fabric.Line([50, 50, 150, 50], {
      stroke: '#000000',
      strokeWidth: 4,
      strokeUniform: true
    })
    canvas.add(line)
    canvas.setActiveObject(line)
    canvas.requestRenderAll()
    syncLayers()
  }

  const deleteSelected = () => {
    const canvas = getFabricCanvas()
    if (!canvas) return
    const activeObjects = canvas.getActiveObjects()
    if (activeObjects.length) {
      activeObjects.forEach(obj => {
        canvas.remove(obj)
      })
      canvas.discardActiveObject()
      canvas.requestRenderAll()
      syncLayers()
    }
  }

  const duplicateSelected = async () => {
    const canvas = getFabricCanvas()
    if (!canvas) return
    const activeObject = canvas.getActiveObject()
    if (!activeObject || activeObject.id === 'paper-bg') return

    const isMultiple = activeObject.type === 'activeselection'
    const objectsToClone = isMultiple ? [...activeObject.getObjects()] : [activeObject]

    // Buang seleksi agar koordinat setiap objek dikembalikan ke koordinat absolut kanvas
    canvas.discardActiveObject()

    // Kloning setiap objek secara individual
    const promises = objectsToClone.map(obj => obj.clone(['id', 'isDynamicBarcode', 'barcodeType', 'barcodeValue', 'barcodeDisplayValue']))
    const clonedObjects = await Promise.all(promises)

    clonedObjects.forEach(cloned => {
      cloned.set({
        left: (cloned.left || 0) + 15,
        top: (cloned.top || 0) + 15,
        evented: true,
        id: 'layer_' + Date.now() + '_' + Math.random().toString(36).substring(2, 9)
      })
      canvas.add(cloned)
    })

    if (isMultiple) {
      const sel = new fabric.ActiveSelection(clonedObjects, { canvas })
      canvas.setActiveObject(sel)
    } else {
      canvas.setActiveObject(clonedObjects[0])
    }

    canvas.requestRenderAll()
    syncLayers()
  }

  let clipboard = null

  const copySelected = async () => {
    const canvas = getFabricCanvas()
    if (!canvas) return
    const activeObject = canvas.getActiveObject()
    if (!activeObject || activeObject.id === 'paper-bg') return

    const isMultiple = activeObject.type === 'activeselection'
    const objectsToClone = isMultiple ? [...activeObject.getObjects()] : [activeObject]

    canvas.discardActiveObject()

    const promises = objectsToClone.map(obj => obj.clone(['id', 'isDynamicBarcode', 'barcodeType', 'barcodeValue', 'barcodeDisplayValue']))
    const clonedObjects = await Promise.all(promises)

    if (isMultiple) {
      clipboard = { type: 'multiple', objects: clonedObjects }
      const sel = new fabric.ActiveSelection(objectsToClone, { canvas })
      canvas.setActiveObject(sel)
    } else {
      clipboard = { type: 'single', object: clonedObjects[0] }
      canvas.setActiveObject(objectsToClone[0])
    }
  }

  const pasteCopied = async () => {
    const canvas = getFabricCanvas()
    if (!canvas || !clipboard) return

    canvas.discardActiveObject()

    const promises = (clipboard.type === 'multiple' ? clipboard.objects : [clipboard.object]).map(obj =>
      obj.clone(['id', 'isDynamicBarcode', 'barcodeType', 'barcodeValue', 'barcodeDisplayValue'])
    )

    const pastedObjects = await Promise.all(promises)

    pastedObjects.forEach(cloned => {
      cloned.set({
        left: (cloned.left || 0) + 15,
        top: (cloned.top || 0) + 15,
        evented: true,
        id: 'layer_' + Date.now() + '_' + Math.random().toString(36).substring(2, 9)
      })
      canvas.add(cloned)
    })

    if (clipboard.type === 'multiple') {
      clipboard.objects.forEach(obj => {
        obj.left += 15
        obj.top += 15
      })
      const sel = new fabric.ActiveSelection(pastedObjects, { canvas })
      canvas.setActiveObject(sel)
    } else {
      clipboard.object.left += 15
      clipboard.object.top += 15
      canvas.setActiveObject(pastedObjects[0])
    }

    canvas.requestRenderAll()
    syncLayers()
  }

  const groupSelected = () => {
    const canvas = getFabricCanvas()
    if (!canvas) return
    const activeObject = canvas.getActiveObject()
    
    console.log('--- GROUP INITIATED ---')
    console.log('Active Object type:', activeObject ? activeObject.type : null)
    
    if (!activeObject || activeObject.type !== 'activeselection') return

    if (typeof activeObject.toGroup === 'function') {
      console.log('Using native toGroup()')
      const group = activeObject.toGroup()
      canvas.setActiveObject(group)
    } else {
      console.log('toGroup() missing. Using manual Group creation.')
      // Extract objects and restore absolute coordinates
      const objects = activeObject.removeAll()
      canvas.discardActiveObject()
      
      // Ensure objects are removed from canvas before adding to group
      objects.forEach(obj => canvas.remove(obj))
      
      const group = new fabric.Group(objects, {
        id: 'layer_' + Date.now() + '_' + Math.random().toString(36).substring(2, 9)
      })
      
      canvas.add(group)
      canvas.setActiveObject(group)
    }
    
    canvas.requestRenderAll()
    syncLayers()
  }

  const ungroupSelected = () => {
    const canvas = getFabricCanvas()
    if (!canvas) return
    const activeObject = canvas.getActiveObject()

    console.log('--- UNGROUP INITIATED ---')
    console.log('Active Object type:', activeObject ? activeObject.type : null)

    if (!activeObject || activeObject.type !== 'group') return

    if (typeof activeObject.toActiveSelection === 'function') {
      console.log('Using native toActiveSelection()')
      const sel = activeObject.toActiveSelection()
      canvas.setActiveObject(sel)
    } else {
      console.log('toActiveSelection() missing. Using manual Ungroup.')
      
      const children = activeObject.removeAll()
      canvas.remove(activeObject)

      children.forEach(obj => {
        canvas.add(obj)
      })

      const sel = new fabric.ActiveSelection(children, { canvas })
      canvas.setActiveObject(sel)
    }
    
    canvas.requestRenderAll()
    syncLayers()
  }

  return {
    isDynamicMenuOpen,
    isBarcodeModalOpen,
    isMediaPickerOpen,
    barcodeConfig,
    openMediaPicker,
    closeMediaPicker,
    openBarcodeModal,
    closeBarcodeModal,
    toggleDynamicMenu,
    addSpecificText,
    addText,
    addDynamicText,
    insertMediaToCanvas,
    addBarcode,
    addRectangle,
    addCircle,
    addTriangle,
    addLine,
    deleteSelected,
    duplicateSelected,
    copySelected,
    pasteCopied,
    groupSelected,
    ungroupSelected
  }
}
