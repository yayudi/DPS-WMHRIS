import { computed, watch } from 'vue'
import { useTable, createCoreRowModel } from '@tanstack/vue-table'
import { useVirtualizer } from '@tanstack/vue-virtual'
import { formatCurrency, formatNumber } from '@/utils/formatters'

/**
 * Composable to standardize TanStack Table & Virtualizer for Smart Data Grid
 * @param {Object} options
 * @param {import('vue').Ref<Array>} options.data - Ref to data array
 * @param {Array} options.columns - Column definitions
 * @param {import('vue').Ref<HTMLElement>} options.parentRef - Ref to the scrolling container element
 * @param {number|function} options.estimateSize - Estimated height of rows
 * @param {import('vue').Ref<boolean>} options.hasNextPage - Has more data indicator
 * @param {import('vue').Ref<boolean>} options.isFetchingNextPage - Fetching indicator
 * @param {function} options.onFetchMore - Callback when scrolled near bottom
 * @param {function} options.onCellEdit - Callback when cell is edited
 * @param {Object} [options.tableFeatures={}] - Additional features for useTable
 */
export function useSmartGrid({
  data,
  columns,
  parentRef,
  estimateSize = 64,
  hasNextPage,
  isFetchingNextPage,
  onFetchMore,
  onCellEdit,
  tableFeatures
}) {
  // 1. Setup Table
  const tableOptions = {
    get data() {
      return data.value
    },
    columns,
    getCoreRowModel: createCoreRowModel()
  }
  
  if (tableFeatures) {
    tableOptions.features = tableFeatures
  }

  const table = useTable(tableOptions)

  // 2. Setup Virtualizer
  const rowVirtualizer = useVirtualizer(
    computed(() => ({
      count: table.getRowModel().rows.length,
      getScrollElement: () => parentRef.value,
      estimateSize: typeof estimateSize === 'function' ? estimateSize : () => estimateSize,
      overscan: 5
    }))
  )

  const virtualRows = computed(() => rowVirtualizer.value.getVirtualItems())
  const totalSize = computed(() => rowVirtualizer.value.getTotalSize())

  // Padding for virtual scrolling wrapper
  const paddingTop = computed(() => (virtualRows.value.length > 0 ? virtualRows.value[0]?.start || 0 : 0))
  const paddingBottom = computed(() =>
    virtualRows.value.length > 0
      ? totalSize.value - (virtualRows.value[virtualRows.value.length - 1]?.end || 0)
      : 0
  )

  // 3. Infinite Scroll Watcher
  watch(
    virtualRows,
    (newRows) => {
      if (newRows.length > 0) {
        const lastRow = newRows[newRows.length - 1]
        if (
          lastRow.index >= data.value.length - 3 &&
          hasNextPage?.value &&
          !isFetchingNextPage?.value
        ) {
          if (onFetchMore) onFetchMore()
        }
      }
    },
    { deep: true }
  )

  // 4. Cell Editing Handler
  const formatCurrencyOrNumber = (val, colId) => {
    if (val === null || val === undefined) return '-'
    if (colId === 'price') return formatCurrency(val)
    if (colId === 'weight') return formatNumber(val)
    return val
  }

  const handleCellBlur = (event, rowOriginal, columnId, metaType) => {
    const newValue = event.target.innerText.trim()
    const oldValue = rowOriginal[columnId]

    if (newValue === '') {
      event.target.innerText = formatCurrencyOrNumber(oldValue, columnId)
      return
    }

    let parsedValue = newValue
    if (metaType === 'number') {
      parsedValue = Number(newValue.replace(/[^0-9.-]+/g, ''))
      if (isNaN(parsedValue)) {
        event.target.innerText = formatCurrencyOrNumber(oldValue, columnId)
        return
      }
    }

    if (parsedValue != oldValue && onCellEdit) {
      onCellEdit({ id: rowOriginal.id, field: columnId, value: parsedValue })
    }

    // Always reformat visually after blur (since reactivity might not trigger immediately for dirty state)
    event.target.innerText = formatCurrencyOrNumber(parsedValue, columnId)
  }

  const handleCellFocus = (event, value, metaType) => {
    if (metaType === 'number' && value !== null && value !== undefined) {
      // Strip formatting for easy editing
      event.target.innerText = value.toString()
    }
  }

  const enforceNumberOnly = (event, metaType) => {
    if (metaType !== 'number') return
    const allowedKeys = ['Backspace', 'Delete', 'Tab', 'Enter', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown']
    if (allowedKeys.includes(event.key) || event.ctrlKey || event.metaKey) return
    if (!/^[0-9.]$/.test(event.key)) {
      event.preventDefault()
    }
  }

  return {
    table,
    rowVirtualizer,
    virtualRows,
    totalSize,
    paddingTop,
    paddingBottom,
    handleCellBlur,
    handleCellFocus,
    formatCurrencyOrNumber,
    enforceNumberOnly
  }
}
