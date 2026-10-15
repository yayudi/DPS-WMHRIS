// frontend/src/composables/useHistoryGrouping.js
import { computed } from 'vue'

export function useHistoryGrouping(itemsRef, filterStateRef) {
  const groupedHistory = computed(() => {
    const rawItems = itemsRef.value || []
    const filter = filterStateRef.value
    let filtered = rawItems

    const hasTriState = (fieldObj) => fieldObj && (fieldObj.include?.length > 0 || fieldObj.exclude?.length > 0)

    if (hasTriState(filter.source)) {
      filtered = filtered.filter((i) => {
        const val = i.source || 'Unknown'
        if (filter.source.exclude.includes(val)) return false
        if (filter.source.include.length > 0 && !filter.source.include.includes(val)) return false
        return true
      })
    }

    if (hasTriState(filter.locationPurpose)) {
      filtered = filtered.filter((i) => {
        const val = i.location_purpose || 'DISPLAY'
        if (filter.locationPurpose.exclude.includes(val)) return false
        if (filter.locationPurpose.include.length > 0 && !filter.locationPurpose.include.includes(val)) return false
        return true
      })
    }

    if (filter.search) {
      const q = filter.search.toLowerCase()
      filtered = filtered.filter(
        (i) =>
          (i.original_invoice_id || '').toLowerCase().includes(q) ||
          (i.sku || '').toLowerCase().includes(q) ||
          (i.product_name || '').toLowerCase().includes(q) ||
          (i.customer_name || '').toLowerCase().includes(q) ||
          (i.shop_name || '').toLowerCase().includes(q),
      )
    }

    if (hasTriState(filter.shopName)) {
      filtered = filtered.filter((i) => {
        const val = i.shop_name || 'Unknown'
        if (filter.shopName.exclude.includes(val)) return false
        if (filter.shopName.include.length > 0 && !filter.shopName.include.includes(val)) return false
        return true
      })
    }

    if (hasTriState(filter.stockStatus)) {
      filtered = filtered.filter((i) => {
        const val = (i.status || '').toUpperCase()
        if (filter.stockStatus.exclude.some((ex) => ex.toUpperCase() === val)) return false
        if (
          filter.stockStatus.include.length > 0 &&
          !filter.stockStatus.include.some((inc) => inc.toUpperCase() === val)
        )
          return false
        return true
      })
    }
    if (filter.startDate || filter.endDate) {
      const start = filter.startDate
        ? new Date(filter.startDate + 'T00:00:00')
        : new Date('2000-01-01')
      const end = filter.endDate ? new Date(filter.endDate + 'T23:59:59') : new Date('2100-12-31')

      filtered = filtered.filter((i) => {
        const d = new Date(i.created_at || i.order_date)
        return d >= start && d <= end
      })
    }

    if (filtered.length === 0) return []

    const groups = new Map()

    filtered.forEach((item) => {
      const rawId = item.original_invoice_id || `INV-MANUAL-${item.picking_list_id}`
      const cleanId = rawId.includes('_REV_') ? rawId.split('_REV_')[0] : rawId

      if (!groups.has(cleanId)) {
        groups.set(cleanId, {
          invoice: cleanId,
          source: item.source,
          location_purpose: item.location_purpose,
          customer_name: item.customer_name,
          shop_name: item.shop_name,
          order_date: item.order_date,
          sessionsMap: new Map(),
        })
      }

      const group = groups.get(cleanId)
      const listId = item.picking_list_id

      if (!group.sessionsMap.has(listId)) {
        group.sessionsMap.set(listId, {
          id: listId,
          raw_invoice_id: rawId,
          status: item.status,
          marketplace_status: item.marketplace_status,
          created_at: item.created_at,
          total_items: 0,
          items: [],
        })
      }

      const session = group.sessionsMap.get(listId)
      session.items.push(item)
      session.total_items += Number(item.quantity || 0)
    })

    const finalCards = Array.from(groups.values()).map((group) => {
      const sessions = Array.from(group.sessionsMap.values()).sort((a, b) => b.id - a.id)
      const latestSession = sessions[0]
      const historyLogs = sessions.slice(1)

      return {
        ...latestSession,
        invoice: group.invoice,
        source: group.source,
        location_purpose: group.location_purpose,
        customer_name: group.customer_name,
        shop_name: group.shop_name,
        historyLogs: historyLogs,
      }
    })

    const sortKey = filter.sortBy
    return finalCards.sort((a, b) => {
      const dateA = new Date(a.created_at).getTime() || a.id
      const dateB = new Date(b.created_at).getTime() || b.id
      if (sortKey === 'oldest') return dateA - dateB
      return dateB - dateA
    })
  })

  return { groupedHistory }
}
