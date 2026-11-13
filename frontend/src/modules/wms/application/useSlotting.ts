import { ref, reactive, computed } from 'vue'
import { slotApi } from '../infrastructure/slot.api'
import type { ProductLocationSlot, ProductLocationSlotLog } from '../domain/slot.entity'
import { useToast } from '@/core/presentation/composables/useToast'
import { useI18n } from '@/core/infrastructure/localization'

export function useSlotting() {
  const { toast } = useToast()
  const { t } = useI18n()

  const slots = ref<ProductLocationSlot[]>([])
  const logs = ref<ProductLocationSlotLog[]>([])
  const logsPagination = ref({
    page: 1,
    limit: 10,
    total: 0,
    totalPages: 1
  })

  const form = reactive({
    room: '',
    rack: '',
    tier: '',
    is_primary: false,
    notes: ''
  })

  const loading = ref(false)
  const loadingLogs = ref(false)
  const submitting = ref(false)

  const primarySlot = computed<ProductLocationSlot | null>(() => {
    return slots.value.find(s => s.is_primary) || slots.value[0] || null
  })

  const previewCoordinate = computed(() => {
    const room = form.room.trim().toUpperCase()
    const rack = form.rack.trim().toUpperCase()
    const tier = form.tier.trim().toUpperCase()

    if (!room && !rack) return '-'
    if (room && rack && tier) return `${room} - ${rack} - ${tier}`
    if (room && rack) return `${room} - ${rack}`
    if (room) return room
    return rack
  })

  const isFormValid = computed(() => {
    return form.room.trim().length > 0 && form.rack.trim().length > 0
  })

  function resetForm() {
    slots.value = []
    logs.value = []
    logsPagination.value = {
      page: 1,
      limit: 10,
      total: 0,
      totalPages: 1
    }
    form.room = ''
    form.rack = ''
    form.tier = ''
    form.is_primary = false
    form.notes = ''
  }

  async function fetchSlots(productId: number, locationId: number) {
    if (!productId || !locationId) return
    loading.value = true
    try {
      const res = await slotApi.getSlots(productId, locationId)
      slots.value = res.data || []
    } catch {
      slots.value = []
    } finally {
      loading.value = false
    }
  }

  async function fetchLogs(productId: number, locationId: number, page = 1) {
    if (!productId || !locationId) return
    loadingLogs.value = true
    try {
      const res = await slotApi.getSlotLogs(productId, locationId, page, logsPagination.value.limit)
      logs.value = res.data || []
      if (res.pagination) {
        logsPagination.value = {
          page: res.pagination.page,
          limit: res.pagination.limit,
          total: res.pagination.total,
          totalPages: res.pagination.total_pages
        }
      }
    } catch {
      logs.value = []
    } finally {
      loadingLogs.value = false
    }
  }

  async function addSlot(productId: number, locationId: number): Promise<boolean> {
    if (!isFormValid.value) {
      toast(t('wms.slotting.room_rack_required'), 'warning')
      return false
    }

    submitting.value = true
    try {
      const res = await slotApi.addSlot({
        product_id: productId,
        location_id: locationId,
        room: form.room.trim().toUpperCase(),
        rack: form.rack.trim().toUpperCase(),
        tier: form.tier.trim() ? form.tier.trim().toUpperCase() : null,
        is_primary: form.is_primary || slots.value.length === 0,
        notes: form.notes.trim() ? form.notes.trim() : null
      })

      if (res.success) {
        toast(res.message || t('common.status.success'), 'success')
        form.room = ''
        form.rack = ''
        form.tier = ''
        form.is_primary = false
        form.notes = ''
        await Promise.all([fetchSlots(productId, locationId), fetchLogs(productId, locationId, 1)])
        return true
      }

      toast(res.message || t('wms.slotting.add_error'), 'error')
      return false
    } catch (err: any) {
      toast(err?.response?.data?.message || err?.message || t('wms.slotting.system_error'), 'error')
      return false
    } finally {
      submitting.value = false
    }
  }

  async function removeSlot(productId: number, locationId: number, slotId: number, notes?: string): Promise<boolean> {
    try {
      const res = await slotApi.deleteSlot(slotId, notes)
      if (res.success) {
        toast(res.message || t('common.status.success'), 'success')
        await Promise.all([fetchSlots(productId, locationId), fetchLogs(productId, locationId, 1)])
        return true
      }
      toast(res.message || t('wms.slotting.delete_error'), 'error')
      return false
    } catch (err: any) {
      toast(err?.response?.data?.message || err?.message || t('wms.slotting.delete_coord_error'), 'error')
      return false
    }
  }

  async function setPrimary(productId: number, locationId: number, slotId: number): Promise<boolean> {
    try {
      const res = await slotApi.setPrimarySlot(productId, locationId, slotId)
      if (res.success) {
        toast(res.message || t('common.status.success'), 'success')
        await Promise.all([fetchSlots(productId, locationId), fetchLogs(productId, locationId, 1)])
        return true
      }
      toast(res.message || t('wms.slotting.set_primary_error'), 'error')
      return false
    } catch (err: any) {
      toast(err?.response?.data?.message || err?.message || t('wms.slotting.set_primary_error'), 'error')
      return false
    }
  }

  return {
    slots,
    primarySlot,
    logs,
    logsPagination,
    form,
    loading,
    loadingLogs,
    submitting,
    previewCoordinate,
    isFormValid,
    resetForm,
    fetchSlots,
    fetchLogs,
    addSlot,
    removeSlot,
    setPrimary
  }
}
