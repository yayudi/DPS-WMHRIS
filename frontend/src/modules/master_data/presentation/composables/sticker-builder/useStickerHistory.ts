import { ref } from 'vue'

export function useStickerHistory(getFabricCanvas, syncLayers) {
  const historyStack = ref([])
  const historyIndex = ref(-1)
  let isHistoryProcessing = false
  let historyTimeout = null

  const saveHistory = () => {
    const canvas = getFabricCanvas()
    if (!canvas || isHistoryProcessing) return

    clearTimeout(historyTimeout)
    historyTimeout = setTimeout(() => {
      if (!canvas || isHistoryProcessing) return
      const json = canvas.toJSON([
        'id',
        'selectable',
        'evented',
        'hasControls',
        'lockMovementX',
        'lockMovementY',
        'lockRotation',
        'lockScalingX',
        'lockScalingY'
      ])
      const objects = canvas.getObjects()
      if (json.objects) {
        json.objects.forEach((rawObj, index) => {
          const obj = objects[index]
          if (obj) {
            rawObj.id = obj.id
            rawObj.selectable = obj.selectable
            rawObj.evented = obj.evented
            rawObj.hasControls = obj.hasControls
            rawObj.lockMovementX = obj.lockMovementX
            rawObj.lockMovementY = obj.lockMovementY
            rawObj.lockRotation = obj.lockRotation
            rawObj.lockScalingX = obj.lockScalingX
            rawObj.lockScalingY = obj.lockScalingY

            if (obj.isDynamicBarcode) {
              rawObj.isDynamicBarcode = obj.isDynamicBarcode
              rawObj.barcodeType = obj.barcodeType
              rawObj.barcodeValue = obj.barcodeValue
              rawObj.barcodeDisplayValue = obj.barcodeDisplayValue
            }
          }
        })
      }
      const jsonString = JSON.stringify(json)

      if (historyIndex.value >= 0 && historyStack.value[historyIndex.value] === jsonString) {
        return
      }

      if (historyIndex.value < historyStack.value.length - 1) {
        historyStack.value = historyStack.value.slice(0, historyIndex.value + 1)
      }

      historyStack.value.push(jsonString)
      if (historyStack.value.length > 50) {
        historyStack.value.shift()
      } else {
        historyIndex.value++
      }
    }, 100)
  }

  const undo = () => {
    if (historyIndex.value > 0) {
      isHistoryProcessing = true
      historyIndex.value--
      loadHistoryState(historyStack.value[historyIndex.value])
    }
  }

  const redo = () => {
    if (historyIndex.value < historyStack.value.length - 1) {
      isHistoryProcessing = true
      historyIndex.value++
      loadHistoryState(historyStack.value[historyIndex.value])
    }
  }

  const loadHistoryState = jsonString => {
    const canvas = getFabricCanvas()
    if (!canvas) return
    const parsed = JSON.parse(jsonString)
    canvas.loadFromJSON(parsed).then(() => {
      const objects = canvas.getObjects()
      if (parsed && parsed.objects) {
        console.log('loadHistoryState: raw objects from JSON:', parsed.objects)
        parsed.objects.forEach((rawObj, index) => {
          const obj = objects[index]
          if (!obj) {
            console.warn('loadHistoryState: Object missing at index', index)
            return
          }

          console.log(`loadHistoryState: Restoring object index ${index}, rawObj.id = ${rawObj.id}`)

          // Restore custom properties that Fabric might ignore during loadFromJSON
          if (rawObj.id) obj.id = rawObj.id
          if (rawObj.selectable !== undefined) obj.selectable = rawObj.selectable
          if (rawObj.evented !== undefined) obj.evented = rawObj.evented
          if (rawObj.hasControls !== undefined) obj.hasControls = rawObj.hasControls
          if (rawObj.lockMovementX !== undefined) obj.lockMovementX = rawObj.lockMovementX
          if (rawObj.lockMovementY !== undefined) obj.lockMovementY = rawObj.lockMovementY
          if (rawObj.lockRotation !== undefined) obj.lockRotation = rawObj.lockRotation
          if (rawObj.lockScalingX !== undefined) obj.lockScalingX = rawObj.lockScalingX
          if (rawObj.lockScalingY !== undefined) obj.lockScalingY = rawObj.lockScalingY

          if (rawObj.isDynamicBarcode) {
            obj.set({
              isDynamicBarcode: rawObj.isDynamicBarcode,
              barcodeType: rawObj.barcodeType,
              barcodeValue: rawObj.barcodeValue,
              barcodeDisplayValue: rawObj.barcodeDisplayValue
            })
          }
        })
      }
      isHistoryProcessing = false
      canvas.requestRenderAll()
      syncLayers()
    })
  }

  return {
    historyStack,
    historyIndex,
    saveHistory,
    undo,
    redo
  }
}
