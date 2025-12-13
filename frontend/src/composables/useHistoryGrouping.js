// frontend/src/composables/useHistoryGrouping.js
import { computed } from 'vue'

export function useHistoryGrouping(itemsRef, filterStateRef) {
  const groupedHistory = computed(() => {
    const rawItems = itemsRef.value || []
    const filter = filterStateRef.value

    // FILTERING
    let filtered = rawItems

    // Filter Source
    if (filter.source !== 'ALL') {
      filtered = filtered.filter((i) => i.source === filter.source)
    }

    // Filter Search
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

    // Filter Date Range
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

    if (filtered.length === 0) return []

    // GROUPING BY INVOICE ID
    const groups = new Map()

    filtered.forEach((item) => {
      // Pastikan Invoice ID selalu ada, jika null pakai picking_list_id
      const invId = item.original_invoice_id || `INV-MANUAL-${item.picking_list_id}`

      if (!groups.has(invId)) {
        groups.set(invId, {
          invoice: invId, // Property ini yang dibaca PickingListCard
          source: item.source,
          customer_name: item.customer_name,
          order_date: item.order_date,
          sessionsMap: new Map(),
        })
      }

      const group = groups.get(invId)
      const listId = item.picking_list_id

      if (!group.sessionsMap.has(listId)) {
        group.sessionsMap.set(listId, {
          id: listId,
          status: item.status,
          marketplace_status: item.marketplace_status,
          created_at: item.created_at,
          total_items: 0,
          items: [],
        })
      }

      // Masukkan item ke sesi
      const session = group.sessionsMap.get(listId)
      session.items.push(item) // Push raw item (ada sku, qty, status)
      session.total_items += Number(item.quantity || 0) // Hitung total qty manual
    })

    // FLATTENING & SORTING SESSIONS
    const finalCards = Array.from(groups.values()).map((group) => {
      const sessions = Array.from(group.sessionsMap.values()).sort((a, b) => b.id - a.id)

      const latestSession = sessions[0]
      const historyLogs = sessions.slice(1) // Versi lama (jika ada revisi)

      return {
        ...latestSession, // id, status, items, dll
        invoice: group.invoice, // Pastikan ini ter-set!
        source: group.source,
        customer_name: group.customer_name,
        historyLogs: historyLogs,
      }
    })

    // FINAL SORTING
    const sortKey = filter.sortBy
    return finalCards.sort((a, b) => {
      if (sortKey === 'oldest') return a.id - b.id
      if (sortKey === 'invoice_asc') return a.invoice.localeCompare(b.invoice)
      return b.id - a.id // Default: Newest
    })
  })

  return { groupedHistory }
}
