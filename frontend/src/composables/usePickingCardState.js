import { computed, ref } from 'vue'
import { swalConfirm } from '@/composables/useSweetAlert'
import { getSourceBadgeClass } from '@/utils/channelConstants.js'

export function usePickingCardState(props, authStore) {
  const isOpen = ref(false)
  const isLoading = ref(false)
  const isEditModalOpen = ref(false)

  const sourceBgClass = computed(() => getSourceBadgeClass(props.inv?.source, { solid: true }))

  function handleCardClick(event, emit) {
    if (props.mode !== 'picking') return
    const target = event.target
    if (
      target.closest('button') ||
      target.closest('a') ||
      target.closest('.modal') ||
      target.closest('[data-no-card-select]')
    ) {
      return
    }
    emit('toggle-invoice', { inv: props.inv, checked: !isInvoiceSelected.value })
  }

  async function onVoidInvoice(emit) {
    const msg = `Void pesanan ${props.inv?.original_invoice_id || props.inv?.invoice}?\nSemua status item (termasuk yang berhasil di-pick) akan dikembalikan ke stok.`
    if (!(await swalConfirm(msg))) return
    try {
      isLoading.value = true
      emit('void-invoice', props.inv.id)
    } catch (error) {
      console.error(error)
    } finally {
      setTimeout(() => {
        isLoading.value = false
      }, 500)
    }
  }

  async function onRetryBackorder(emit) {
    isLoading.value = true
    try {
      emit('retry-backorder', props.inv.id)
    } catch (error) {
      console.error(error)
    } finally {
      setTimeout(() => {
        isLoading.value = false
      }, 500)
    }
  }
  const totalSKU = computed(() => {
    if (props.mode === 'history' && props.inv.items) {
      return props.inv.items.length
    }
    let count = 0
    if (props.inv.locations) {
      Object.values(props.inv.locations).forEach((items) => {
        count += items.length
      })
    }
    return count
  })

  const hasStockIssue = computed(() => {
    if (props.mode === 'history' || !props.inv.locations) return false
    for (const locName in props.inv.locations) {
      for (const item of props.inv.locations[locName]) {
        if (item.status === 'BACKORDER' || !item.location_code || Number(item.available_stock || 0) < Number(item.quantity || 0))
          return true
      }
    }
    return false
  })

  const isInvoiceSelected = computed(() => {
    if (props.mode !== 'picking') return false
    let validItems = []
    if (props.inv.locations) {
      Object.values(props.inv.locations).forEach((items) => {
        items.forEach((i) => {
          if (props.validateStock(i)) {
            validItems.push(i.id)
          }
        })
      })
    }

    if (validItems.length === 0) return false
    return validItems.every((id) => props.selectedItems.has(id))
  })

  const canCancel = computed(() => {
    if (props.mode === 'picking') {
      return hasStockIssue.value && authStore.hasPermission('picking.cancel')
    }
    return authStore.hasPermission('picking.cancel')
  })

  function isItemInvalid(item) {
    if (props.mode === 'history') return false
    if (!item.location_code) return true
    return !props.validateStock({ ...item, quantity: Number(item.quantity) })
  }

  function hasInsufficientStock(item) {
    if (props.mode === 'history') return false
    if (item.status === 'BACKORDER' || !item.location_code) return true
    const available = Number(item.available_stock || 0)
    const needed = Number(item.quantity || 0)
    return available < needed
  }

  function isItemAllowed(item) {
    if (props.mode === 'history') return false
    return props.validateStock(item)
  }

  function getMpStatusBadge(status) {
    const map = {
      SHIPPED: {
        class: 'text-primary bg-primary/10 border-primary/20',
        label: 'Dikirim',
        icon: 'fa-truck-fast',
      },
      COMPLETED: {
        class: 'text-success bg-success/10 border-success/20',
        label: 'Selesai',
        icon: 'fa-check-double',
      },
      NEW: { class: 'text-accent bg-accent/10 border-accent/20', label: 'Baru', icon: 'fa-star' },
      CANCELLED: {
        class: 'text-danger bg-danger/10 border-danger/20',
        label: 'Batal',
        icon: 'fa-ban',
      },
      RETURNED: {
        class: 'text-warning bg-warning/10 border-warning/20',
        label: 'Retur',
        icon: 'fa-rotate-left',
      },
    }
    return (
      map[status] || {
        class: 'text-secondary bg-secondary/10 border-secondary/20',
        label: status || '-',
        icon: 'fa-info',
      }
    )
  }

  function getStatusBadge(status) {
    const map = {
      VALIDATED: {
        class: 'text-success bg-success/5 border-success/20',
        label: 'Dipick',
        icon: 'fa-check',
      },
      COMPLETED: {
        class: 'text-success bg-success/5 border-success/20',
        label: 'Selesai',
        icon: 'fa-check-double',
      },
      RETURNED: {
        class: 'text-danger bg-danger/5 border-danger/20',
        label: 'Retur',
        icon: 'fa-rotate-left',
      },
      CANCEL: {
        class: 'text-secondary bg-secondary/5 border-secondary/20',
        label: 'Batal',
        icon: 'fa-ban',
      },
    }
    return (
      map[status] || {
        class: 'text-secondary bg-secondary/5 border-secondary/20',
        label: status || '-',
        icon: 'fa-info',
      }
    )
  }

  return {
    isOpen,
    isLoading,
    isEditModalOpen,
    sourceBgClass,
    handleCardClick,
    onVoidInvoice,
    onRetryBackorder,
    totalSKU,
    hasStockIssue,
    isInvoiceSelected,
    canCancel,
    isItemInvalid,
    hasInsufficientStock,
    isItemAllowed,
    getMpStatusBadge,
    getStatusBadge
  }
}
