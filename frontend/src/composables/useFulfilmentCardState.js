import { computed } from 'vue'

export function useFulfilmentCardState(props, authStore) {
  const totalSKU = computed(() => {
    if (props.mode === 'history' && props.inv.items) {
      return props.inv.items.length
    }
    let count = 0
    if (props.inv.locations) {
      Object.values(props.inv.locations).forEach(items => {
        count += items.length
      })
    }
    return count
  })

  const hasStockIssue = computed(() => {
    if (props.mode === 'history' || !props.inv.locations) return false
    for (const locName in props.inv.locations) {
      for (const item of props.inv.locations[locName]) {
        if (
          item.status === 'BACKORDER' ||
          !item.location_code ||
          Number(item.available_stock || 0) < Number(item.quantity || 0)
        )
          return true
      }
    }
    return false
  })

  const canCancel = computed(() => {
    if (props.mode === 'fulfilment') {
      return hasStockIssue.value && authStore.hasPermission('fulfilment_list.void')
    }
    return authStore.hasPermission('fulfilment_list.void')
  })

  const canProcess = computed(() => {
    return authStore.hasPermission('fulfilment_list.confirm')
  })

  const canForceComplete = computed(() => {
    return authStore.hasPermission('fulfilment_list.void')
  })

  function hasInsufficientStock(item) {
    if (props.mode === 'history') return false
    if (item.status === 'BACKORDER' || !item.location_code) return true
    const available = Number(item.available_stock || 0)
    const needed = Number(item.quantity || 0)
    return available < needed
  }

  function getMpStatusBadge(status) {
    const map = {
      SHIPPED: {
        class: 'text-primary bg-primary/10 border-primary/20',
        label: 'Dikirim',
        icon: 'fa-truck-fast'
      },
      COMPLETED: {
        class: 'text-success bg-success/10 border-success/20',
        label: 'Selesai',
        icon: 'fa-check-double'
      },
      NEW: { class: 'text-accent bg-accent/10 border-accent/20', label: 'Baru', icon: 'fa-star' },
      CANCELLED: {
        class: 'text-danger bg-danger/10 border-danger/20',
        label: 'Batal',
        icon: 'fa-ban'
      },
      RETURNED: {
        class: 'text-warning bg-warning/10 border-warning/20',
        label: 'Retur',
        icon: 'fa-rotate-left'
      }
    }
    return (
      map[status] || {
        class: 'text-secondary bg-secondary/10 border-secondary/20',
        label: status || '-',
        icon: 'fa-info'
      }
    )
  }

  function getStatusBadge(status) {
    const map = {
      VALIDATED: { class: 'text-success bg-success/5 border-success/20', label: 'Dipick', icon: 'fa-check' },
      COMPLETED: { class: 'text-success bg-success/5 border-success/20', label: 'Selesai', icon: 'fa-check-double' },
      RETURNED: { class: 'text-danger bg-danger/5 border-danger/20', label: 'Retur', icon: 'fa-rotate-left' },
      CANCEL: { class: 'text-secondary bg-secondary/5 border-secondary/20', label: 'Batal', icon: 'fa-ban' },
      PENDING: { class: 'text-warning bg-warning/5 border-warning/20', label: 'Pending', icon: 'fa-hourglass-start' },
      PICKED: { class: 'text-primary bg-primary/5 border-primary/20', label: 'Dipick', icon: 'fa-box-open' },
      PACKED: { class: 'text-success bg-success/5 border-success/20', label: 'Dipack', icon: 'fa-box' },
      DONE: { class: 'text-success bg-success/5 border-success/20', label: 'Selesai', icon: 'fa-truck-fast' },
      'READY TO PICK': {
        class: 'text-warning bg-warning/5 border-warning/20',
        label: 'Siap Dipick',
        icon: 'fa-hourglass-start'
      },
      'READY TO CHECK': {
        class: 'text-warning bg-warning/5 border-warning/20',
        label: 'Siap Dipick',
        icon: 'fa-hourglass-start'
      },
      'READY TO PACK': {
        class: 'text-primary bg-primary/5 border-primary/20',
        label: 'Siap Dikemas',
        icon: 'fa-box-open'
      },
      'READY TO SHIP': { class: 'text-success bg-success/5 border-success/20', label: 'Siap Dikirim', icon: 'fa-box' },
      'ON DELIVERY': {
        class: 'text-success bg-success/5 border-success/20',
        label: 'Sedang Dikirim',
        icon: 'fa-truck-fast'
      }
    }
    return (
      map[status] || {
        class: 'text-secondary bg-secondary/5 border-secondary/20',
        label: status || '-',
        icon: 'fa-info'
      }
    )
  }

  return {
    totalSKU,
    hasStockIssue,
    canCancel,
    canProcess,
    canForceComplete,
    hasInsufficientStock,
    getMpStatusBadge,
    getStatusBadge
  }
}
