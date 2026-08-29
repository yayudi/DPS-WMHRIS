<script setup>
import { ref, onMounted, onBeforeUnmount, watch, computed, shallowRef } from 'vue'
import { useLocalStorage } from '@vueuse/core'
import { searchProducts } from '@/api/helpers/products.js'
import { useToast } from '@/composables/useToast.js'
import jspreadsheet from 'jspreadsheet-ce'
import 'jspreadsheet-ce/dist/jspreadsheet.css'
import 'jsuites/dist/jsuites.css'

const props = defineProps({
  mode: { type: String, required: true }, // 'INBOUND', 'OUTBOUND', 'TRANSFER_MULTI'
  allLocations: { type: Array, required: true },
  isLoadingLocations: { type: Boolean, default: false }
})

const emit = defineEmits(['submit'])
const { toast } = useToast()

const spreadsheetEl = ref(null)
const jexcelInstance = shallowRef(null)
const rows = useLocalStorage('draft-spreadsheet-rows', [])
const resolvingRows = new Set()

const showFrom = computed(() => ['TRANSFER_MULTI', 'OUTBOUND'].includes(props.mode))
const showTo = computed(() => ['TRANSFER_MULTI', 'INBOUND'].includes(props.mode))
const showStock = computed(() => ['TRANSFER_MULTI', 'OUTBOUND'].includes(props.mode))

// Plain string array for jspreadsheet autocomplete
const locationCodes = computed(() => {
  return props.allLocations.map(l => l.code)
})

// Helper: resolve location ID from code
function resolveLocationId(code) {
  if (!code) return null
  const loc = props.allLocations.find(l => l.code === code)
  return loc ? loc.id : null
}

// Columns structure dynamically based on mode
const getColumns = () => {
  const columns = [
    { type: 'text', title: 'SKU', width: 120 },
    { type: 'text', title: 'Nama Produk', width: 500 }
  ]
  if (showFrom.value) {
    columns.push({
      type: 'dropdown',
      title: 'Dari Lokasi',
      width: 150,
      source: locationCodes.value,
      autocomplete: true
    })
  }
  if (showTo.value) {
    columns.push({ type: 'dropdown', title: 'Ke Lokasi', width: 150, source: locationCodes.value, autocomplete: true })
  }
  if (showStock.value) columns.push({ type: 'text', title: 'Stok', width: 80, readOnly: true })

  columns.push({ type: 'numeric', title: 'Jumlah', width: 80, mask: '#.##0' })
  columns.push({ type: 'text', title: 'Catatan', width: 300 })

  return columns
}

// Map Array of Objects (localStorage) to Array of Arrays (Jspreadsheet)
const mapDataToMatrix = () => {
  if (rows.value.length === 0) return [Array(getColumns().length).fill('')]
  return rows.value.map(r => {
    const row = [r.sku, r.name]
    if (showFrom.value) {
      const loc = props.allLocations.find(l => l.id === r.fromLocationId)
      row.push(loc ? loc.code : '')
    }
    if (showTo.value) {
      const loc = props.allLocations.find(l => l.id === r.toLocationId)
      row.push(loc ? loc.code : '')
    }
    if (showStock.value) row.push(r.availableStock)
    row.push(r.quantity)
    row.push(r.notes)
    return row
  })
}

async function initSpreadsheet() {
  const el = document.getElementById('wms-spreadsheet')
  if (!el) {
    return
  }

  // Bersihkan instance lama sepenuhnya
  try {
    jspreadsheet.destroyAll()
  } catch {
    // ignore if no instance exists
  }
  el.innerHTML = ''

  try {
    const cols = JSON.parse(JSON.stringify(getColumns()))
    const matrixData = JSON.parse(JSON.stringify(mapDataToMatrix()))

    jexcelInstance.value = jspreadsheet(el, {
      worksheets: [
        {
          data: matrixData,
          columns: cols,
          minDimensions: [cols.length, 10],
          defaultColAlign: 'left',
          allowInsertColumn: false,
          allowDeleteColumn: false
        }
      ],
      onchange: handleCellChange,
      oninsertrow: syncData,
      ondeleterow: syncData,
      onedit: () => {
        // Disable native browser autocomplete so it doesn't cover the spreadsheet
        const input = el.querySelector('.jss_editor input, .jss_editor textarea, .edition input, .edition textarea')
        if (input) {
          input.setAttribute('autocomplete', 'on')
          input.setAttribute('spellcheck', 'false')
          input.setAttribute('data-lpignore', 'true')
        }
      }
    })

    // Auto-focus the first cell (A1)
    setTimeout(() => {
      const ws = getWorksheet()
      if (ws && typeof ws.updateSelectionFromCoords === 'function') {
        ws.updateSelectionFromCoords(0, 0, 0, 0)
      }
    }, 50)

    // Intercept Enter key at the DOCUMENT level to ensure we run before Jspreadsheet
    const enterInterceptor = function (e) {
      if (e.key === 'Enter') {
        const activeEl = document.activeElement

        // If the focus is completely outside our spreadsheet, ignore
        if (activeEl && activeEl !== document.body && !el.contains(activeEl) && !activeEl.className.includes('jss')) {
          return
        }

        const isClipboard =
          activeEl &&
          (activeEl.classList.contains('jexcel_textarea') ||
            activeEl.classList.contains('jss_textarea') ||
            activeEl.classList.contains('jspreadsheet_textarea') ||
            activeEl.id === 'jexcel_textarea' ||
            activeEl.clientWidth < 10 ||
            activeEl.clientHeight < 10 ||
            activeEl.style.opacity === '0')

        const isEditing =
          activeEl &&
          el.contains(activeEl) &&
          !isClipboard &&
          (activeEl.tagName === 'INPUT' ||
            activeEl.tagName === 'TEXTAREA' ||
            activeEl.contentEditable === 'true' ||
            activeEl.classList.contains('jdropdown-search'))

        if (!isEditing) {
          e.preventDefault()
          e.stopPropagation()
          e.stopImmediatePropagation() // Block Jspreadsheet's own listener

          const selectedCell = el.querySelector('td.highlight')
          if (selectedCell) {
            // Trigger F2 or double click
            const dblClickEvent = new MouseEvent('dblclick', { bubbles: true, cancelable: true, view: window })
            selectedCell.dispatchEvent(dblClickEvent)
          }
        }
      }
    }

    document.addEventListener('keydown', enterInterceptor, true)
    // Save reference to remove it later
    el._enterInterceptor = enterInterceptor
  } catch (err) {
    console.error('[Jspreadsheet] Error during initialization:', err)
  }
}

// Re-initialize if mode or locations change (debounced)
let initTimeout = null
watch(
  [() => props.mode, () => props.allLocations],
  () => {
    clearTimeout(initTimeout)
    initTimeout = setTimeout(() => {
      if (props.allLocations.length > 0) {
        initSpreadsheet()
      }
    }, 100)
  },
  { deep: true }
)

onMounted(() => {
  if (props.allLocations.length > 0) {
    initSpreadsheet()
  }
})

onBeforeUnmount(() => {
  clearTimeout(initTimeout)
  const el = document.getElementById('wms-spreadsheet')
  if (el && el._enterInterceptor) {
    document.removeEventListener('keydown', el._enterInterceptor, true)
  }
  try {
    jspreadsheet.destroyAll()
  } catch {
    // ignore
  }
})

// Helper: get the first worksheet from the v5 instance
function getWorksheet() {
  if (!jexcelInstance.value) return null
  // v5 returns an array of worksheets
  if (Array.isArray(jexcelInstance.value)) return jexcelInstance.value[0]
  // fallback: maybe it has a worksheets property
  if (jexcelInstance.value.worksheets) return jexcelInstance.value.worksheets[0]
  // fallback: instance itself (v4 compat)
  return jexcelInstance.value
}

// Sync Jspreadsheet matrix to Vue object state
function syncData() {
  const ws = getWorksheet()
  if (!ws) return
  const data = ws.getData()

  rows.value = data.map(cols => {
    let colIdx = 0
    const row = {
      sku: cols[colIdx++] || '',
      name: cols[colIdx++] || ''
    }
    if (showFrom.value) row.fromLocationId = resolveLocationId(cols[colIdx++])
    if (showTo.value) row.toLocationId = resolveLocationId(cols[colIdx++])
    if (showStock.value) row.availableStock = cols[colIdx++] || null

    row.quantity = parseInt(cols[colIdx++] || '0', 10) || 0
    row.notes = cols[colIdx++] || ''

    return row
  })
}

// Helper to get Excel-like cell ID (e.g. A1, B2)
function getCellId(col, row) {
  let letter = ''
  let temp = col
  while (temp >= 0) {
    letter = String.fromCharCode(65 + (temp % 26)) + letter
    temp = Math.floor(temp / 26) - 1
  }
  return letter + (parseInt(row) + 1)
}

// Apply or remove warning style to an entire row
function setRowWarning(ws, y, isWarning) {
  const colsCount = getColumns().length
  for (let i = 0; i < colsCount; i++) {
    const cellId = getCellId(i, y)
    if (isWarning) {
      ws.setStyle(cellId, 'background-color', 'hsl(var(--color-danger) / 0.15)')
      ws.setStyle(cellId, 'color', 'hsl(var(--color-danger))')
    } else {
      // Trick Jspreadsheet to overwrite the style (empty string is often ignored in CE v5)
      ws.setStyle(cellId, 'background-color', 'transparent')
      ws.setStyle(cellId, 'color', 'inherit')

      // FOOLPROOF DOM CLEAR:
      try {
        if (spreadsheetEl.value) {
          const td = spreadsheetEl.value.querySelector(`td[data-x="${i}"][data-y="${y}"]`)
          if (td) {
            td.style.backgroundColor = ''
            td.style.color = ''
          }
        }
      } catch (e) {
        // ignore
      }
    }
  }
}

// Auto resolve Name and Stock
async function handleCellChange(instance, cell, x, y) {
  syncData() // Keep localStorage synced on every change

  // Identify column indices
  let colIdx = 0
  const skuX = colIdx++
  const nameX = colIdx++
  const fromX = showFrom.value ? colIdx++ : -1
  if (showTo.value) colIdx++
  const stockX = showStock.value ? colIdx++ : -1

  const isSku = x == skuX
  const isName = x == nameX
  const isFromLoc = x == fromX

  if ((isSku || isName || isFromLoc) && !resolvingRows.has(y)) {
    resolvingRows.add(y)
    try {
      const ws = getWorksheet()
      if (!ws) return

      const sku = ws.getValueFromCoords(skuX, y)
      const name = ws.getValueFromCoords(nameX, y)
      const fromLocCode = showFrom.value ? ws.getValueFromCoords(fromX, y) : null
      const fromLocId = resolveLocationId(fromLocCode)

      // Determine the query based on what was edited
      let query = ''
      if (isSku) query = sku
      else if (isName) query = name
      else query = sku || name

      if (query) {
        try {
          const results = await searchProducts(query, fromLocId || null, 1, 5)
          const productList = Array.isArray(results) ? results : results?.data || []

          let matched = null

          if (isSku) {
            // SKU column: HARUS exact match SKU (case-insensitive)
            matched = productList.find(p => p.sku.toLowerCase() === query.toLowerCase()) || null
          } else if (isName) {
            // Nama column: LIKE search, ambil hasil pertama
            matched = productList.length > 0 ? productList[0] : null
          } else {
            // fromLoc changed: re-resolve pakai SKU yang sudah ada
            matched = productList.find(p => p.sku.toLowerCase() === sku.toLowerCase()) || null
          }

          if (matched) {
            ws.setValueFromCoords(skuX, y, matched.sku, true)
            ws.setValueFromCoords(nameX, y, matched.name, true)
            if (showStock.value && stockX !== -1) {
              ws.setValueFromCoords(stockX, y, matched.current_stock || 0, true)
            }
            setRowWarning(ws, y, false)
          } else {
            if (isSku) ws.setValueFromCoords(nameX, y, 'Tidak ditemukan', true)
            if (isName) ws.setValueFromCoords(skuX, y, '', true)
            if (showStock.value && stockX !== -1) {
              ws.setValueFromCoords(stockX, y, 0, true)
            }
            setRowWarning(ws, y, true)
          }
        } catch (e) {
          console.error(e)
        }
      } else {
        // Clear Name and Stock if SKU/Name is emptied
        if (isSku) ws.setValueFromCoords(nameX, y, '', true)
        if (isName) ws.setValueFromCoords(skuX, y, '', true)
        if (showStock.value && stockX !== -1) {
          ws.setValueFromCoords(stockX, y, '', true)
        }
        // Remove warning since it's empty
        setRowWarning(ws, y, false)
      }
      syncData() // Re-sync after resolving
    } finally {
      resolvingRows.delete(y)
    }
  }
}

// Expose reset method for parent
function resetRows() {
  rows.value = []
  const ws = getWorksheet()
  if (ws) {
    ws.setData([[]])
  }
}

// Expose submit method for parent
function handleSubmit() {
  syncData()
  // Filter only rows with valid SKU and Quantity > 0
  const validRows = rows.value.filter(r => r.sku && r.quantity > 0)

  if (validRows.length === 0) {
    toast('Tidak ada baris yang valid untuk diproses (SKU dan Jumlah wajib diisi)', 'error')
    return
  }

  // Validation
  for (let i = 0; i < validRows.length; i++) {
    const r = validRows[i]
    if (showFrom.value && !r.fromLocationId) {
      toast(`Baris ke-${i + 1} SKU ${r.sku}: Lokasi asal wajib diisi`, 'error')
      return
    }
    if (showTo.value && !r.toLocationId) {
      toast(`Baris ke-${i + 1} SKU ${r.sku}: Lokasi tujuan wajib diisi`, 'error')
      return
    }
    if (showFrom.value && showTo.value && r.fromLocationId == r.toLocationId) {
      toast(`Baris ke-${i + 1} SKU ${r.sku}: Lokasi asal dan tujuan tidak boleh sama`, 'error')
      return
    }
  }

  emit('submit', validRows)
}
defineExpose({ resetRows, handleSubmit })
</script>

<template>
  <div class="animate-fade-in space-y-4 text-text h-full flex flex-col relative w-full overflow-hidden">
    <div
      class="bg-surface rounded-xl overflow-hidden shadow-sm flex-1 jspreadsheet-container overflow-x-auto w-full pb-4"
    >
      <div id="wms-spreadsheet" ref="spreadsheetEl"></div>
    </div>

    <div class="p-3 bg-secondary/5 text-center text-xs text-text/50 font-medium rounded-lg">
      Beroperasi layaknya Excel: Anda dapat mem-blok sel, melakukan <b>Ctrl+C</b> / <b>Ctrl+V</b> (Paste), dan menarik
      (drag) ujung sel.
    </div>
  </div>
</template>

<style>
/* Customizing Jspreadsheet to match WMS Theme dynamically */
.jspreadsheet-container .jss_container,
.jspreadsheet-container .jss_content {
  background-color: transparent !important;
}

.jspreadsheet-container .jss_worksheet {
  width: 100% !important;
  background-color: hsl(var(--color-background)) !important;
  color: hsl(var(--color-text)) !important;
}

/* Header and Row numbers */
.jspreadsheet-container .jss_worksheet > thead > tr > td,
.jspreadsheet-container .jss_worksheet > tbody > tr > td:first-child {
  background-color: hsl(var(--color-secondary) / 0.15) !important;
  color: hsl(var(--color-text)) !important;
  font-weight: bold;
  border-color: hsl(var(--color-secondary) / 0.8) !important;
}
.jspreadsheet-container .jss_worksheet > thead > tr > td {
  padding: 8px !important;
}

/* Normal cells */
.jspreadsheet-container .jss_worksheet > tbody > tr > td {
  border-color: hsl(var(--color-secondary) / 0.5) !important;
  color: hsl(var(--color-text)) !important;
  padding: 6px !important;
  background-color: hsl(var(--color-background)) !important;
}

/* Alternating rows */
.jspreadsheet-container .jss_worksheet > tbody > tr:nth-child(even) > td {
  background-color: hsl(var(--color-secondary) / 0.05) !important;
}

/* Readonly cells */
.jspreadsheet-container .jss_worksheet > tbody > tr > td.readonly {
  background-color: hsl(var(--color-secondary) / 0.1) !important;
  color: hsl(var(--color-text) / 0.5) !important;
}

/* Hover effect */
.jspreadsheet-container .jss_worksheet > tbody > tr:hover > td {
  background-color: hsl(var(--color-primary) / 0.05) !important;
}

/* Active / Selected cell border */
.jspreadsheet-container .jss_worksheet .highlight-top {
  border-top: 2px solid hsl(var(--color-primary)) !important;
}
.jspreadsheet-container .jss_worksheet .highlight-left {
  border-left: 2px solid hsl(var(--color-primary)) !important;
}
.jspreadsheet-container .jss_worksheet .highlight-right {
  border-right: 2px solid hsl(var(--color-primary)) !important;
}
.jspreadsheet-container .jss_worksheet .highlight-bottom {
  border-bottom: 2px solid hsl(var(--color-primary)) !important;
}
.jspreadsheet-container .jss_worksheet .highlight {
  background-color: hsl(var(--color-primary) / 0.1) !important;
}
.jspreadsheet-container .jss_corner {
  background-color: hsl(var(--color-primary)) !important;
  border-color: hsl(var(--color-background)) !important;
}

/* Jspreadsheet editor inputs & dropdowns */
.jss_editor input,
.jss_editor textarea,
.edition input,
.edition textarea {
  color: hsl(var(--color-text)) !important;
  background-color: hsl(var(--color-background)) !important;
  border: 1px solid hsl(var(--color-secondary) / 0.3) !important;
}
.jdropdown-container {
  background-color: hsl(var(--color-background)) !important;
  color: hsl(var(--color-text)) !important;
  border-color: hsl(var(--color-secondary) / 0.2) !important;
}
.jdropdown-item {
  color: hsl(var(--color-text)) !important;
}
.jdropdown-item:hover {
  background-color: hsl(var(--color-primary) / 0.2) !important;
}
</style>
