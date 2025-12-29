import { computed } from 'vue'

export function useHistoryGrouping(itemsRef, filterStateRef) {
  const groupedHistory = computed(() => {
    const rawItems = itemsRef.value || []
    const filter = filterStateRef.value

    // --- 1. FILTERING ---
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
          // Check clean ID (without _REV_) or raw ID
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
      // Fix: Default End Date should be far future to include "Today's" items fully
      const end = filter.endDate ? new Date(filter.endDate + 'T23:59:59') : new Date('2100-12-31')

      filtered = filtered.filter((i) => {
        const d = new Date(i.order_date || i.created_at)
        return d >= start && d <= end
      })
    }

    if (filtered.length === 0) return []

    // --- 2. INTELLIGENT GROUPING (FIXED) ---
    const groups = new Map()

    filtered.forEach((item) => {
      const rawId = item.original_invoice_id || `INV-MANUAL-${item.picking_list_id}`

      // [CRITICAL FIX]: Deteksi & Hapus Suffix _REV_
      // Jika ID = "INV-100_REV_123", maka Clean ID = "INV-100"
      // Ini membuat Revisi dan Parent-nya masuk ke grup yang sama.
      const cleanId = rawId.includes('_REV_') ? rawId.split('_REV_')[0] : rawId

      if (!groups.has(cleanId)) {
        groups.set(cleanId, {
          invoice: cleanId, // Gunakan ID bersih untuk tampilan UI
          source: item.source,
          customer_name: item.customer_name,
          order_date: item.order_date,
          sessionsMap: new Map(), // Menampung Picking List ID yang berbeda (Revisi)
        })
      }

      const group = groups.get(cleanId)

      // Kita perlu ID unik untuk setiap sesi picking (biasanya picking_list_id)
      const listId = item.picking_list_id

      if (!group.sessionsMap.has(listId)) {
        group.sessionsMap.set(listId, {
          id: listId,
          // Simpan raw ID di dalam sesi jika perlu debug
          raw_invoice_id: rawId,
          status: item.status,
          marketplace_status: item.marketplace_status,
          created_at: item.created_at,
          total_items: 0,
          items: [],
        })
      }

      // Masukkan item ke sesi
      const session = group.sessionsMap.get(listId)
      session.items.push(item)
      session.total_items += Number(item.quantity || 0)
    })

    // --- 3. FLATTENING & IDENTIFYING MAIN vs HISTORY ---
    const finalCards = Array.from(groups.values()).map((group) => {
      // Urutkan sesi berdasarkan ID (Asumsi ID lebih besar = Paling Baru/Aktif)
      const sessions = Array.from(group.sessionsMap.values()).sort((a, b) => b.id - a.id)

      // Sesi paling atas adalah "Main Card"
      const latestSession = sessions[0]

      // Sisanya adalah "History Logs" (Revisi lama)
      const historyLogs = sessions.slice(1)

      return {
        ...latestSession, // Spread properties sesi terbaru (status, items, dll)

        // Timpa info header dari grup (konsisten)
        invoice: group.invoice,
        source: group.source,
        customer_name: group.customer_name,

        // Attach array history untuk dropdown di card
        historyLogs: historyLogs,
      }
    })

    // --- 4. FINAL SORTING ---
    const sortKey = filter.sortBy
    return finalCards.sort((a, b) => {
      if (sortKey === 'oldest') return a.id - b.id
      if (sortKey === 'invoice_asc') return a.invoice.localeCompare(b.invoice)
      return b.id - a.id // Default: Newest ID first
    })
  })

  return { groupedHistory }
}
