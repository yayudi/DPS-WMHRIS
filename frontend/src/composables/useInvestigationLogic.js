// Helper for formatting date
export const formatDate = dateStr => {
  if (!dateStr) return '-'
  const d = new Date(dateStr)
  return d.toLocaleString('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  })
}

// Helper to extract Fulfilment Item ID from notes
export const extractItemId = notes => {
  if (!notes) return '-'
  const match = notes.match(/Item\s*#(\d+)/i)
  return match ? match[1] : '-'
}

// Helper to group transactions by SKU for the inner table
export const groupTransactionsBySku = transactions => {
  if (!transactions) return []
  const grouped = {}
  transactions.forEach(trx => {
    const key = trx.productId || trx.sku || 'Unknown'
    if (!grouped[key]) {
      grouped[key] = {
        sku: trx.sku || 'No SKU',
        productName: trx.productName || 'Unknown Product',
        records: []
      }
    }
    grouped[key].records.push(trx)
  })

  // Calculate issue flags
  Object.values(grouped).forEach(group => {
    const itemIds = new Set()
    let hasValidItemIds = false
    group.records.forEach(trx => {
      const id = extractItemId(trx.notes)
      if (id !== '-') {
        itemIds.add(id)
        hasValidItemIds = true
      }
    })

    if (hasValidItemIds) {
      if (itemIds.size === 1) {
        group.issueFlag = 'WORKER_DOUBLE'
      } else {
        group.issueFlag = 'CART_BUG'
      }
    } else {
      group.issueFlag = 'UNKNOWN'
    }
  })

  return Object.values(grouped)
}

export function useInvestigationLogic() {
  return {
    formatDate,
    extractItemId,
    groupTransactionsBySku
  }
}
