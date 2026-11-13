import { ref, computed, watch, type Ref } from 'vue'
import { useI18n } from '@/core/infrastructure/localization'

export interface TriStateValue {
  include: string[]
  exclude: string[]
}

export interface LocationHierarchyFilterState {
  purpose: TriStateValue
  building: TriStateValue
  floor?: TriStateValue
}

export interface RawLocationRecord {
  purpose?: string | null
  building?: string | null
  floor?: string | number | null
}

export interface UseLocationHierarchyFilterOptions {
  prefixFloorLabel?: boolean
}

export interface SelectOption<T = string> {
  label: string
  value: T
}

/**
 * Composable DRY untuk mengelola opsi filter bertingkat (Purpose -> Building -> Floor)
 * beserta cascade reset otomatis dan pelabelan lantai bilingual.
 */
export function useLocationHierarchyFilter<T extends LocationHierarchyFilterState>(
  filters: Ref<T>,
  options: UseLocationHierarchyFilterOptions = { prefixFloorLabel: true }
) {
  const { t } = useI18n()
  const uniquePurposes = ref<string[]>([])
  const uniqueBuildingsByPurpose = ref<Record<string, string[]>>({})
  const uniqueFloorsByBuilding = ref<Record<string, string[]>>({})
  const initialLoaded = ref(false)

  function hydrateFromLocations(locations: RawLocationRecord[]): void {
    if (initialLoaded.value) return
    const purposes = new Set<string>()
    const bMap: Record<string, Set<string>> = {}
    const fMap: Record<string, Set<string>> = {}

    for (const loc of locations) {
      const p = loc.purpose || 'N/A'
      purposes.add(p)
      if (!bMap[p]) bMap[p] = new Set<string>()
      if (loc.building) {
        bMap[p].add(loc.building)
        if (!fMap[loc.building]) fMap[loc.building] = new Set<string>()
        if (loc.floor !== undefined && loc.floor !== null && loc.floor !== '') {
          fMap[loc.building].add(String(loc.floor))
        }
      }
    }

    uniquePurposes.value = Array.from(purposes).sort()
    uniqueBuildingsByPurpose.value = Object.fromEntries(
      Object.entries(bMap).map(([k, v]) => [k, Array.from(v).sort()])
    )
    uniqueFloorsByBuilding.value = Object.fromEntries(
      Object.entries(fMap).map(([k, v]) => [k, Array.from(v).sort()])
    )
    initialLoaded.value = true
  }

  watch(
    () => filters.value.purpose,
    () => {
      filters.value.building = { include: [], exclude: [] }
      if (filters.value.floor) {
        filters.value.floor = { include: [], exclude: [] }
      }
    },
    { deep: true }
  )

  watch(
    () => filters.value.building,
    () => {
      if (filters.value.floor) {
        filters.value.floor = { include: [], exclude: [] }
      }
    },
    { deep: true }
  )

  const purposeOptions = computed<SelectOption<string>[]>(() =>
    uniquePurposes.value.map(p => ({ label: p, value: p }))
  )

  const availableBuildings = computed<string[]>(() => {
    const activePurposes = filters.value.purpose?.include || []
    if (!activePurposes.length) {
      const all = new Set<string>()
      Object.values(uniqueBuildingsByPurpose.value).forEach(buildings => {
        buildings.forEach(b => all.add(b))
      })
      return Array.from(all).sort()
    }

    const valid = new Set<string>()
    activePurposes.forEach(p => {
      const bds = uniqueBuildingsByPurpose.value[p] || []
      bds.forEach(b => valid.add(b))
    })
    return Array.from(valid).sort()
  })

  const buildingOptions = computed<SelectOption<string>[]>(() =>
    availableBuildings.value.map(b => ({ label: b, value: b }))
  )

  const availableFloors = computed<string[]>(() => {
    const activeBuildings = filters.value.building?.include || []
    const valid = new Set<string>()
    const sources =
      activeBuildings.length > 0
        ? activeBuildings.map(b => uniqueFloorsByBuilding.value[b] || [])
        : Object.values(uniqueFloorsByBuilding.value)

    for (const list of sources) {
      for (const f of list) valid.add(f)
    }
    return Array.from(valid).sort()
  })

  const floorOptions = computed<SelectOption<string>[]>(() =>
    availableFloors.value.map(f => ({
      label: options.prefixFloorLabel ? `${t('common.label.floor')} ${f}` : f,
      value: f
    }))
  )

  return {
    uniquePurposes,
    uniqueBuildingsByPurpose,
    uniqueFloorsByBuilding,
    initialLoaded,
    hydrateFromLocations,
    availableBuildings,
    availableFloors,
    purposeOptions,
    buildingOptions,
    floorOptions
  }
}

