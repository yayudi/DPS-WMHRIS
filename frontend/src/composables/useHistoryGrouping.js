// frontend/src/composables/useHistoryGrouping.js
import { computed } from 'vue'

export function useHistoryGrouping(itemsRef, filterStateRef, filterOptionsRef) {
  const groupedHistory = computed(() => {
    const rawItems = itemsRef.value || []
    const filter = filterStateRef.value
    let filtered = rawItems

    const hasTriState = fieldObj => fieldObj && (fieldObj.include?.length > 0 || fieldObj.exclude?.length > 0)

    if (hasTriState(filter.source)) {
      filtered = filtered.filter(i => {
        const val = i.source || 'Unknown'
        if (filter.source.exclude.includes(val)) return false
        if (filter.source.include.length > 0 && !filter.source.include.includes(val)) return false
        return true
      })
    }

    if (hasTriState(filter.locationPurpose)) {
      filtered = filtered.filter(i => {
        const val = i.location_purpose || 'DISPLAY'
        if (filter.locationPurpose.exclude.includes(val)) return false
        if (filter.locationPurpose.include.length > 0 && !filter.locationPurpose.include.includes(val)) return false
        return true
      })
    }

    if (filter.search) {
      const q = filter.search.toLowerCase()
      filtered = filtered.filter(
        i =>
          (i.original_invoice_id || '').toLowerCase().includes(q) ||
          (i.sku || '').toLowerCase().includes(q) ||
          (i.product_name || '').toLowerCase().includes(q) ||
          (i.customer_name || '').toLowerCase().includes(q) ||
          (i.shop_name || '').toLowerCase().includes(q)
      )
    }

    if (hasTriState(filter.shopName)) {
      filtered = filtered.filter(i => {
        const val = i.shop_name || 'Unknown'
        if (filter.shopName.exclude.includes(val)) return false
        if (filter.shopName.include.length > 0 && !filter.shopName.include.includes(val)) return false
        return true
      })
    }

    if (hasTriState(filter.courier)) {
      filtered = filtered.filter(i => {
        const val = i.expedition_id // could be null/undefined for older/offline orders
        if (filter.courier.exclude.includes(val)) return false
        if (filter.courier.include.length > 0 && !filter.courier.include.includes(val)) return false
        return true
      })
    }

    if (filter.isSameday && filter.isSameday !== 'All' && filterOptionsRef && filterOptionsRef.value?.expeditions) {
      const isSamedayTarget = filter.isSameday === 'true'
      const exps = filterOptionsRef.value.expeditions
      const targetExpIds = new Set(exps.filter(e => e.is_sameday === isSamedayTarget).map(e => e.id))

      filtered = filtered.filter(i => {
        if (!i.expedition_id) return true
        return targetExpIds.has(i.expedition_id)
      })
    }

    if (filter.startDate || filter.endDate) {
      const start = filter.startDate ? new Date(filter.startDate + 'T00:00:00') : new Date('2000-01-01')
      const end = filter.endDate ? new Date(filter.endDate + 'T23:59:59') : new Date('2100-12-31')

      filtered = filtered.filter(i => {
        const d = new Date(i.created_at || i.order_date)
        return d >= start && d <= end
      })
    }

    if (filtered.length === 0) return []

    const groups = new Map()

    filtered.forEach(item => {
      const rawId = item.original_invoice_id || `INV-MANUAL-${item.fulfilment_list_id}`
      const cleanId = rawId.includes('_REV_') ? rawId.split('_REV_')[0] : rawId

      if (!groups.has(cleanId)) {
        groups.set(cleanId, {
          invoice: cleanId,
          source: item.source,
          location_purpose: item.location_purpose,
          customer_name: item.customer_name,
          shop_name: item.shop_name,
          order_date: item.order_date,
          invoice_no: item.invoice_no,
          original_invoice_id: item.original_invoice_id,
          courier: item.courier,
          expedition_id: item.expedition_id,
          awb: item.awb,
          kelja_histories: item.kelja_histories ? JSON.parse(item.kelja_histories) : [],
          sessionsMap: new Map()
        })
      }

      const group = groups.get(cleanId)
      const listId = item.fulfilment_list_id

      if (!group.sessionsMap.has(listId)) {
        group.sessionsMap.set(listId, {
          id: listId,
          raw_invoice_id: rawId,
          status: item.status,
          marketplace_status: item.marketplace_status,
          created_at: item.created_at,
          total_items: 0,
          items: [],
          locations: {}
        })
      }

      const session = group.sessionsMap.get(listId)
      session.items.push(item)
      session.total_items += Number(item.quantity || 0)

      const locKey = item.location_code || 'Unknown Loc'
      if (!session.locations[locKey]) {
        session.locations[locKey] = []
      }
      session.locations[locKey].push(item)
    })

    const finalCards = Array.from(groups.values()).map(group => {
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
        invoice_no: group.invoice_no,
        original_invoice_id: group.original_invoice_id,
        courier: group.courier,
        expedition_id: group.expedition_id,
        awb: group.awb,
        kelja_histories: group.kelja_histories,
        historyLogs: historyLogs
      }
    })

    const sortKey = filter.sortBy
    return finalCards.sort((a, b) => {
      if (sortKey === 'oldest') return a.id - b.id
      if (sortKey === 'invoice_asc') return a.invoice.localeCompare(b.invoice)
      return b.id - a.id
    })
  })

  return { groupedHistory }
}
