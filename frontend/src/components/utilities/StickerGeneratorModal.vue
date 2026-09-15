<script setup>
import { swalConfirm, swalAlert } from '@/composables/useSweetAlert'
import { ref, computed, watch, onMounted, defineAsyncComponent } from 'vue'
import { useToast } from '@/composables/useToast.js'
import { useDownload } from '@/composables/useDownload.js'
import { FontAwesomeIcon } from '@fortawesome/vue-fontawesome'
import DpvStickerTemplate from './DpvStickerTemplate.vue'
const DynamicStickerRenderer = defineAsyncComponent(() => import('./DynamicStickerRenderer.vue'))
const StickerTemplateBuilder = defineAsyncComponent(() => import('./StickerTemplateBuilder.vue'))
const PaperSizeManagerModal = defineAsyncComponent(() => import('./PaperSizeManagerModal.vue'))
import ProductSearchSelector from '@/components/wms/transfer/ProductSearchSelector.vue'
import ScannerToggle from '@/components/utilities/ScannerToggle.vue'
import { useAuthStore } from '@/stores/auth'
import { formatCurrency } from '@/utils/formatters.js'
import api from '@/api/axios'
const props = defineProps({
  show: { type: Boolean, required: true },
  initialProduct: { type: Object, default: null },
  initialBatch: { type: Array, default: () => [] }
})

defineEmits(['close'])
const { toast } = useToast()
const { downloadBlob } = useDownload()

// Data struktur: array of { id, line1, line2, copies }
const stickers = ref([])
const selectedPaperSize = ref(null)
const paperSizes = ref([])
const showPaperSizeManager = ref(false)
const paperOrientation = ref('landscape') // 'landscape' or 'portrait'

const templates = ref([])
const selectedTemplate = ref(null)
const showBuilder = ref(false)
const editTemplateData = ref(null)
const previewRenderer = ref(null)
const printRenderers = ref([])
const searchSelectors = ref([])
const enableScanner = ref(false)
const authStore = useAuthStore()

const fetchTemplates = async () => {
  try {
    const res = await api.get('/sticker-templates')
    const data = res.data
    if (data.success && data.data) {
      templates.value = data.data
      if (templates.value.length > 0 && !selectedTemplate.value) {
        selectedTemplate.value = templates.value[0]
      }
    }
  } catch (e) {
    console.error('Gagal memuat template', e)
  }
}

const parsedTemplateConfig = computed(() => {
  if (!selectedTemplate.value || !selectedTemplate.value.config_json) return null
  let config = selectedTemplate.value.config_json
  // Backend may double-stringify: parse until we get an Object
  while (typeof config === 'string') {
    try {
      config = JSON.parse(config)
    } catch {
      return null
    }
  }
  return typeof config === 'object' ? config : null
})

const templateVariables = computed(() => {
  if (!selectedTemplate.value || !selectedTemplate.value.config_json) {
    return ['data_1', 'data_2'] // Default backward compatibility variables
  }

  try {
    const config = parsedTemplateConfig.value
    if (!config) return ['data_1', 'data_2']

    const vars = new Set()
    if (config.objects) {
      config.objects.forEach(obj => {
        const textToSearch = obj.text || obj.barcodeValue || ''
        const matches = textToSearch.match(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g)
        if (matches) {
          matches.forEach(m => {
            const varName = m.replace(/\{\{|\}\}/g, '').trim()
            vars.add(varName)
          })
        }
      })
    }
    const arr = Array.from(vars).sort()
    return arr.length > 0 ? arr : []
  } catch {
    return ['data_1', 'data_2']
  }
})

const openNewBuilder = async () => {
  editTemplateData.value = null
  showBuilder.value = true
}

const handleEditTemplate = () => {
  if (!selectedTemplate.value) return
  editTemplateData.value = selectedTemplate.value
  showBuilder.value = true
}

const handleCopyTemplate = () => {
  if (!selectedTemplate.value) return
  editTemplateData.value = {
    ...selectedTemplate.value,
    id: null,
    name: selectedTemplate.value.name + ' (Copy)'
  }
  showBuilder.value = true
}

const onTemplateSaved = async savedData => {
  await fetchTemplates()
  // Auto-select the newly saved template if it exists in the fetched list
  if (savedData && savedData.id) {
    const newlySaved = templates.value.find(t => t.id === savedData.id)
    if (newlySaved) {
      selectedTemplate.value = newlySaved
    }
  }
}

const deleteTemplate = async id => {
  if (!id) {
    await swalAlert('ID template tidak ditemukan pada object. Harap refresh.')
    return
  }
  if (!(await swalConfirm(`Hapus template ini (ID: ${id})?`))) return
  try {
    const res = await api.delete(`/sticker-templates/${id}`)
    const data = res.data
    if (data.success) {
      if (selectedTemplate.value?.id === id) selectedTemplate.value = null
      fetchTemplates()
    } else {
      await swalAlert(data.message)
    }
  } catch (e) {
    console.error(e)
  }
}

const applyTemplatePaperSize = () => {
  if (selectedTemplate.value && selectedTemplate.value.config_json && paperSizes.value.length > 0) {
    let parsedConfig = selectedTemplate.value.config_json
    if (typeof parsedConfig === 'string') {
      try {
        parsedConfig = JSON.parse(parsedConfig)
      } catch (err) {
        console.warn(err)
      }
    }
    if (parsedConfig && parsedConfig.paper_size_id) {
      const found = paperSizes.value.find(p => p.id === parsedConfig.paper_size_id)
      if (found) {
        selectedPaperSize.value = found
      }
    }
  }
}

const fetchPaperSizes = async () => {
  try {
    const res = await api.get('/paper-sizes')
    if (res.data.success && res.data.data) {
      paperSizes.value = res.data.data
      if (paperSizes.value.length > 0 && !selectedPaperSize.value) {
        selectedPaperSize.value = paperSizes.value[0]
      }
      // Re-apply template paper size in case templates loaded before paper sizes
      applyTemplatePaperSize()
    }
  } catch (e) {
    console.error('Gagal memuat ukuran kertas', e)
  }
}

watch(selectedTemplate, applyTemplatePaperSize)

watch(selectedPaperSize, newSize => {
  if (newSize) {
    if (newSize.labelWidth >= newSize.labelHeight) {
      paperOrientation.value = 'landscape'
    } else {
      paperOrientation.value = 'portrait'
    }
  }
})

onMounted(() => {
  fetchTemplates()
  fetchPaperSizes()
})

const handleProductSelected = (product, sticker, varName) => {
  if (!product) {
    sticker.data[varName] = ''
    return
  }

  // Force update the selected field
  sticker.data[varName] = product.name

  const today = new Date()
  const formattedDate = today.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })

  // Map standard product fields to common template variable names
  const mapping = {
    nama_produk: product.name,
    product_name: product.name,
    produk: product.name,
    product: product.name,
    sku: product.sku,
    harga: product.price,
    price: product.price,
    harga_rp: formatCurrency(product.price || 0),
    tanggal: formattedDate,
    date: formattedDate
  }

  // Iterate over template variables, not just existing keys in sticker.data
  templateVariables.value.forEach(key => {
    const lowerKey = key.toLowerCase()
    if (mapping[lowerKey] !== undefined) {
      sticker.data[key] = mapping[lowerKey]
    }
  })
}

const handleScannerMatchInGenerator = (product, sticker, varName) => {
  try {
    handleProductSelected(product, sticker, varName)
    addSticker()

    // Re-focus the newly added row after Vue updates DOM
    setTimeout(() => {
      const newIndex = stickers.value.length - 1
      if (searchSelectors.value[newIndex]) {
        searchSelectors.value[newIndex].focusInput()
      } else {
        console.warn('[Scanner Match] Could not find searchSelector for index:', newIndex)
      }
    }, 50)
  } catch (err) {
    console.error('[Scanner Match] Error:', err)
  }
}

watch(
  () => props.show,
  newVal => {
    if (newVal) {
      const today = new Date()
      const formattedDate = today.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })

      if (props.initialBatch && props.initialBatch.length > 0) {
        // Batch print mode (dari BatchMovement)
        stickers.value = props.initialBatch.map((item, index) => ({
          id: Date.now() + index,
          data: {
            data_1: item.sku || '',
            data_2: item.name || '',
            sku: item.sku || '',
            produk: item.name || '',
            harga: item.price || 0,
            harga_rp: formatCurrency(item.price || 0),
            tanggal: formattedDate,
            date: formattedDate
          },
          copies: item.quantity || 1
        }))
      } else if (props.initialProduct) {
        // Single mode (dari ProductRow)
        stickers.value = [
          {
            id: Date.now(),
            data: {
              data_1: props.initialProduct.sku || '',
              data_2: props.initialProduct.name || '',
              sku: props.initialProduct.sku || '',
              produk: props.initialProduct.name || '',
              harga: props.initialProduct.price || 0,
              harga_rp: formatCurrency(props.initialProduct.price || 0),
              tanggal: formattedDate,
              date: formattedDate
            },
            copies: 1
          }
        ]
      } else {
        // Batch mode (kosong atau default)
        stickers.value = [
          {
            id: Date.now(),
            data: {
              tanggal: formattedDate,
              date: formattedDate
            },
            copies: 1
          }
        ]
      }
    }
  }
)

function addSticker() {
  const today = new Date()
  const formattedDate = today.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })

  stickers.value.push({
    id: Date.now(),
    data: {
      tanggal: formattedDate,
      date: formattedDate
    },
    copies: 1
  })
}

function removeSticker(index) {
  stickers.value.splice(index, 1)
}

const printStickers = computed(() => {
  const result = []
  stickers.value.forEach(s => {
    for (let i = 0; i < s.copies; i++) {
      result.push({ ...s })
    }
  })
  return result
})

const handleDownloadZip = async () => {
  if (!printRenderers.value || printRenderers.value.length === 0) {
    toast('Tidak ada sticker untuk diunduh.', 'warning')
    return
  }

  try {
    const JSZipModule = await import('jszip')
    const JSZip = JSZipModule.default || JSZipModule
    const zip = new JSZip()
    const folder = zip.folder('stickers')
    let count = 0

    for (let i = 0; i < printStickers.value.length; i++) {
      const renderer = printRenderers.value[i]
      if (renderer) {
        const dataUrl = renderer.getDataURL()
        if (dataUrl) {
          const base64Data = dataUrl.split(',')[1]
          const sku = printStickers.value[i].data?.sku || `sticker_${i + 1}`
          folder.file(`${sku}_${i + 1}.png`, base64Data, { base64: true })
          count++
        }
      }
    }

    if (count > 0) {
      const content = await zip.generateAsync({ type: 'blob' })
      downloadBlob(content, `stickers_batch_${Date.now()}.zip`)
      toast(`Berhasil mengunduh ${count} stiker.`, 'success')
    } else {
      //
    }
  } catch (err) {
    console.error(err)
  }
}

function handlePrint() {
  if (printStickers.value.length === 0) {
    return
  }
  window.print()
}

const dynamicStickerWidth = computed(() => {
  if (selectedPaperSize.value) return selectedPaperSize.value.labelWidth || 80
  return 80
})

const dynamicStickerHeight = computed(() => {
  if (selectedPaperSize.value) return selectedPaperSize.value.labelHeight || 40
  return 40
})

const printStickerWidth = computed(() => {
  return paperOrientation.value === 'portrait' ? dynamicStickerHeight.value : dynamicStickerWidth.value
})

const printStickerHeight = computed(() => {
  return paperOrientation.value === 'portrait' ? dynamicStickerWidth.value : dynamicStickerHeight.value
})
</script>

<template>
  <!-- Modal Overlay (Hidden during print) -->
  <transition name="modal-fade">
    <div v-if="show" class="fixed inset-0 z-[100] flex items-center justify-center print:hidden">
      <div class="absolute inset-0 bg-black/60 backdrop-blur-sm" @click="$emit('close')"></div>

      <div
        class="bg-secondary w-full max-w-6xl max-h-[90vh] rounded-2xl shadow-2xl relative flex flex-col border border-secondary/20 z-10 m-4"
      >
        <!-- Header -->
        <div class="p-6 border-b border-primary/10 flex justify-between items-center bg-background/50 rounded-t-2xl">
          <div class="flex items-center gap-3">
            <div class="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center text-primary">
              <font-awesome-icon icon="fa-solid fa-print" />
            </div>
            <div>
              <h3 class="text-xl font-bold text-text">Sticker Generator</h3>
              <p class="text-sm text-text/60">Buat dan cetak sticker label DPV</p>
            </div>
          </div>
          <button
            @click="$emit('close')"
            class="text-text/50 hover:text-accent transition-colors w-8 h-8 rounded-full hover:bg-accent/10 flex items-center justify-center"
          >
            <font-awesome-icon icon="fa-solid fa-times" />
          </button>
        </div>

        <!-- Body -->
        <div class="p-4 sm:p-6 overflow-y-auto custom-scrollbar flex-1 flex flex-col lg:flex-row gap-6">
          <!-- Editor Form -->
          <div class="flex-1 space-y-4 w-full lg:w-1/2">
            <div class="flex justify-between items-center">
              <h4 class="font-bold text-text">Daftar Sticker</h4>
              <div class="flex items-center gap-2">
                <!-- Scanner Mode Toggle -->
                <ScannerToggle v-model="enableScanner" />

                <button
                  @click="addSticker"
                  class="text-xs px-3 py-1 h-7 bg-primary/10 text-primary rounded-lg font-bold hover:bg-primary hover:text-white transition-colors flex items-center"
                >
                  <font-awesome-icon icon="fa-solid fa-plus" class="mr-1" /> Tambah
                </button>
              </div>
            </div>

            <div
              class="overflow-y-auto custom-scrollbar max-h-[70vh] p-2 grid grid-cols-1 gap-2 rounded-xl bg-background/50"
            >
              <div
                v-for="(sticker, index) in stickers"
                :key="sticker.id"
                class="bg-background p-4 rounded-xl relative group"
              >
                <button
                  v-if="stickers.length > 1"
                  @click="removeSticker(index)"
                  class="absolute -top-2 -right-2 w-6 h-6 bg-danger text-background rounded-full text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <font-awesome-icon icon="fa-solid fa-times" />
                </button>

                <div class="flex flex-col sm:flex-row gap-4">
                  <div class="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div v-for="varName in templateVariables" :key="varName" class="relative">
                      <label class="block text-xs font-bold text-text/70 mb-1 capitalize">
                        {{ varName.replace('_', ' ') }}
                      </label>
                      <template
                        v-if="
                          ['nama_produk', 'product_name', 'produk', 'product', 'sku'].includes(varName.toLowerCase())
                        "
                      >
                        <ProductSearchSelector
                          :ref="
                            el => {
                              if (el) searchSelectors[index] = el
                            }
                          "
                          :modelValue="
                            sticker.data[varName] ? { name: sticker.data[varName], sku: sticker.data[varName] } : null
                          "
                          @update:modelValue="p => handleProductSelected(p, sticker, varName)"
                          :enable-scanner="enableScanner"
                          @scanner-match="p => handleScannerMatchInGenerator(p, sticker, varName)"
                          :placeholder="`Cari ${varName}...`"
                          :display-field="varName.toLowerCase() === 'sku' ? 'sku' : 'name'"
                        />
                      </template>
                      <template v-else>
                        <input
                          v-model="sticker.data[varName]"
                          type="text"
                          class="w-full bg-secondary border border-primary/20 rounded-lg px-3 py-2 text-sm text-text focus:outline-none focus:border-primary shadow-inner"
                          :placeholder="`Isi ${varName}...`"
                        />
                      </template>
                    </div>
                  </div>

                  <!-- Copies -->
                  <div class="w-20">
                    <label class="block text-xs font-bold text-text/70 mb-1">Copy</label>
                    <input
                      v-model.number="sticker.copies"
                      type="number"
                      min="1"
                      class="w-full bg-secondary border border-primary/20 rounded-lg px-3 py-2 text-sm text-text focus:outline-none focus:border-primary shadow-inner"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Live Preview -->
          <div class="w-full lg:w-1/2 flex flex-col gap-4">
            <!-- Template Selection & Builder -->
            <div class="bg-secondary/30 p-4 rounded-xl border border-secondary">
              <label class="block text-xs font-bold text-text/70 mb-2">Pilih Template</label>
              <div class="flex flex-wrap sm:flex-nowrap gap-2">
                <select
                  v-model="selectedTemplate"
                  class="flex-1 bg-background border border-primary/20 rounded-lg px-2 py-1.5 text-sm text-text focus:outline-none focus:border-primary"
                >
                  <option :value="null">Default (Statis)</option>
                  <option v-for="t in templates" :key="t.id" :value="t">{{ t.name }}</option>
                </select>
                <button
                  v-if="selectedTemplate"
                  @click="handleCopyTemplate"
                  class="px-2 text-text/60 hover:text-primary hover:bg-primary/10 rounded-lg transition-colors"
                  title="Duplikat Template"
                >
                  <font-awesome-icon icon="fa-solid fa-copy" />
                </button>
                <button
                  v-if="selectedTemplate && authStore.hasPermission('user.manage')"
                  @click="handleEditTemplate"
                  class="px-2 text-text/60 hover:text-accent hover:bg-accent/10 rounded-lg transition-colors"
                  title="Edit Template"
                >
                  <font-awesome-icon icon="fa-solid fa-pen" />
                </button>
                <button
                  v-if="selectedTemplate && authStore.hasPermission('user.manage')"
                  @click="deleteTemplate(selectedTemplate.id)"
                  class="px-2 text-danger hover:bg-danger/10 rounded-lg transition-colors"
                  title="Hapus Template"
                >
                  <font-awesome-icon icon="fa-solid fa-trash" />
                </button>
              </div>
              <button
                @click="openNewBuilder"
                class="w-full mt-2 text-xs py-1.5 bg-primary/10 text-primary font-bold rounded-lg hover:bg-primary hover:text-white transition-colors"
              >
                <font-awesome-icon icon="fa-solid fa-paint-roller" class="mr-1" /> Editor Template Baru
              </button>
            </div>

            <h4 class="font-bold text-text mt-2">Live Preview</h4>
            <div
              class="bg-background border border-secondary rounded-xl p-4 flex flex-col items-center justify-center gap-4 flex-1"
            >
              <!-- Render just the first sticker as preview -->
              <div
                class="max-w-full h-auto shadow-md bg-white flex"
                :style="{ width: dynamicStickerWidth + 'mm', height: dynamicStickerHeight + 'mm', maxWidth: '100%' }"
              >
                <template v-if="stickers.length > 0">
                  <DynamicStickerRenderer
                    v-if="parsedTemplateConfig"
                    ref="previewRenderer"
                    :config="parsedTemplateConfig"
                    :variables="stickers[0].data"
                    :paper-size="
                      selectedPaperSize ? `${selectedPaperSize.labelWidth}x${selectedPaperSize.labelHeight}` : '80x40'
                    "
                  />
                  <DpvStickerTemplate
                    v-else
                    :line1="stickers[0].data?.data_1 || ''"
                    :line2="stickers[0].data?.data_2 || ''"
                  />
                </template>
              </div>
            </div>
          </div>
        </div>

        <!-- Footer -->
        <div
          class="p-4 sm:p-6 border-t border-primary/10 bg-background/50 rounded-b-2xl flex flex-col lg:flex-row justify-between items-center gap-4"
        >
          <div class="flex flex-wrap items-center justify-center lg:justify-start gap-4 w-full lg:w-auto">
            <div class="flex items-center gap-2 border-r border-primary/20 pr-4">
              <label class="text-sm font-bold text-text/70">Ukuran Kertas:</label>
              <select
                v-model="selectedPaperSize"
                :disabled="!!selectedTemplate"
                class="bg-secondary border border-primary/20 rounded-lg px-3 py-1.5 text-sm font-bold text-text focus:outline-none focus:border-primary disabled:opacity-50 disabled:cursor-not-allowed"
                :title="selectedTemplate ? 'Ukuran kertas mengikuti template' : 'Pilih ukuran kertas'"
              >
                <option v-for="size in paperSizes" :key="size.id" :value="size">{{ size.name }}</option>
              </select>
              <button
                @click="showPaperSizeManager = true"
                class="px-2 py-1 bg-primary/10 text-primary rounded hover:bg-primary hover:text-white transition-colors"
                title="Kelola Ukuran Kertas"
              >
                <font-awesome-icon icon="fa-solid fa-cog" />
              </button>
            </div>
            <div class="flex items-center gap-2">
              <label class="text-sm font-bold text-text/70">Orientasi:</label>
              <select
                v-model="paperOrientation"
                :disabled="!!selectedTemplate"
                class="bg-secondary border border-primary/20 rounded-lg px-3 py-1.5 text-sm font-bold text-text focus:outline-none focus:border-primary disabled:opacity-50 disabled:cursor-not-allowed"
                :title="selectedTemplate ? 'Orientasi otomatis mengikuti ukuran kertas template' : 'Pilih orientasi'"
              >
                <option value="landscape">Landscape</option>
                <option value="portrait">Portrait</option>
              </select>
            </div>
            <div class="text-sm text-text/60 font-semibold border-l border-primary/20 pl-4 hidden lg:block">
              Total: <span class="text-primary">{{ printStickers.length }}</span> sticker
            </div>
          </div>
          <div class="flex flex-wrap sm:flex-nowrap gap-3 w-full lg:w-auto justify-center lg:justify-end mt-4 lg:mt-0">
            <button
              @click="$emit('close')"
              class="flex-1 sm:flex-none px-6 py-2 rounded-xl font-bold text-text bg-secondary border border-primary/20 hover:bg-background transition-colors"
            >
              Batal
            </button>
            <button
              @click="handleDownloadZip"
              v-if="selectedTemplate && selectedTemplate.config_json"
              class="flex-1 sm:flex-none px-4 py-2 rounded-xl font-bold text-accent bg-accent/10 border border-accent/20 hover:bg-accent/20 transition-colors flex justify-center items-center gap-2"
              title="Download semua stiker sebagai ZIP"
            >
              <font-awesome-icon icon="fa-solid fa-file-zipper" />
              Download ZIP
            </button>
            <button
              @click="handlePrint"
              class="w-full sm:w-auto px-6 py-2 rounded-xl font-bold text-white bg-primary hover:bg-primary/90 transition-colors shadow-lg shadow-primary/30 flex justify-center items-center gap-2"
            >
              <font-awesome-icon icon="fa-solid fa-print" />
              Cetak Sekarang
            </button>
          </div>
        </div>
      </div>
    </div>
  </transition>

  <!-- Area khusus untuk cetak (Hanya tampil saat window.print dipanggil) -->
  <Teleport to="body">
    <div
      v-if="show"
      class="print-container"
      :class="[
        selectedPaperSize?.numberAcross > 1 || selectedPaperSize?.numberDown > 1
          ? 'print-mode-grid'
          : 'print-mode-thermal',
        `print-orientation-${paperOrientation}`
      ]"
    >
      <!-- Inject dynamic @page CSS -->
      <component :is="'style'">
        @media print { @page { size:
        {{
          selectedPaperSize
            ? `${selectedPaperSize.pageWidth}mm ${selectedPaperSize.pageHeight}mm`
            : dynamicStickerWidth + 'mm ' + dynamicStickerHeight + 'mm'
        }}
        {{ paperOrientation }}; margin: 0; } .print-mode-grid { display: grid !important; grid-template-columns:
        repeat({{ selectedPaperSize?.numberAcross || 1 }},
        {{ selectedPaperSize?.labelWidth || dynamicStickerWidth }}mm); grid-template-rows: repeat({{
          selectedPaperSize?.numberDown || 1
        }}, {{ selectedPaperSize?.labelHeight || dynamicStickerHeight }}mm); column-gap:
        {{ Math.max(0, (selectedPaperSize?.horizontalPitch || 0) - (selectedPaperSize?.labelWidth || 0)) }}mm; row-gap:
        {{ Math.max(0, (selectedPaperSize?.verticalPitch || 0) - (selectedPaperSize?.labelHeight || 0)) }}mm;
        padding-top: {{ selectedPaperSize?.topMargin || 0 }}mm; padding-left:
        {{ selectedPaperSize?.sideMargin || 0 }}mm; background: white; width: 100% !important; height: 100vh !important;
        box-sizing: border-box; } }
      </component>

      <div
        v-for="(ps, i) in printStickers"
        :key="'print-' + i"
        class="sticker-item"
        :style="{ width: printStickerWidth + 'mm', height: printStickerHeight + 'mm' }"
      >
        <div
          class="sticker-wrapper"
          :style="{ width: dynamicStickerWidth + 'mm', height: dynamicStickerHeight + 'mm' }"
        >
          <DynamicStickerRenderer
            v-if="parsedTemplateConfig"
            :ref="
              el => {
                if (el) printRenderers[i] = el
              }
            "
            :config="parsedTemplateConfig"
            :variables="ps.data"
            :paper-size="
              selectedPaperSize ? `${selectedPaperSize.labelWidth}x${selectedPaperSize.labelHeight}` : '80x40'
            "
          />
          <DpvStickerTemplate v-else :line1="ps.data?.data_1 || ''" :line2="ps.data?.data_2 || ''" />
        </div>
      </div>
    </div>
  </Teleport>

  <StickerTemplateBuilder
    :show="showBuilder"
    :initialTemplate="editTemplateData"
    @close="showBuilder = false"
    @saved="onTemplateSaved"
  />

  <PaperSizeManagerModal
    :show="showPaperSizeManager"
    @close="showPaperSizeManager = false"
    @updated="fetchPaperSizes"
  />
</template>

<style>
/* Hide print container from screen */
.print-container {
  display: none;
}

/*
  Global Print Styles:
  Sembunyikan semua elemen di body KECUALI .print-container
*/
@media print {
  body > *:not(.print-container) {
    display: none !important;
  }

  html,
  body {
    background: white !important;
    margin: 0 !important;
    padding: 0 !important;
    width: 100% !important;
    max-width: none !important;
    min-width: 100% !important;
  }

  .print-container {
    display: block !important;
    position: absolute;
    top: 0;
    left: 0;
    width: 100% !important;
    max-width: none !important;
  }

  /* Default Sticker Size (Landscape) */
  .sticker-item {
    width: 80mm;
    height: 40mm;
    overflow: hidden;
    position: relative;
    page-break-inside: avoid;
  }
  .sticker-wrapper {
    width: 80mm;
    height: 40mm;
  }

  /* Portrait Orientation Logic: Putar 90 derajat */
  .print-orientation-portrait .sticker-wrapper {
    position: absolute;
    top: 0;
    left: 100%;
    transform: rotate(90deg);
    transform-origin: top left;
  }

  /* Thermal Mode: Tiap sticker di-break ke halaman baru */
  .print-mode-thermal {
    display: block !important;
  }
  .print-mode-thermal .sticker-item {
    page-break-after: always;
  }
  .print-mode-thermal .sticker-item:last-child {
    page-break-after: auto;
  }

  /* Grid mode is dynamically generated in the vue component above */
  .print-mode-grid .sticker-item {
    /* Optional: Beri border tipis untuk panduan potong (opsional) */
    outline: 2px dashed #ccc;
  }
}
</style>
