import { ref } from 'vue'

export function useProductContextMenu({ props, emit, features = [] }) {
  const contextMenu = ref({
    visible: false,
    x: 0,
    y: 0,
    row: null,
    colId: null,
    options: []
  })

  const isArchived = (row) => !row.is_active || row.is_active === 0 || row.is_active === false

  const openContextMenu = (event, row, colId, isEditable = true) => {
    event.preventDefault()
    const options = []

    // CELL ACTIONS
    if (['sku', 'name', 'weight', 'price'].includes(colId) && isEditable) {
      options.push({ label: 'Salin Teks', action: 'copy', icon: 'fa-solid fa-copy', shortcut: 'Ctrl+C' })
      options.push({ label: 'Tempel Teks', action: 'paste', icon: 'fa-solid fa-paste', shortcut: 'Ctrl+V' })
      if (props.dirtyProducts?.has(row.id) && props.dirtyProducts.get(row.id)[colId] !== undefined) {
        options.push({ label: 'Reset Sel', action: 'reset', icon: 'fa-solid fa-rotate-left' })
      }
      options.push({ divider: true })
    }

    // ROW ACTIONS
    options.push({ label: 'Edit Data Lengkap', action: 'edit_modal', icon: 'fa-solid fa-pen-to-square' })
    options.push({ label: 'Duplikat Baris', action: 'duplicate', icon: 'fa-solid fa-diagram-next' })
    options.push({ label: 'Riwayat Pergerakan', action: 'history', icon: 'fa-solid fa-clock-rotate-left' })
    
    if (features.includes('sticker')) {
      options.push({ label: 'Cetak Sticker', action: 'sticker', icon: 'fa-solid fa-print' })
    }

    if (isArchived(row)) {
      options.push({ label: 'Pulihkan Produk', action: 'restore', icon: 'fa-solid fa-rotate-left', danger: false })
    } else {
      options.push({ label: 'Arsipkan Produk', action: 'archive', icon: 'fa-solid fa-box-archive', danger: true })
    }

    contextMenu.value = {
      visible: true,
      x: event.clientX,
      y: event.clientY,
      row,
      colId,
      options
    }
  }

  const handleContextMenuAction = async (action) => {
    const { row, colId } = contextMenu.value
    if (!row) return

    switch (action) {
      case 'copy':
        try {
          const text = props.dirtyProducts?.get(row.id)?.[colId] ?? row[colId]
          await navigator.clipboard.writeText(text?.toString() || '')
        } catch (err) {
          console.error('Copy failed:', err)
        }
        break
      case 'paste':
        try {
          const text = await navigator.clipboard.readText()
          if (text !== undefined && text !== null) {
            let value = text
            if (['weight', 'price'].includes(colId)) {
              value = Number(text.replace(/[^0-9.-]+/g, '')) || null
            }
            emit('cell-edit', { id: row.id, field: colId, value })
          }
        } catch (err) {
          console.error('Paste failed:', err)
          alert('Gagal mengakses clipboard. Pastikan browser memberikan izin.')
        }
        break
      case 'reset':
        if (props.dirtyProducts?.has(row.id)) {
          const changes = props.dirtyProducts.get(row.id)
          delete changes[colId]
          if (Object.keys(changes).length === 0) {
            props.dirtyProducts.delete(row.id)
          }
        }
        break
      case 'edit_modal':
        emit('edit', row)
        break
      case 'duplicate':
        emit('duplicate', row)
        break
      case 'history':
        emit('view-history', row)
        break
      case 'sticker':
        emit('open-sticker', row)
        break
      case 'restore':
        emit('restore', row)
        break
      case 'archive':
        emit('delete', row)
        break
    }
    contextMenu.value.visible = false
  }

  return {
    contextMenu,
    openContextMenu,
    handleContextMenuAction
  }
}
