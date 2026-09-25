<script setup>
import { swalAlert } from '@/composables/useSweetAlert'
import { ref, watch } from 'vue'
import api from '@/api/axios'
import MediaPickerModal from '@/components/shared/MediaPickerModal.vue'
import { FontAwesomeIcon } from '@fortawesome/vue-fontawesome'
import { useStickerFabric } from '@/composables/sticker-builder/useStickerFabric'
import { useStickerSelection } from '@/composables/sticker-builder/useStickerSelection'
import { useStickerHistory } from '@/composables/sticker-builder/useStickerHistory'
import { useStickerLayers } from '@/composables/sticker-builder/useStickerLayers'
import { useStickerMinimap } from '@/composables/sticker-builder/useStickerMinimap'
import { useStickerElements } from '@/composables/sticker-builder/useStickerElements'
import { useStickerHotkeys } from '@/composables/sticker-builder/useStickerHotkeys'
import { useStickerSnapping } from '@/composables/sticker-builder/useStickerSnapping'
import { useStickerWorkspace } from '@/composables/sticker-builder/useStickerWorkspace'

const props = defineProps({
  show: Boolean,
  initialTemplate: { type: Object, default: null }
})
const emit = defineEmits(['close', 'saved'])

// Basic State
const templateName = ref('')
const isSaving = ref(false)
const paperSizes = ref([])
const selectedPaperSize = ref(null)

const canvasEl = ref(null)
let fabricCanvas = null
const getFabricCanvas = () => fabricCanvas
const setFabricCanvas = canvas => {
  fabricCanvas = canvas
}
const paperWidth = ref(80)
const paperHeight = ref(40)

// --- Composables Initialization ---
const { setupCustomControls } = useStickerFabric()

let doSyncLayers = () => {}
let doSaveHistory = () => {}

const {
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
  handleSelection,
  updateProperty,
  updateTransformProperty,
  alignObjects,
  setVerticalAlign
} = useStickerSelection(getFabricCanvas, () => {
  if (fabricCanvas) fabricCanvas.requestRenderAll()
  doSyncLayers()
})

const { historyStack, historyIndex, saveHistory, undo, redo } = useStickerHistory(getFabricCanvas, () => {
  doSyncLayers()
})
doSaveHistory = saveHistory

const {
  canvasLayers,
  draggedLayerIndex,
  dragOverLayerIndex,
  syncLayers,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
  selectLayer,
  toggleLockLayer,
  toggleVisibilityLayer,
  updateLayerName
} = useStickerLayers(getFabricCanvas, () => activeObject.value, doSaveHistory)
doSyncLayers = syncLayers

const editingLayerId = ref(null)
const editingLayerName = ref('')

const startEditingLayer = layer => {
  if (layer.id === 'paper-bg') return
  editingLayerId.value = layer.id
  editingLayerName.value = layer.text
}

const saveLayerName = layer => {
  if (editingLayerId.value === layer.id) {
    updateLayerName(layer, editingLayerName.value)
    editingLayerId.value = null
  }
}

const {
  canvasWrapper,
  canvasZoom,
  minimapUrl,
  minimapRect,
  minimapImgWidth,
  minimapImgHeight,
  updateMinimapViewport,
  debouncedUpdateMinimapBg,
  isExporting
} = useStickerMinimap(getFabricCanvas, paperWidth, paperHeight)

const {
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
} = useStickerElements(getFabricCanvas, doSyncLayers)

const { initSnapping } = useStickerSnapping(getFabricCanvas, isExporting)

useStickerWorkspace({
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
  syncLayers: doSyncLayers,
  updateMinimapViewport,
  debouncedUpdateMinimapBg,
  initSnapping
})

useStickerHotkeys({
  getShow: () => props.show,
  getFabricCanvas,
  deleteSelected,
  handleSelection,
  syncLayers: doSyncLayers,
  saveTemplate: () => saveTemplate(),
  undo,
  redo,
  duplicateSelected,
  copySelected,
  pasteCopied,
  groupSelected,
  ungroupSelected,
  updateProperty
})

// --- API & Template Saving ---
const fetchPaperSizes = async () => {
  try {
    const res = await api.get('/paper-sizes')
    if (res.data.success) {
      paperSizes.value = res.data.data
    }
  } catch (error) {
    console.error('Gagal memuat ukuran kertas', error)
  }
}
watch(() => props.show, (newVal) => {
  if (newVal && paperSizes.value.length === 0) {
    fetchPaperSizes()
  }
}, { immediate: true })

const saveTemplate = async () => {
  if (!templateName.value.trim()) {
    await swalAlert('Nama template tidak boleh kosong!')
    return
  }
  if (!fabricCanvas) return

  isSaving.value = true
  try {
    const paperBg = fabricCanvas.getObjects().find(o => o.id === 'paper-bg')
    if (paperBg) fabricCanvas.remove(paperBg)

    const exportData = fabricCanvas.toJSON(['id'])
    const objects = fabricCanvas.getObjects()
    if (exportData.objects) {
      exportData.objects.forEach((rawObj, index) => {
        const obj = objects[index]
        if (obj && obj.isDynamicBarcode) {
          rawObj.isDynamicBarcode = obj.isDynamicBarcode
          rawObj.barcodeType = obj.barcodeType
          rawObj.barcodeValue = obj.barcodeValue
          rawObj.barcodeDisplayValue = obj.barcodeDisplayValue
        }
      })
    }

    if (selectedPaperSize.value && selectedPaperSize.value.id) {
      exportData.paper_size_id = selectedPaperSize.value.id
    }

    const designData = JSON.stringify(exportData)

    if (paperBg) fabricCanvas.insertAt(0, paperBg)

    let url = '/sticker-templates'
    let method = 'POST'
    if (props.initialTemplate && props.initialTemplate.id) {
      url = `/sticker-templates/${props.initialTemplate.id}`
      method = 'PUT'
    }

    const response = await api({
      method: method.toLowerCase(),
      url,
      data: {
        name: templateName.value,
        paper_size: `${paperWidth.value}x${paperHeight.value}`,
        config_json: designData
      }
    })

    const result = response.data
    if (result.success) {
      const savedId = props.initialTemplate?.id || result.data?.id
      emit('saved', { id: savedId, name: templateName.value })
      emit('close')
    } else {
      await swalAlert('Gagal menyimpan: ' + result.message)
    }
  } catch (err) {
    console.error('Save error', err)
    await swalAlert('Terjadi kesalahan jaringan.')
  } finally {
    isSaving.value = false
  }
}
</script>

<template>
  <Teleport to="body">
    <transition name="modal-fade">
      <div v-if="show" class="fixed inset-0 z-[1000] flex items-center justify-center print:hidden bg-secondary">
        <div class="w-full h-full relative flex flex-col z-10 overflow-hidden">
          <!-- Header -->
          <div class="p-4 border-b border-primary/10 flex justify-between items-center bg-background">
            <div class="flex items-center gap-3">
              <div class="w-10 h-10 rounded-xl bg-accent/10 flex items-center justify-center text-accent">
                <font-awesome-icon icon="fa-solid fa-object-group" class="text-xl" />
              </div>
              <div>
                <h3 class="text-xl font-black text-text tracking-tight">Template Builder</h3>
                <p class="text-sm text-text/60">Desain stiker khusus dengan fitur drag & drop</p>
              </div>
            </div>
            <button
              @click="$emit('close')"
              class="text-text/50 hover:text-accent transition-colors w-8 h-8 rounded-full hover:bg-accent/10 flex items-center justify-center"
            >
              <font-awesome-icon icon="fa-solid fa-times" />
            </button>
          </div>

          <!-- Toolbar & Canvas Area -->
          <div class="flex flex-col lg:flex-row flex-1 bg-background min-h-0">
            <!-- Toolbar Kiri -->
            <div class="w-full lg:w-[20%] border-r border-primary/10 flex flex-col bg-secondary/30 h-full">
              <!-- PROPERTY INSPECTOR -->
              <div
                class="p-4 flex-1 bg-background/50 max-h-[calc(100vh-150px)] custom-scrollbar overflow-y-auto"
                v-if="activeObject"
              >
                <div class="flex justify-between items-center mb-3">
                  <h4 class="text-xs font-bold text-primary uppercase tracking-widest flex items-center gap-2">
                    <font-awesome-icon icon="fa-solid fa-sliders-h" /> Properti Objek
                  </h4>
                  <span class="text-[10px] px-2 py-0.5 bg-accent/10 text-accent rounded-full font-bold">Terpilih</span>
                </div>

                <!-- Transform Properties -->
                <div class="mb-4 space-y-3 pb-4 border-b border-primary/10">
                  <div class="flex gap-2">
                    <div class="flex-1">
                      <label class="block text-[10px] font-bold text-text/70 mb-1">X (Pos)</label>
                      <input
                        type="number"
                        v-model.number="activeObjLeft"
                        @input="updateTransformProperty('left', activeObjLeft)"
                        class="w-full bg-background border border-primary/20 rounded-lg px-2 py-1.5 text-sm text-text focus:outline-none focus:border-primary transition-colors"
                      />
                    </div>
                    <div class="flex-1">
                      <label class="block text-[10px] font-bold text-text/70 mb-1">Y (Pos)</label>
                      <input
                        type="number"
                        v-model.number="activeObjTop"
                        @input="updateTransformProperty('top', activeObjTop)"
                        class="w-full bg-background border border-primary/20 rounded-lg px-2 py-1.5 text-sm text-text focus:outline-none focus:border-primary transition-colors"
                      />
                    </div>
                  </div>

                  <div class="flex gap-2">
                    <div class="flex-1">
                      <label class="block text-[10px] font-bold text-text/70 mb-1">Width</label>
                      <input
                        type="number"
                        v-model.number="activeObjWidth"
                        @input="updateTransformProperty('width', activeObjWidth)"
                        class="w-full bg-background border border-primary/20 rounded-lg px-2 py-1.5 text-sm text-text focus:outline-none focus:border-primary transition-colors"
                        min="1"
                      />
                    </div>
                    <div class="flex-1">
                      <label class="block text-[10px] font-bold text-text/70 mb-1">Height</label>
                      <input
                        type="number"
                        v-model.number="activeObjHeight"
                        @input="updateTransformProperty('height', activeObjHeight)"
                        class="w-full bg-background border border-primary/20 rounded-lg px-2 py-1.5 text-sm text-text focus:outline-none focus:border-primary transition-colors"
                        min="1"
                      />
                    </div>
                  </div>

                  <div class="flex gap-2">
                    <div class="flex-1">
                      <label class="block text-[10px] font-bold text-text/70 mb-1">Rotasi (°)</label>
                      <input
                        type="number"
                        v-model.number="activeObjAngle"
                        @input="updateTransformProperty('angle', activeObjAngle)"
                        class="w-full bg-background border border-primary/20 rounded-lg px-2 py-1.5 text-sm text-text focus:outline-none focus:border-primary transition-colors"
                      />
                    </div>
                    <div class="flex-1 flex gap-2">
                      <div class="flex-1">
                        <label class="block text-[10px] font-bold text-text/70 mb-1">Flip X</label>
                        <button
                          @click="updateTransformProperty('flipX', !activeObjFlipX)"
                          class="w-full py-1.5 rounded-lg border text-sm transition-all flex items-center justify-center"
                          :class="
                            activeObjFlipX
                              ? 'bg-primary/10 border-primary text-primary'
                              : 'bg-background border-secondary text-text/70 hover:border-primary/50'
                          "
                        >
                          <font-awesome-icon icon="fa-solid fa-arrows-left-right" />
                        </button>
                      </div>
                      <div class="flex-1">
                        <label class="block text-[10px] font-bold text-text/70 mb-1">Flip Y</label>
                        <button
                          @click="updateTransformProperty('flipY', !activeObjFlipY)"
                          class="w-full py-1.5 rounded-lg border text-sm transition-all flex items-center justify-center"
                          :class="
                            activeObjFlipY
                              ? 'bg-primary/10 border-primary text-primary'
                              : 'bg-background border-secondary text-text/70 hover:border-primary/50'
                          "
                        >
                          <font-awesome-icon icon="fa-solid fa-arrows-up-down" />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                <!-- Alignment Tools -->
                <div class="space-y-4">
                  <label class="text-xs font-bold text-text/70 mb-1 block">
                    Perataan Objek
                    <span class="font-normal opacity-70 text-[10px] ml-1"
                      >(relatif terhadap {{ activeObject.type === 'activeSelection' ? 'Pilihan' : 'Kanvas' }})</span
                    >
                  </label>
                  <div class="grid grid-cols-6 gap-2">
                    <button
                      @click="alignObjects('left')"
                      class="py-2 rounded-lg border bg-background border-secondary text-text/70 hover:border-primary hover:text-primary transition-all flex items-center justify-center"
                      title="Rata Kiri"
                    >
                      <font-awesome-icon icon="fa-solid fa-arrow-left" />
                    </button>
                    <button
                      @click="alignObjects('center')"
                      class="py-2 rounded-lg border bg-background border-secondary text-text/70 hover:border-primary hover:text-primary transition-all flex items-center justify-center"
                      title="Rata Tengah Horisontal"
                    >
                      <font-awesome-icon icon="fa-solid fa-arrows-left-right" />
                    </button>
                    <button
                      @click="alignObjects('right')"
                      class="py-2 rounded-lg border bg-background border-secondary text-text/70 hover:border-primary hover:text-primary transition-all flex items-center justify-center"
                      title="Rata Kanan"
                    >
                      <font-awesome-icon icon="fa-solid fa-arrow-right" />
                    </button>
                    <button
                      @click="alignObjects('top')"
                      class="py-2 rounded-lg border bg-background border-secondary text-text/70 hover:border-primary hover:text-primary transition-all flex items-center justify-center"
                      title="Rata Atas"
                    >
                      <font-awesome-icon icon="fa-solid fa-arrow-up" />
                    </button>
                    <button
                      @click="alignObjects('middle')"
                      class="py-2 rounded-lg border bg-background border-secondary text-text/70 hover:border-primary hover:text-primary transition-all flex items-center justify-center"
                      title="Rata Tengah Vertikal"
                    >
                      <font-awesome-icon icon="fa-solid fa-arrows-up-down" />
                    </button>
                    <button
                      @click="alignObjects('bottom')"
                      class="py-2 rounded-lg border bg-background border-secondary text-text/70 hover:border-primary hover:text-primary transition-all flex items-center justify-center"
                      title="Rata Bawah"
                    >
                      <font-awesome-icon icon="fa-solid fa-arrow-down" />
                    </button>
                  </div>
                </div>

                <!-- Text Properties -->
                <div
                  v-if="
                    activeObject.type === 'i-text' || activeObject.type === 'text' || activeObject.type === 'textbox'
                  "
                  class="space-y-4 pt-4 border-t border-primary/10"
                >
                  <!-- Font Size -->
                  <div>
                    <label class="text-xs font-bold text-text/70 mb-1 flex justify-between">
                      <span>Ukuran Font</span>
                      <span class="text-primary">{{ activeObjFontSize }}px</span>
                    </label>
                    <input
                      type="range"
                      min="10"
                      max="120"
                      step="1"
                      v-model.number="activeObjFontSize"
                      @input="updateProperty('fontSize', activeObjFontSize)"
                      class="w-full accent-primary"
                    />
                  </div>

                  <!-- Font Weight & Alignment -->
                  <div class="flex gap-2">
                    <!-- Bold Toggle -->
                    <button
                      @click="updateProperty('fontWeight', activeObjFontWeight === 'bold' ? 'normal' : 'bold')"
                      class="flex-1 py-2 rounded-lg border text-sm font-bold transition-all flex items-center justify-center gap-2"
                      :class="
                        activeObjFontWeight === 'bold'
                          ? 'bg-primary/10 border-primary text-primary'
                          : 'bg-background border-secondary text-text/70 hover:border-primary/50'
                      "
                    >
                      <font-awesome-icon icon="fa-solid fa-bold" />
                    </button>

                    <!-- Italic Toggle -->
                    <button
                      @click="updateProperty('fontStyle', activeObjFontStyle === 'italic' ? 'normal' : 'italic')"
                      class="flex-1 py-2 rounded-lg border text-sm font-bold transition-all flex items-center justify-center gap-2"
                      :class="
                        activeObjFontStyle === 'italic'
                          ? 'bg-primary/10 border-primary text-primary'
                          : 'bg-background border-secondary text-text/70 hover:border-primary/50'
                      "
                    >
                      <font-awesome-icon icon="fa-solid fa-italic" />
                    </button>

                    <!-- Underline Toggle -->
                    <button
                      @click="updateProperty('underline', !activeObjUnderline)"
                      class="flex-1 py-2 rounded-lg border text-sm font-bold transition-all flex items-center justify-center gap-2"
                      :class="
                        activeObjUnderline
                          ? 'bg-primary/10 border-primary text-primary'
                          : 'bg-background border-secondary text-text/70 hover:border-primary/50'
                      "
                    >
                      <font-awesome-icon icon="fa-solid fa-underline" />
                    </button>

                    <!-- Strikethrough Toggle -->
                    <button
                      @click="updateProperty('linethrough', !activeObjLinethrough)"
                      class="flex-1 py-2 rounded-lg border text-sm font-bold transition-all flex items-center justify-center gap-2"
                      :class="
                        activeObjLinethrough
                          ? 'bg-primary/10 border-primary text-primary'
                          : 'bg-background border-secondary text-text/70 hover:border-primary/50'
                      "
                    >
                      <font-awesome-icon icon="fa-solid fa-strikethrough" />
                    </button>
                  </div>

                  <div class="flex gap-2">
                    <!-- Alignment Group -->
                    <div class="flex rounded-lg border border-secondary overflow-hidden flex-1">
                      <button
                        @click="updateProperty('textAlign', 'left')"
                        class="flex-1 py-2 text-sm transition-all flex items-center justify-center hover:bg-secondary/50"
                        :class="
                          activeObjTextAlign === 'left' ? 'bg-secondary text-primary' : 'bg-background text-text/70'
                        "
                      >
                        <font-awesome-icon icon="fa-solid fa-align-left" />
                      </button>
                      <button
                        @click="updateProperty('textAlign', 'center')"
                        class="flex-1 py-2 text-sm transition-all border-x border-secondary flex items-center justify-center hover:bg-secondary/50"
                        :class="
                          activeObjTextAlign === 'center' ? 'bg-secondary text-primary' : 'bg-background text-text/70'
                        "
                      >
                        <font-awesome-icon icon="fa-solid fa-align-center" />
                      </button>
                      <button
                        @click="updateProperty('textAlign', 'right')"
                        class="flex-1 py-2 text-sm transition-all flex items-center justify-center hover:bg-secondary/50"
                        :class="
                          activeObjTextAlign === 'right' ? 'bg-secondary text-primary' : 'bg-background text-text/70'
                        "
                      >
                        <font-awesome-icon icon="fa-solid fa-align-right" />
                      </button>
                    </div>

                    <!-- Vertical Align Group (originY) -->
                    <div
                      class="flex rounded-lg border border-secondary overflow-hidden flex-1"
                      v-if="
                        activeObject.type === 'textbox' ||
                        activeObject.type === 'i-text' ||
                        activeObject.type === 'text'
                      "
                    >
                      <button
                        @click="setVerticalAlign('top')"
                        class="flex-1 py-2 text-sm transition-all flex items-center justify-center hover:bg-secondary/50"
                        :class="
                          activeObject.originY === 'top' || !activeObject.originY
                            ? 'bg-secondary text-primary'
                            : 'bg-background text-text/70'
                        "
                        title="Rata Atas (Memanjang ke Bawah)"
                      >
                        <font-awesome-icon icon="fa-solid fa-align-left" class="rotate-90" />
                      </button>
                      <button
                        @click="setVerticalAlign('center')"
                        class="flex-1 py-2 text-sm transition-all border-x border-secondary flex items-center justify-center hover:bg-secondary/50"
                        :class="
                          activeObject.originY === 'center' ? 'bg-secondary text-primary' : 'bg-background text-text/70'
                        "
                        title="Rata Tengah (Memanjang Dua Arah)"
                      >
                        <font-awesome-icon icon="fa-solid fa-align-center" class="rotate-90" />
                      </button>
                      <button
                        @click="setVerticalAlign('bottom')"
                        class="flex-1 py-2 text-sm transition-all flex items-center justify-center hover:bg-secondary/50"
                        :class="
                          activeObject.originY === 'bottom' ? 'bg-secondary text-primary' : 'bg-background text-text/70'
                        "
                        title="Rata Bawah (Memanjang ke Atas)"
                      >
                        <font-awesome-icon icon="fa-solid fa-align-right" class="rotate-90" />
                      </button>
                    </div>
                  </div>
                </div>

                <!-- General Appearance Properties -->
                <div class="mt-4 space-y-4 pt-4 border-t border-primary/10" v-if="activeObject.type !== 'image'">
                  <!-- Colors -->
                  <div class="flex gap-4">
                    <div class="flex-1 min-w-0">
                      <label class="flex justify-between items-center text-[10px] font-bold text-text/70 mb-1">
                        <span>Warna Utama</span>
                        <button @click="updateProperty('fill', 'transparent')" class="text-primary hover:underline font-normal text-[9px]">Transparan</button>
                      </label>
                      <div class="flex items-center gap-1">
                        <input
                          type="color"
                          :value="(activeObjFill && activeObjFill.startsWith('#')) ? activeObjFill.substring(0, 7) : '#000000'"
                          @input="updateProperty('fill', $event.target.value)"
                          class="w-7 h-7 rounded cursor-pointer p-0 border-0 bg-transparent shrink-0"
                        />
                        <input
                          type="text"
                          v-model="activeObjFill"
                          @change="updateProperty('fill', activeObjFill)"
                          class="w-full min-w-0 text-[10px] bg-secondary/30 text-text rounded px-1.5 py-1 outline-none border border-transparent focus:border-primary/50 font-mono"
                          placeholder="rgba(0,0,0,0)"
                        />
                      </div>
                    </div>
                    <div class="flex-1 min-w-0">
                      <label class="flex justify-between items-center text-[10px] font-bold text-text/70 mb-1">
                        <span>Warna Garis</span>
                        <button @click="updateProperty('stroke', 'transparent')" class="text-primary hover:underline font-normal text-[9px]">Transparan</button>
                      </label>
                      <div class="flex items-center gap-1">
                        <input
                          type="color"
                          :value="(activeObjStroke && activeObjStroke.startsWith('#')) ? activeObjStroke.substring(0, 7) : '#000000'"
                          @input="updateProperty('stroke', $event.target.value)"
                          class="w-7 h-7 rounded cursor-pointer p-0 border-0 bg-transparent shrink-0"
                        />
                        <input
                          type="text"
                          v-model="activeObjStroke"
                          @change="updateProperty('stroke', activeObjStroke)"
                          class="w-full min-w-0 text-[10px] bg-secondary/30 text-text rounded px-1.5 py-1 outline-none border border-transparent focus:border-primary/50 font-mono"
                          placeholder="rgba(0,0,0,0)"
                        />
                      </div>
                    </div>
                  </div>

                  <!-- Stroke Width -->
                  <div>
                    <label class="text-xs font-bold text-text/70 mb-1 flex justify-between">
                      <span>Tebal Garis</span>
                      <span class="text-primary">{{ activeObjStrokeWidth }}px</span>
                    </label>
                    <input
                      type="range"
                      min="0"
                      max="20"
                      step="1"
                      v-model.number="activeObjStrokeWidth"
                      @input="updateProperty('strokeWidth', activeObjStrokeWidth)"
                      class="w-full accent-primary"
                    />
                  </div>
                </div>

                <!-- Image Properties (placeholder jika diperlukan ke depannya) -->
              </div>

              <div
                v-else
                class="p-4 flex-1 bg-background/50 flex flex-col items-center justify-center text-center text-text/40"
              >
                <font-awesome-icon icon="fa-solid fa-mouse-pointer" class="text-3xl mb-2 opacity-50" />
                <p class="text-xs">Klik elemen di kanvas untuk<br />melihat properti.</p>
              </div>
            </div>

            <!-- Canvas Area -->
            <div class="flex-1 p-0 flex relative bg-gray-100 overflow-hidden" ref="canvasWrapper">
              <canvas ref="canvasEl" class="absolute inset-0"></canvas>

              <!-- FLOATING TOOLBAR: TAMBAH ELEMEN -->
              <div
                class="absolute bottom-6 left-1/2 -translate-x-1/2 bg-secondary/90 backdrop-blur-md border border-primary/20 p-2 rounded-2xl shadow-xl flex gap-2 z-10 hover:bg-secondary transition-colors"
              >
                <button
                  @click="addText"
                  class="p-3 bg-background border border-secondary rounded-xl hover:border-primary/40 hover:text-primary hover:bg-primary/5 transition-all shadow-sm group w-12 h-12 flex items-center justify-center"
                  title="Teks Statis"
                >
                  <font-awesome-icon icon="fa-solid fa-font" class="text-lg text-text/50 group-hover:text-primary" />
                </button>

                <div class="relative group">
                  <button
                    @click="toggleDynamicMenu"
                    class="p-3 bg-background border border-secondary rounded-xl hover:border-primary/40 hover:text-primary hover:bg-primary/5 transition-all shadow-sm group w-12 h-12 flex items-center justify-center"
                    title="Data Dinamis"
                  >
                    <font-awesome-icon icon="fa-solid fa-tags" class="text-lg text-text/50 group-hover:text-primary" />
                  </button>

                  <!-- Dropdown -->
                  <transition
                    enter-active-class="transition ease-out duration-200"
                    enter-from-class="opacity-0 translate-y-2 scale-95"
                    enter-to-class="opacity-100 translate-y-0 scale-100"
                    leave-active-class="transition ease-in duration-150"
                    leave-from-class="opacity-100 translate-y-0 scale-100"
                    leave-to-class="opacity-0 translate-y-2 scale-95"
                  >
                    <div
                      v-if="isDynamicMenuOpen"
                      class="absolute bottom-[calc(100%+0.5rem)] left-1/2 -translate-x-1/2 bg-secondary/95 backdrop-blur-md border border-primary/20 rounded-xl shadow-xl flex flex-col min-w-[180px] overflow-hidden z-20 pb-1"
                    >
                      <div
                        class="px-3 py-2 text-[10px] font-bold text-text/50 uppercase tracking-widest border-b border-primary/10 mb-1 bg-background/50"
                      >
                        Pilih Variabel
                      </div>

                      <button
                        @click="addSpecificText('produk')"
                        class="px-4 py-2.5 text-sm text-left hover:bg-primary/10 hover:text-primary transition-colors flex items-center gap-3 text-text/80"
                      >
                        <font-awesome-icon icon="fa-solid fa-box" class="w-4 opacity-70" /> Nama Produk
                      </button>

                      <button
                        @click="addSpecificText('sku')"
                        class="px-4 py-2.5 text-sm text-left hover:bg-primary/10 hover:text-primary transition-colors flex items-center gap-3 text-text/80"
                      >
                        <font-awesome-icon icon="fa-solid fa-barcode" class="w-4 opacity-70" /> SKU Produk
                      </button>

                      <button
                        @click="addSpecificText('harga_rp')"
                        class="px-4 py-2.5 text-sm text-left hover:bg-primary/10 hover:text-primary transition-colors flex items-center gap-3 text-text/80"
                      >
                        <font-awesome-icon icon="fa-solid fa-money-bill" class="w-4 opacity-70" /> Harga (Rp)
                      </button>

                      <button
                        @click="addSpecificText('tanggal')"
                        class="px-4 py-2.5 text-sm text-left hover:bg-primary/10 hover:text-primary transition-colors flex items-center gap-3 text-text/80"
                      >
                        <font-awesome-icon icon="fa-solid fa-calendar-day" class="w-4 opacity-70" /> Tanggal Cetak
                      </button>

                      <div class="h-px bg-primary/10 my-1 mx-2"></div>

                      <button
                        @click="addDynamicText"
                        class="px-4 py-2.5 text-sm text-left hover:bg-primary/10 hover:text-primary transition-colors flex items-center gap-3 text-text/80"
                      >
                        <font-awesome-icon icon="fa-solid fa-plus" class="w-4 opacity-70" /> Custom Data
                      </button>
                    </div>
                  </transition>
                </div>
                <button
                  @click="openMediaPicker"
                  class="p-3 bg-background border border-secondary rounded-xl hover:border-primary/40 hover:text-primary hover:bg-primary/5 transition-all shadow-sm group w-12 h-12 flex items-center justify-center"
                  title="Pilih Gambar"
                >
                  <font-awesome-icon icon="fa-solid fa-image" class="text-lg text-text/50 group-hover:text-primary" />
                </button>
                <div class="w-px h-8 bg-primary/20 mx-1 self-center"></div>
                <button
                  @click="addRectangle"
                  class="p-3 bg-background border border-secondary rounded-xl hover:border-primary/40 hover:text-primary hover:bg-primary/5 transition-all shadow-sm group w-12 h-12 flex items-center justify-center"
                  title="Kotak"
                >
                  <font-awesome-icon icon="fa-solid fa-square" class="text-lg text-text/50 group-hover:text-primary" />
                </button>
                <button
                  @click="addCircle"
                  class="p-3 bg-background border border-secondary rounded-xl hover:border-primary/40 hover:text-primary hover:bg-primary/5 transition-all shadow-sm group w-12 h-12 flex items-center justify-center"
                  title="Bulat"
                >
                  <font-awesome-icon icon="fa-solid fa-circle" class="text-lg text-text/50 group-hover:text-primary" />
                </button>
                <button
                  @click="addTriangle"
                  class="p-3 bg-background border border-secondary rounded-xl hover:border-primary/40 hover:text-primary hover:bg-primary/5 transition-all shadow-sm group w-12 h-12 flex items-center justify-center"
                  title="Segitiga"
                >
                  <font-awesome-icon icon="fa-solid fa-caret-up" class="text-[26px] mb-[-4px] text-text/50 group-hover:text-primary" />
                </button>
                <button
                  @click="addLine"
                  class="p-3 bg-background border border-secondary rounded-xl hover:border-primary/40 hover:text-primary hover:bg-primary/5 transition-all shadow-sm group w-12 h-12 flex items-center justify-center"
                  title="Garis"
                >
                  <font-awesome-icon icon="fa-solid fa-minus" class="text-lg text-text/50 group-hover:text-primary" />
                </button>

                <div class="w-px h-8 bg-primary/20 mx-1 self-center"></div>

                <button
                  @click="openBarcodeModal"
                  class="p-3 bg-background border border-secondary rounded-xl hover:border-primary/40 hover:text-primary hover:bg-primary/5 transition-all shadow-sm group w-12 h-12 flex items-center justify-center"
                  title="Barcode / QR Code"
                >
                  <font-awesome-icon icon="fa-solid fa-qrcode" class="text-lg text-text/50 group-hover:text-primary" />
                </button>

                <!-- Undo / Redo Buttons -->
                <button
                  @click="undo"
                  :disabled="historyIndex <= 0"
                  class="p-3 bg-background border border-secondary rounded-xl transition-all shadow-sm group w-12 h-12 flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed"
                  :class="historyIndex > 0 ? 'hover:border-primary/40 hover:text-primary hover:bg-primary/5' : ''"
                  title="Undo (Ctrl+Z)"
                >
                  <font-awesome-icon
                    icon="fa-solid fa-rotate-left"
                    class="text-lg"
                    :class="historyIndex > 0 ? 'text-text/50 group-hover:text-primary' : 'text-text/30'"
                  />
                </button>
                <button
                  @click="redo"
                  :disabled="historyIndex >= historyStack.length - 1"
                  class="p-3 bg-background border border-secondary rounded-xl transition-all shadow-sm group w-12 h-12 flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed"
                  :class="
                    historyIndex < historyStack.length - 1
                      ? 'hover:border-primary/40 hover:text-primary hover:bg-primary/5'
                      : ''
                  "
                  title="Redo (Ctrl+Y)"
                >
                  <font-awesome-icon
                    icon="fa-solid fa-rotate-right"
                    class="text-lg"
                    :class="
                      historyIndex < historyStack.length - 1 ? 'text-text/50 group-hover:text-primary' : 'text-text/30'
                    "
                  />
                </button>
              </div>
            </div>

            <!-- Toolbar Kanan (Layers List) -->
            <div class="w-full lg:w-[20%] border-l border-primary/10 flex flex-col bg-secondary/30 h-full min-h-0">
              <div
                class="p-4 border-b border-primary/10 sticky top-0 bg-secondary/90 backdrop-blur-sm z-10 flex items-center justify-between"
              >
                <h4 class="text-xs font-bold text-text/50 uppercase tracking-widest flex items-center gap-2">
                  <font-awesome-icon icon="fa-solid fa-layer-group" /> Daftar Layer
                </h4>
              </div>

              <div class="flex-1 min-h-0 p-2 flex flex-col gap-1 overflow-y-auto custom-scrollbar">
                <div v-if="canvasLayers.length === 0" class="text-center text-text/40 text-xs py-8">
                  Belum ada elemen
                </div>
                <div
                  v-for="(layer, index) in canvasLayers"
                  :key="layer.id"
                  draggable="true"
                  @dragstart="e => onDragStart(e, index)"
                  @dragover="e => onDragOver(e, index)"
                  @drop="e => onDrop(e, index)"
                  @dragend="onDragEnd"
                  @click="e => selectLayer(layer, e)"
                  class="flex items-center justify-between p-1.5 rounded border cursor-pointer transition-all"
                  :class="[
                    layer.isActive
                      ? 'bg-primary/10 border-primary shadow-sm'
                      : 'bg-background border-secondary hover:border-primary/50',
                    dragOverLayerIndex === index ? 'border-t-2 border-t-primary' : '',
                    draggedLayerIndex === index ? 'opacity-50' : ''
                  ]"
                >
                  <!-- Layer Info -->
                  <div class="flex items-center gap-2 overflow-hidden flex-1">
                    <button
                      @click.stop="toggleVisibilityLayer(layer)"
                      class="w-5 h-5 shrink-0 rounded flex items-center justify-center transition-colors"
                      :class="
                        !layer.isVisible
                          ? 'text-text/30 bg-secondary hover:text-text/50'
                          : 'text-primary/70 hover:text-primary'
                      "
                      :title="layer.isVisible ? 'Sembunyikan' : 'Tampilkan'"
                    >
                      <font-awesome-icon
                        :icon="layer.isVisible ? 'fa-solid fa-eye' : 'fa-solid fa-eye-slash'"
                        class="text-[10px]"
                      />
                    </button>
                    <div
                      class="flex items-center gap-1 cursor-grab hover:text-primary text-text/30 shrink-0"
                      title="Geser (Drag)"
                    >
                      <font-awesome-icon icon="fa-solid fa-grip-vertical" class="text-[10px]" />
                    </div>
                    <div
                      class="w-5 h-5 rounded bg-secondary/50 flex items-center justify-center shrink-0"
                      :class="layer.isActive ? 'text-primary' : 'text-text/50'"
                    >
                      <font-awesome-icon
                        v-if="layer.type === 'i-text' || layer.type === 'text'"
                        icon="fa-solid fa-font"
                        class="text-[10px]"
                      />
                      <font-awesome-icon
                        v-else-if="layer.type === 'rect'"
                        icon="fa-solid fa-square"
                        class="text-[10px]"
                      />
                      <font-awesome-icon
                        v-else-if="layer.type === 'circle'"
                        icon="fa-solid fa-circle"
                        class="text-[10px]"
                      />
                      <font-awesome-icon
                        v-else-if="layer.type === 'line'"
                        icon="fa-solid fa-minus"
                        class="text-[10px]"
                      />
                      <font-awesome-icon
                        v-else-if="layer.type === 'triangle'"
                        icon="fa-solid fa-caret-up"
                        class="text-[12px] mb-[-2px]"
                      />
                      <font-awesome-icon
                        v-else-if="layer.type === 'image'"
                        icon="fa-solid fa-image"
                        class="text-[10px]"
                      />
                      <font-awesome-icon v-else icon="fa-solid fa-cube" class="text-[10px]" />
                    </div>

                    <input
                      v-if="editingLayerId === layer.id"
                      v-model="editingLayerName"
                      @blur="saveLayerName(layer)"
                      @keyup.enter="saveLayerName(layer)"
                      @click.stop
                      ref="editingInput"
                      class="w-full text-[11px] font-semibold bg-background border border-primary px-1 py-0.5 rounded outline-none text-text flex-1"
                      placeholder="Nama Layer"
                      autofocus
                    />
                    <span
                      v-else
                      @dblclick.stop="startEditingLayer(layer)"
                      class="text-[11px] font-semibold truncate select-none flex-1"
                      :class="layer.isActive ? 'text-primary' : 'text-text/80'"
                      title="Klik Ganda untuk Ubah Nama"
                    >
                      {{ layer.text }}
                    </span>
                  </div>

                  <!-- Layer Actions -->
                  <div class="flex items-center gap-1 shrink-0 ml-2">
                    <button
                      @click.stop="toggleLockLayer(layer)"
                      class="w-5 h-5 rounded flex items-center justify-center transition-colors"
                      :class="
                        layer.isLocked
                          ? 'text-primary bg-primary/10 hover:bg-primary/20'
                          : 'text-text/30 hover:text-primary hover:bg-primary/5'
                      "
                      :title="layer.isLocked ? 'Buka Kunci' : 'Kunci Layer'"
                    >
                      <font-awesome-icon
                        :icon="layer.isLocked ? 'fa-solid fa-lock' : 'fa-solid fa-unlock'"
                        class="text-[10px]"
                      />
                    </button>
                  </div>
                </div>
              </div>

              <!-- Layer Actions (Bottom Bar) -->
              <div class="flex items-center justify-between p-2 bg-background border-t border-primary/10">
                <div class="flex gap-2 flex-1">
                  <!-- Blending Mode (disabled if no active object) -->
                  <select
                    v-if="activeObject"
                    v-model="activeObject.globalCompositeOperation"
                    @change="updateProperty('globalCompositeOperation', $event.target.value)"
                    class="bg-secondary/30 text-[10px] text-text rounded px-1 py-1 w-20 outline-none border border-transparent focus:border-primary/50"
                  >
                    <option value="source-over">Normal</option>
                    <option value="multiply">Multiply</option>
                    <option value="screen">Screen</option>
                    <option value="overlay">Overlay</option>
                    <option value="darken">Darken</option>
                    <option value="lighten">Lighten</option>
                  </select>
                  <select
                    v-else
                    disabled
                    class="bg-secondary/10 text-[10px] text-text/30 rounded px-1 py-1 w-20 outline-none border border-transparent"
                  >
                    <option>Normal</option>
                  </select>

                  <!-- Opacity -->
                  <div class="flex items-center gap-1 flex-1 px-1">
                    <span class="text-[9px] font-bold text-text/50 uppercase">Op</span>
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.05"
                      :disabled="!activeObject"
                      :value="activeObject ? activeObject.opacity : 1"
                      @input="activeObject ? updateProperty('opacity', parseFloat($event.target.value)) : null"
                      class="w-full h-1 bg-secondary rounded-lg appearance-none cursor-pointer"
                    />
                  </div>
                </div>
                <div class="flex items-center gap-1 border-l border-primary/10 pl-2 ml-1 shrink-0">
                  <button
                    @click="groupSelected"
                    :disabled="!activeObject || activeObject.type !== 'activeselection'"
                    class="w-6 h-6 rounded flex items-center justify-center text-text/50 hover:bg-primary/10 hover:text-primary disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                    title="Grup Objek (Ctrl+G)"
                  >
                    <font-awesome-icon icon="fa-solid fa-object-group" class="text-[10px]" />
                  </button>
                  <button
                    @click="ungroupSelected"
                    :disabled="!activeObject || activeObject.type !== 'group'"
                    class="w-6 h-6 rounded flex items-center justify-center text-text/50 hover:bg-primary/10 hover:text-primary disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                    title="Pisahkan Grup (Ctrl+Shift+G)"
                  >
                    <font-awesome-icon icon="fa-solid fa-object-ungroup" class="text-[10px]" />
                  </button>
                  <button
                    @click="duplicateSelected"
                    :disabled="!activeObject"
                    class="w-6 h-6 rounded flex items-center justify-center text-text/50 hover:bg-primary/10 hover:text-primary disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                    title="Duplikat Layer Terpilih"
                  >
                    <font-awesome-icon icon="fa-solid fa-copy" class="text-[10px]" />
                  </button>
                  <button
                    @click="deleteSelected"
                    :disabled="!activeObject"
                    class="w-6 h-6 rounded flex items-center justify-center text-text/50 hover:bg-danger/10 hover:text-danger disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                    title="Hapus Layer Terpilih"
                  >
                    <font-awesome-icon icon="fa-solid fa-trash" class="text-[10px]" />
                  </button>
                </div>
              </div>

              <!-- MINIMAP -->
              <div class="mt-auto border-t border-primary/10 p-4 bg-background/50 sticky bottom-0 z-20">
                <h4
                  class="text-[10px] font-bold text-text/50 uppercase tracking-widest mb-2 flex items-center justify-between"
                >
                  <span class="flex items-center gap-2"><font-awesome-icon icon="fa-solid fa-map" /> Navigator</span>
                  <div class="flex items-center gap-2">
                    <button
                      @click="centerCanvas"
                      class="text-primary hover:bg-primary/10 w-5 h-5 rounded flex items-center justify-center transition-colors"
                      title="Pusatkan Kanvas"
                    >
                      <font-awesome-icon icon="fa-solid fa-compress" />
                    </button>
                    <span class="text-primary font-mono bg-primary/10 px-2 py-0.5 rounded" title="Zoom">
                      {{ Math.round(canvasZoom * 100) }}%
                    </span>
                  </div>
                </h4>
                <div
                  class="w-full h-32 bg-secondary rounded-xl border border-primary/20 relative flex items-center justify-center"
                >
                  <div
                    class="relative shadow-sm bg-white overflow-hidden border border-gray-300"
                    :style="{ width: minimapImgWidth + 'px', height: minimapImgHeight + 'px' }"
                  >
                    <img v-if="minimapUrl" :src="minimapUrl" class="w-full h-full object-contain pointer-events-none" />

                    <!-- Viewport Indicator -->
                    <div
                      class="absolute border-2 border-primary bg-primary/10 pointer-events-none transition-all duration-75"
                      :style="{
                        left: `${minimapRect.left}%`,
                        top: `${minimapRect.top}%`,
                        width: `${minimapRect.width}%`,
                        height: `${minimapRect.height}%`
                      }"
                    ></div>
                  </div>
                </div>
                <p class="text-[9px] text-text/40 text-center mt-2 italic font-medium">
                  <span class="font-bold">Alt + Drag</span> untuk menggeser kanvas
                </p>
              </div>
            </div>
          </div>

          <!-- Footer / Action -->
          <div
            class="px-6 pt-2 border-t border-primary/10 bg-background/50 flex flex-col sm:flex-row justify-between items-center gap-4"
          >
            <!-- PENGATURAN KANVAS -->
            <div
              class="flex flex-wrap items-center gap-2 mr-auto bg-secondary/50 px-3 py-1.5 rounded-xl border border-primary/10"
            >
              <span class="text-[10px] font-bold text-text/50 uppercase tracking-widest whitespace-nowrap">
                <font-awesome-icon icon="fa-solid fa-expand" /> Kanvas
              </span>
              <select
                v-model="selectedPaperSize"
                class="bg-background border border-primary/20 rounded-md px-2 py-1 text-xs font-bold text-text focus:outline-none focus:border-primary transition-colors min-w-[120px]"
              >
                <option :value="null">Kustom (mm)</option>
                <option v-for="ps in paperSizes" :key="ps.id" :value="ps">
                  {{ ps.name }}
                </option>
              </select>

              <template v-if="!selectedPaperSize">
                <input
                  v-model.number="paperWidth"
                  @change="applyPaperSize"
                  type="number"
                  min="10"
                  class="w-14 bg-background border border-primary/20 rounded-md px-2 py-1 text-sm font-bold text-text focus:outline-none focus:border-primary text-center"
                  title="Lebar"
                />
                <span class="text-text/50 text-xs font-bold">x</span>
                <input
                  v-model.number="paperHeight"
                  @change="applyPaperSize"
                  type="number"
                  min="10"
                  class="w-14 bg-background border border-primary/20 rounded-md px-2 py-1 text-sm font-bold text-text focus:outline-none focus:border-primary text-center"
                  title="Tinggi"
                />
              </template>
              <template v-else>
                <span
                  class="text-xs font-mono font-bold text-text bg-background px-2 py-1 rounded-md border border-primary/10"
                >
                  {{ selectedPaperSize.labelWidth }} x {{ selectedPaperSize.labelHeight }} mm
                </span>
              </template>
            </div>

            <div class="flex-1 w-full max-w-sm ml-auto">
              <input
                v-model="templateName"
                type="text"
                placeholder="Beri nama template ini..."
                class="w-full bg-secondary border border-primary/20 rounded-xl px-4 py-2.5 text-sm font-bold text-text focus:outline-none focus:border-primary shadow-inner"
              />
            </div>

            <div class="flex gap-3">
              <button
                @click="$emit('close')"
                class="px-6 py-2.5 rounded-xl font-bold text-text bg-secondary border border-primary/20 hover:bg-background transition-colors"
              >
                Batal
              </button>
              <button
                @click="saveTemplate"
                :disabled="isSaving"
                class="px-8 py-2.5 rounded-xl font-bold text-white bg-primary hover:bg-primary/90 transition-all shadow-lg shadow-primary/30 flex items-center gap-2 disabled:opacity-50"
              >
                <font-awesome-icon v-if="isSaving" icon="fa-solid fa-spinner" class="animate-spin" />
                <font-awesome-icon v-else icon="fa-solid fa-save" />
                {{ isSaving ? 'Menyimpan...' : 'Simpan Template' }}
              </button>
            </div>
          </div>
        </div>
      </div>
    </transition>

    <!-- Media Picker Modal -->
    <MediaPickerModal :show="isMediaPickerOpen" @close="closeMediaPicker" @select="insertMediaToCanvas" />

    <!-- Barcode / QR Code Modal -->
    <transition
      enter-active-class="transition ease-out duration-300"
      enter-from-class="opacity-0"
      enter-to-class="opacity-100"
      leave-active-class="transition ease-in duration-200"
      leave-from-class="opacity-100"
      leave-to-class="opacity-0"
    >
      <div
        v-if="isBarcodeModalOpen"
        class="fixed inset-0 z-[1200] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      >
        <div
          class="bg-background rounded-2xl shadow-2xl w-full max-w-md border border-primary/20 overflow-hidden"
          @click.stop
        >
          <div class="px-6 py-4 border-b border-primary/10 flex justify-between items-center bg-secondary/30">
            <h3 class="text-lg font-black text-text flex items-center gap-2">
              <font-awesome-icon icon="fa-solid fa-qrcode" class="text-primary" /> Buat Barcode / QR
            </h3>
            <button
              @click="closeBarcodeModal"
              class="text-text/50 hover:text-danger transition-colors w-8 h-8 rounded-full hover:bg-danger/10 flex items-center justify-center"
            >
              <font-awesome-icon icon="fa-solid fa-times" />
            </button>
          </div>
          <div class="p-6 space-y-4">
            <div>
              <label class="block text-sm font-bold text-text/70 mb-2">Tipe Kode</label>
              <div class="grid grid-cols-2 gap-3">
                <button
                  @click="barcodeConfig.type = 'barcode'"
                  class="py-3 px-4 rounded-xl border flex flex-col items-center justify-center gap-2 transition-all"
                  :class="
                    barcodeConfig.type === 'barcode'
                      ? 'bg-primary/10 border-primary text-primary'
                      : 'bg-background border-secondary text-text/60 hover:border-primary/50'
                  "
                >
                  <font-awesome-icon icon="fa-solid fa-barcode" class="text-2xl" />
                  <span class="text-xs font-bold">Barcode (Code 128)</span>
                </button>
                <button
                  @click="barcodeConfig.type = 'qrcode'"
                  class="py-3 px-4 rounded-xl border flex flex-col items-center justify-center gap-2 transition-all"
                  :class="
                    barcodeConfig.type === 'qrcode'
                      ? 'bg-primary/10 border-primary text-primary'
                      : 'bg-background border-secondary text-text/60 hover:border-primary/50'
                  "
                >
                  <font-awesome-icon icon="fa-solid fa-qrcode" class="text-2xl" />
                  <span class="text-xs font-bold">QR Code</span>
                </button>
              </div>
            </div>

            <div>
              <label class="block text-sm font-bold text-text/70 mb-2">Nilai / Variabel Data</label>
              <input
                type="text"
                v-model="barcodeConfig.value"
                placeholder="Contoh: {{ sku }} atau 12345678"
                class="w-full bg-background border border-primary/20 rounded-xl px-4 py-2.5 text-text focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all"
              />
              <p class="text-xs text-text/50 mt-2">
                Gunakan format
                <code class="bg-secondary px-1 py-0.5 rounded text-primary" v-pre>{{ nama_variabel }}</code> untuk data
                dinamis dari database.
              </p>
            </div>

            <div v-if="barcodeConfig.type === 'barcode'" class="flex items-center gap-3 pt-2">
              <label class="relative inline-flex items-center cursor-pointer">
                <input type="checkbox" v-model="barcodeConfig.displayValue" class="sr-only peer" />
                <div
                  class="w-11 h-6 bg-secondary peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"
                ></div>
              </label>
              <span class="text-sm font-bold text-text/80">Tampilkan Teks di Bawah Barcode</span>
            </div>
          </div>
          <div class="px-6 py-4 border-t border-primary/10 bg-secondary/30 flex justify-end gap-3">
            <button
              @click="closeBarcodeModal"
              class="px-4 py-2 text-sm font-bold text-text/70 hover:text-text transition-colors"
            >
              Batal
            </button>
            <button
              @click="addBarcode"
              class="px-6 py-2 bg-primary text-white rounded-xl font-bold text-sm shadow-md hover:bg-primary/90 hover:shadow-lg transition-all flex items-center gap-2"
            >
              <font-awesome-icon icon="fa-solid fa-check" /> Tambahkan ke Kanvas
            </button>
          </div>
        </div>
      </div>
    </transition>
  </Teleport>
</template>

<style scoped>
.modal-fade-enter-active,
.modal-fade-leave-active {
  transition:
    opacity 0.3s ease,
    transform 0.3s ease;
}

.modal-fade-enter-from,
.modal-fade-leave-to {
  opacity: 0;
  transform: scale(0.98);
}
</style>
