import { ref, computed, watch } from 'vue'
import { useToast } from '@/core/presentation/composables/useToast'
import { swalConfirm } from '@/core/presentation/composables/useSweetAlert'
import { wmsApi } from '../infrastructure/wms.api'
import { stockApi } from '../infrastructure/stock.api'
import type {
  OnHoldFulfillmentSummary,
  ReplenishmentDeficit,
  SuggestedReplenishmentSource,
  ManualTransferPayload
} from '../domain/replenishment.entity'
import type { StockLocation } from '../domain/stock.entity'

export type SlaUrgencyLevel = 'CRITICAL' | 'WARNING' | 'NORMAL'

export interface SlaInfo {
  remainingMinutes: number
  level: SlaUrgencyLevel
  formattedText: string
  isOverdue: boolean
}

// Module-level singleton state for reactive cross-component sync (e.g. Sidebar badge)
const fulfillments = ref<OnHoldFulfillmentSummary[]>([])
const allLocations = ref<StockLocation[]>([])
const loading = ref(false)
const releasingId = ref<number | null>(null)
const transferring = ref(false)
const selectedBuilding = ref('ALL')
const searchQuery = ref('')
const sortBy = ref<'SLA_URGENT' | 'NEWEST' | 'OLDEST'>('SLA_URGENT')
const soundEnabled = ref(false)

const isTransferModalOpen = ref(false)
const activeTransferContext = ref<{
  fulfillment: OnHoldFulfillmentSummary
  deficit: ReplenishmentDeficit
  source?: SuggestedReplenishmentSource
} | null>(null)

// 24 Hours default marketplace dispatch SLA
const SLA_LIMIT_MINUTES = 24 * 60

export function calculateSla(createdAtStr: string): SlaInfo {
  if (!createdAtStr) {
    return { remainingMinutes: SLA_LIMIT_MINUTES, level: 'NORMAL', formattedText: '> 6 Jam', isOverdue: false }
  }

  const createdTime = new Date(createdAtStr).getTime()
  const now = Date.now()
  const elapsedMinutes = Math.floor((now - createdTime) / (60 * 1000))
  const remainingMinutes = SLA_LIMIT_MINUTES - elapsedMinutes
  const isOverdue = remainingMinutes <= 0

  let level: SlaUrgencyLevel = 'NORMAL'
  if (remainingMinutes <= 120) {
    level = 'CRITICAL'
  } else if (remainingMinutes <= 360) {
    level = 'WARNING'
  }

  let formattedText = ''
  if (isOverdue) {
    const overdueMin = Math.abs(remainingMinutes)
    const hours = Math.floor(overdueMin / 60)
    const mins = overdueMin % 60
    formattedText = `Terlewat ${hours}j ${mins}m`
  } else {
    const hours = Math.floor(remainingMinutes / 60)
    const mins = remainingMinutes % 60
    formattedText = `Sisa ${hours}j ${mins}m`
  }

  return { remainingMinutes, level, formattedText, isOverdue }
}

export function playAudioAlert(type: 'critical' | 'success' = 'critical') {
  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext
    if (!AudioContextClass) return
    const ctx = new AudioContextClass()

    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain)
    gain.connect(ctx.destination)

    if (type === 'critical') {
      osc.type = 'triangle'
      osc.frequency.setValueAtTime(587.33, ctx.currentTime) // D5
      osc.frequency.setValueAtTime(880, ctx.currentTime + 0.1) // A5
      gain.gain.setValueAtTime(0.15, ctx.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.35)
      osc.start(ctx.currentTime)
      osc.stop(ctx.currentTime + 0.35)
    } else {
      osc.type = 'sine'
      osc.frequency.setValueAtTime(523.25, ctx.currentTime) // C5
      osc.frequency.setValueAtTime(659.25, ctx.currentTime + 0.1) // E5
      gain.gain.setValueAtTime(0.12, ctx.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3)
      osc.start(ctx.currentTime)
      osc.stop(ctx.currentTime + 0.3)
    }
  } catch {
    // Ignore audio permission or playback restrictions
  }
}

export function useReplenishment() {
  const { toast } = useToast()

  async function loadOnHoldFulfillments() {
    loading.value = true
    try {
      const data = await wmsApi.fetchOnHoldFulfillments(
        selectedBuilding.value === 'ALL' ? undefined : selectedBuilding.value
      )
      const previousCount = fulfillments.value.length
      fulfillments.value = data

      // Play soft sound if new orders arrived and sound is enabled
      if (soundEnabled.value && data.length > previousCount) {
        playAudioAlert('critical')
      }
    } catch (err: any) {
      toast(err.message || 'Gagal memuat antrean replenishment', 'error')
    } finally {
      loading.value = false
    }
  }

  async function loadLocations() {
    try {
      const locs = await stockApi.fetchAllLocations()
      allLocations.value = locs
    } catch (err: any) {
      console.error('Failed to load locations for replenishment:', err)
    }
  }

  function openQuickTransfer(
    fulfillment: OnHoldFulfillmentSummary,
    deficit: ReplenishmentDeficit,
    source?: SuggestedReplenishmentSource
  ) {
    activeTransferContext.value = { fulfillment, deficit, source }
    isTransferModalOpen.value = true
  }

  function closeQuickTransfer() {
    isTransferModalOpen.value = false
    activeTransferContext.value = null
  }

  async function submitQuickTransfer(payload: ManualTransferPayload): Promise<boolean> {
    transferring.value = true
    try {
      await wmsApi.transferStock(payload)
      toast('Transfer stok ke lantai DISPLAY berhasil dilakukan', 'success')
      if (soundEnabled.value) {
        playAudioAlert('success')
      }
      closeQuickTransfer()
      await Promise.all([loadOnHoldFulfillments(), loadLocations()])
      return true
    } catch (err: any) {
      toast(err.message || 'Gagal memproses transfer stok', 'error')
      return false
    } finally {
      transferring.value = false
    }
  }

  async function releaseFulfillment(fulfillment: OnHoldFulfillmentSummary) {
    const isConfirmed = await swalConfirm(
      `Apakah Anda yakin stok fisik untuk pesanan ${fulfillment.reference_id} telah tersedia di lantai DISPLAY?`
    )
    if (!isConfirmed) return

    releasingId.value = fulfillment.transaction_id
    try {
      await wmsApi.releaseHeldFulfillment(fulfillment.transaction_id)
      toast(
        `Pesanan ${fulfillment.reference_id} berhasil dirilis & dialokasikan ke lantai DISPLAY!`,
        'success'
      )
      if (soundEnabled.value) {
        playAudioAlert('success')
      }
      fulfillments.value = fulfillments.value.filter(
        f => f.transaction_id !== fulfillment.transaction_id
      )
    } catch (err: any) {
      toast(err.message || 'Gagal merilis pesanan. Pastikan stok DISPLAY mencukupi.', 'error')
    } finally {
      releasingId.value = null
    }
  }

  const filteredFulfillments = computed(() => {
    let list = [...fulfillments.value]

    if (selectedBuilding.value !== 'ALL') {
      list = list.filter(f => f.assigned_building === selectedBuilding.value)
    }

    const q = searchQuery.value.trim().toLowerCase()
    if (q) {
      list = list.filter(f => {
        const matchOrder =
          f.reference_id.toLowerCase().includes(q) ||
          f.transaction_no.toLowerCase().includes(q) ||
          f.assigned_building.toLowerCase().includes(q)
        if (matchOrder) return true

        return f.deficits.some(d =>
          d.sku.toLowerCase().includes(q) ||
          d.product_name.toLowerCase().includes(q)
        )
      })
    }

    // Apply sorting
    if (sortBy.value === 'SLA_URGENT') {
      list.sort((a, b) => {
        const slaA = calculateSla(a.created_at).remainingMinutes
        const slaB = calculateSla(b.created_at).remainingMinutes
        return slaA - slaB // Shortest remaining time first
      })
    } else if (sortBy.value === 'NEWEST') {
      list.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    } else if (sortBy.value === 'OLDEST') {
      list.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
    }

    return list
  })

  const availableBuildings = computed(() => {
    const set = new Set<string>()
    fulfillments.value.forEach(f => {
      if (f.assigned_building) set.add(f.assigned_building)
    })
    allLocations.value.forEach(l => {
      if (l.building) set.add(l.building)
    })
    return Array.from(set).sort()
  })

  const onHoldCount = computed(() => fulfillments.value.length)

  const currentPage = ref(1)
  const pageSize = ref(10)

  watch([searchQuery, selectedBuilding, sortBy], () => {
    currentPage.value = 1
  })

  function setPage(page: number) {
    currentPage.value = page
  }

  function setPageSize(size: number) {
    pageSize.value = size
    currentPage.value = 1
  }

  const pagination = computed(() => {
    const total = filteredFulfillments.value.length
    const totalPages = Math.max(1, Math.ceil(total / pageSize.value))
    return {
      page: currentPage.value,
      limit: pageSize.value,
      total,
      totalPages
    }
  })

  const paginatedFulfillments = computed(() => {
    const start = (currentPage.value - 1) * pageSize.value
    return filteredFulfillments.value.slice(start, start + pageSize.value)
  })

  const stats = computed(() => {
    const total = fulfillments.value.length
    let holdCount = 0
    let oosCount = 0
    let criticalCount = 0
    let totalDeficitUnits = 0

    fulfillments.value.forEach(f => {
      if (f.status === 'HOLD_REPLENISHMENT') {
        holdCount++
      } else if (f.status === 'OUT_OF_STOCK') {
        oosCount++
      }

      const sla = calculateSla(f.created_at)
      if (sla.level === 'CRITICAL') {
        criticalCount++
      }

      f.deficits.forEach(d => {
        totalDeficitUnits += d.deficit_quantity
      })
    })

    return {
      total,
      holdCount,
      oosCount,
      criticalCount,
      totalDeficitUnits
    }
  })

  return {
    fulfillments,
    filteredFulfillments,
    allLocations,
    loading,
    releasingId,
    transferring,
    selectedBuilding,
    availableBuildings,
    searchQuery,
    sortBy,
    soundEnabled,
    isTransferModalOpen,
    activeTransferContext,
    onHoldCount,
    currentPage,
    pageSize,
    pagination,
    paginatedFulfillments,
    setPage,
    setPageSize,
    stats,
    loadOnHoldFulfillments,
    loadLocations,
    openQuickTransfer,
    closeQuickTransfer,
    submitQuickTransfer,
    releaseFulfillment,
    calculateSla
  }
}
