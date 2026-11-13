import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { ref, nextTick } from 'vue'
import { useLocationHierarchyFilter, type LocationHierarchyFilterState, type RawLocationRecord } from './useLocationHierarchyFilter'
import { useAnalyticsFilterOptions } from './useAnalyticsFilterOptions'
import { useLocaleStore } from '@/core/presentation/stores/localeStore'

describe('useLocationHierarchyFilter & useAnalyticsFilterOptions', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    const store = useLocaleStore()
    store.dictionary = {
      'common.filter.all': 'Semua',
      'common.label.floor': 'Lantai',
      'analytics.inventory.opt_single': 'Tunggal',
      'analytics.inventory.opt_package': 'Paket',
      'analytics.export.status_positive': 'Positif',
      'analytics.movement.status_negative_short': 'Minus',
      'common.time.last_7_days': '7 Hari Terakhir',
      'common.time.last_30_days': '30 Hari Terakhir',
      'common.time.this_month': 'Bulan Ini'
    }
  })

  describe('useLocationHierarchyFilter', () => {
    it('hydrates unique purposes, buildings, and floors from raw location records', () => {
      const filters = ref<LocationHierarchyFilterState>({
        purpose: { include: [], exclude: [] },
        building: { include: [], exclude: [] },
        floor: { include: [], exclude: [] }
      })

      const hierarchy = useLocationHierarchyFilter(filters)

      const mockLocations: RawLocationRecord[] = [
        { purpose: 'Storage', building: 'Gedung A', floor: '1' },
        { purpose: 'Storage', building: 'Gedung A', floor: '2' },
        { purpose: 'Picking', building: 'Gedung B', floor: '1' }
      ]

      hierarchy.hydrateFromLocations(mockLocations)

      expect(hierarchy.uniquePurposes.value).toEqual(['Picking', 'Storage'])
      expect(hierarchy.purposeOptions.value).toEqual([
        { label: 'Picking', value: 'Picking' },
        { label: 'Storage', value: 'Storage' }
      ])
      expect(hierarchy.buildingOptions.value).toEqual([
        { label: 'Gedung A', value: 'Gedung A' },
        { label: 'Gedung B', value: 'Gedung B' }
      ])
    })

    it('filters building options based on selected purpose', async () => {
      const filters = ref<LocationHierarchyFilterState>({
        purpose: { include: ['Storage'], exclude: [] },
        building: { include: [], exclude: [] },
        floor: { include: [], exclude: [] }
      })

      const hierarchy = useLocationHierarchyFilter(filters)
      hierarchy.hydrateFromLocations([
        { purpose: 'Storage', building: 'Gedung A', floor: '1' },
        { purpose: 'Picking', building: 'Gedung B', floor: '1' }
      ])

      expect(hierarchy.buildingOptions.value).toEqual([
        { label: 'Gedung A', value: 'Gedung A' }
      ])
    })

    it('cascades resets when purpose or building changes', async () => {
      const filters = ref<LocationHierarchyFilterState>({
        purpose: { include: ['Storage'], exclude: [] },
        building: { include: ['Gedung A'], exclude: [] },
        floor: { include: ['1'], exclude: [] }
      })

      useLocationHierarchyFilter(filters)

      // Changing purpose resets building & floor
      filters.value.purpose = { include: ['Picking'], exclude: [] }
      await nextTick()
      expect(filters.value.building).toEqual({ include: [], exclude: [] })
      expect(filters.value.floor).toEqual({ include: [], exclude: [] })

      // Changing building resets floor
      filters.value.building = { include: ['Gedung B'], exclude: [] }
      filters.value.floor = { include: ['2'], exclude: [] }
      await nextTick()
      filters.value.building = { include: ['Gedung C'], exclude: [] }
      await nextTick()
      expect(filters.value.floor).toEqual({ include: [], exclude: [] })
    })

    it('formats floor label with prefix or plain number based on options', () => {
      const filters = ref<LocationHierarchyFilterState>({
        purpose: { include: [], exclude: [] },
        building: { include: ['Gedung A'], exclude: [] },
        floor: { include: [], exclude: [] }
      })

      const withPrefix = useLocationHierarchyFilter(filters, { prefixFloorLabel: true })
      withPrefix.hydrateFromLocations([{ purpose: 'Storage', building: 'Gedung A', floor: '3' }])
      expect(withPrefix.floorOptions.value).toEqual([{ label: 'Lantai 3', value: '3' }])

      const withoutPrefix = useLocationHierarchyFilter(filters, { prefixFloorLabel: false })
      withoutPrefix.hydrateFromLocations([{ purpose: 'Storage', building: 'Gedung A', floor: '3' }])
      expect(withoutPrefix.floorOptions.value).toEqual([{ label: '3', value: '3' }])
    })
  })

  describe('useAnalyticsFilterOptions', () => {
    it('provides localized options for product type, stock status, and period presets', () => {
      const { productTypeOptions, stockStatusOptions, periodPresetOptions } = useAnalyticsFilterOptions()

      expect(productTypeOptions.value).toHaveLength(3)
      expect(productTypeOptions.value[0].label).toBe('Semua')
      expect(productTypeOptions.value[1].label).toBe('Tunggal')
      expect(productTypeOptions.value[2].label).toBe('Paket')

      expect(stockStatusOptions.value).toHaveLength(3)
      expect(stockStatusOptions.value[1].label).toBe('Positif')
      expect(stockStatusOptions.value[2].label).toBe('Minus')

      expect(periodPresetOptions.value).toEqual([
        { id: '7d', name: '7 Hari Terakhir' },
        { id: '30d', name: '30 Hari Terakhir' },
        { id: 'month', name: 'Bulan Ini' }
      ])
    })
  })
})

