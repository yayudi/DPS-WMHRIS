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
    group.issueFlag = 'UNKNOWN'
  })

  return Object.values(grouped)
}

export function useInvestigationLogic() {
  return {
    formatDate,
    groupTransactionsBySku
  }
}
