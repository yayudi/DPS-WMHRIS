// frontend/src/composables/useTaskGrouping.js
import { computed } from 'vue'

export function useTaskGrouping(itemsRef, filterStateRef) {
  const groupedTasks = computed(() => {
    const rawItems = itemsRef.value || []
    const filter = filterStateRef.value

    if (rawItems.length === 0) return []

    let filtered = rawItems

    if (filter.startDate || filter.endDate) {
      const start = filter.startDate ? new Date(filter.startDate + 'T00:00:00') : new Date('2000-01-01')

      const end = filter.endDate ? new Date(filter.endDate + 'T23:59:59') : new Date('2100-12-31')

      filtered = filtered.filter(i => {
        const d = new Date(i.created_at || i.order_date)
        return d >= start && d <= end
      })
    }

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
        const val = i.courier || 'Unknown'
        if (filter.courier.exclude.includes(val)) return false
        if (filter.courier.include.length > 0 && !filter.courier.include.includes(val)) return false
        return true
      })
    }

    if (hasTriState(filter.courier)) {
      filtered = filtered.filter(i => {
        const val = i.courier || 'Unknown'
        if (filter.courier.exclude.includes(val)) return false
        if (filter.courier.include.length > 0 && !filter.courier.include.includes(val)) return false
        return true
      })
    }

    if (filter.productName) {
      const q = filter.productName.toLowerCase()
      filtered = filtered.filter(i => (i.product_name || '').toLowerCase().includes(q))
    }

    if (filter.role && filter.role !== 'All') {
      filtered = filtered.filter(i => {
        const s = i.status || ''
        if (filter.role === 'Picker') return s === 'NEW' || s === 'ON_PICKING'
        if (filter.role === 'Packer') return s === 'PICKED' || s === 'ON_PACKING'
        if (filter.role === 'Shipper') return s === 'PACKED' || s === 'ON_SHIPPING'
        return true
      })
    }

    if (filter.sourceType && filter.sourceType !== 'All') {
      filtered = filtered.filter(i => {
        const src = i.source || 'Unknown'
        const isOffline = src.toLowerCase() === 'offline' || src.toLowerCase() === 'manual'
        if (filter.sourceType === 'Offline') return isOffline
        if (filter.sourceType === 'Online') return !isOffline
        return true
      })
    }

    if (hasTriState(filter.stockStatus)) {
      filtered = filtered.filter(i => {
        const qty = Number(i.quantity || 0)
        const stock = Number(i.available_stock || 0)
        const hasLoc = !!i.location_code

        let statusObj = 'READY'
        if (!hasLoc || i.status === 'BACKORDER') statusObj = 'EMPTY'
        else if (stock < qty) statusObj = 'ISSUE'

        if (filter.stockStatus.exclude.includes(statusObj)) return false
        if (filter.stockStatus.include.length > 0 && !filter.stockStatus.include.includes(statusObj)) return false
        return true
      })
    }

    if (filtered.length === 0) return []

    const groups = new Map()

    filtered.forEach(item => {
      const invId = item.original_invoice_id || `MANUAL-${item.fulfilment_list_id}`

      if (!groups.has(invId)) {
        groups.set(invId, {
          id: item.fulfilment_list_id,
          fulfilment_list_id: item.fulfilment_list_id,
          invoice: invId,
          invoice_no: item.invoice_no,
          original_invoice_id: item.original_invoice_id,
          source: item.source || 'Unknown',
          location_purpose: item.location_purpose,
          customer_name: item.customer_name,
          shop_name: item.shop_name,
          courier: item.courier,
          expedition_id: item.expedition_id,
          awb: item.awb,
          kelja_histories: item.kelja_histories ? JSON.parse(item.kelja_histories) : [],
          status: item.status,
          marketplace_status: item.marketplace_status,
          order_date: item.order_date,
          created_at: item.created_at,
          locations: {}
        })
      }

      const group = groups.get(invId)
      const locKey = item.location_code || 'Unknown Loc'

      if (!group.locations[locKey]) {
        group.locations[locKey] = []
      }
      group.locations[locKey].push(item)
    })

    const result = Array.from(groups.values())

    const sortKey = filter.sortBy
    result.sort((a, b) => {
      const dateA = new Date(a.created_at)
      const dateB = new Date(b.created_at)

      if (sortKey === 'oldest') return dateA - dateB
      return dateB - dateA
    })

    return result
  })

  return { groupedTasks }
}
