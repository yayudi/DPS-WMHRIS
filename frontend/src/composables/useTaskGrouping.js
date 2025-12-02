// frontend/src/composables/useTaskGrouping.js
import { computed } from 'vue'

export function useTaskGrouping(itemsRef, filterStateRef) {
  const groupedTasks = computed(() => {
    const rawItems = itemsRef.value || []
    const filter = filterStateRef.value

    if (rawItems.length === 0) return []

    let filtered = rawItems

    // 1. FILTERING

    // A. Date Range
    if (filter.startDate || filter.endDate) {
      const start = filter.startDate
        ? new Date(filter.startDate + 'T00:00:00')
        : new Date('2000-01-01')
      const end = filter.endDate ? new Date(filter.endDate + 'T23:59:59') : new Date()
      filtered = filtered.filter((i) => {
        const d = new Date(i.order_date || i.created_at)
        return d >= start && d <= end
      })
    }

    // B. Source
    if (filter.source !== 'ALL') {
      filtered = filtered.filter((i) => i.source === filter.source)
    }

    // C. Search
    if (filter.search) {
      const q = filter.search.toLowerCase()
      filtered = filtered.filter(
        (i) =>
          (i.original_invoice_id || '').toLowerCase().includes(q) ||
          (i.sku || '').toLowerCase().includes(q) ||
          (i.product_name || '').toLowerCase().includes(q) ||
          (i.customer_name || '').toLowerCase().includes(q),
      )
    }

    // D. Stock Status (Logic berat dipindah kesini)
    if (filter.stockStatus !== 'ALL') {
      filtered = filtered.filter((i) => {
        const qty = Number(i.quantity || 0)
        const stock = Number(i.available_stock || 0)
        const hasLoc = !!i.location_code

        if (filter.stockStatus === 'READY') return hasLoc && stock >= qty
        if (filter.stockStatus === 'ISSUE') return hasLoc && stock < qty
        if (filter.stockStatus === 'EMPTY') return !hasLoc
        return true
      })
    }

    if (filtered.length === 0) return []

    // 2. GROUPING BY INVOICE & LOCATION
    const groups = new Map()

    filtered.forEach((item) => {
      // [FIX] Gunakan ID yang valid & fallback
      const invId = item.original_invoice_id || `MANUAL-${item.picking_list_id}`

      if (!groups.has(invId)) {
        groups.set(invId, {
          id: item.picking_list_id,
          invoice: invId,
          source: item.source || 'Unknown',
          customer_name: item.customer_name,
          status: item.status,
          marketplace_status: item.marketplace_status, // [FIX] Konsisten
          order_date: item.order_date,
          created_at: item.created_at,
          locations: {}, // Struktur Grouping Lokasi
        })
      }

      const group = groups.get(invId)
      const locKey = item.location_code || 'Unknown Loc'

      if (!group.locations[locKey]) {
        group.locations[locKey] = []
      }
      group.locations[locKey].push(item)
    })

    // 3. FLATTENING & SORTING
    const result = Array.from(groups.values())

    const sortKey = filter.sortBy
    result.sort((a, b) => {
      const dateA = new Date(a.created_at)
      const dateB = new Date(b.created_at)

      if (sortKey === 'oldest') return dateA - dateB
      // Default: Newest
      return dateB - dateA
    })

    return result
  })

  return { groupedTasks }
}
