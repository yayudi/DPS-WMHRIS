export interface FilterOptions {
  include: string[];
  exclude: string[];
}

/**
 * Helper to check if a location matches the building/floor filters
 */
export const matchesFilters = (loc: any, selectedBuilding: FilterOptions, selectedFloor: FilterOptions): boolean => {
  let buildingMatch = true
  if (selectedBuilding.include.length > 0) {
    if (loc.building) {
      buildingMatch = selectedBuilding.include.includes(loc.building)
    } else if (loc.location_code) {
      buildingMatch = selectedBuilding.include.some((b: string) => loc.location_code.startsWith(b))
    }
  } else if (selectedBuilding.exclude.length > 0) {
    if (loc.building) {
      buildingMatch = !selectedBuilding.exclude.includes(loc.building)
    } else if (loc.location_code) {
      buildingMatch = !selectedBuilding.exclude.some((b: string) => loc.location_code.startsWith(b))
    }
  }

  let floorMatch = true
  if (selectedFloor.include.length > 0) {
    if (loc.floor !== undefined && loc.floor !== null) {
      floorMatch = selectedFloor.include.includes(String(loc.floor))
    }
  } else if (selectedFloor.exclude.length > 0) {
    if (loc.floor !== undefined && loc.floor !== null) {
      floorMatch = !selectedFloor.exclude.includes(String(loc.floor))
    }
  }

  return buildingMatch && floorMatch
}

export interface SlotSummary {
  id: number
  room: string
  rack: string
  tier: string
  formatted_coordinate: string
  is_primary: boolean
}

/** Minimal shape of a stock location needed for display helpers. */
export interface LocationLike {
  location_id?: number
  location_code: string
  quantity: number
  purpose?: string
  building?: string
  floor?: string | number
  slots?: SlotSummary[]
}

const PURPOSE_BY_VIEW: Record<string, string> = {
  gudang: 'WAREHOUSE',
  pajangan: 'DISPLAY',
  ltc: 'BRANCH'
}

/**
 * Narrows locations to the active WMS view tab ('all' keeps everything, unknown views yield nothing).
 */
export const filterLocationsByView = <T extends LocationLike>(locations: T[], view: string): T[] => {
  if (view === 'all') return locations
  const purpose = PURPOSE_BY_VIEW[view]
  if (!purpose) return []
  return locations.filter(loc => loc.purpose === purpose)
}

/**
 * Joins location codes for display. By default, locations with quantity 0 are skipped;
 * negative quantities are kept on purpose because they signal a data anomaly users must see.
 */
export const joinLocationCodes = (locations: LocationLike[], hideEmpty = true): string =>
  locations
    .filter(loc => !hideEmpty || loc.quantity !== 0)
    .map(loc => loc.location_code)
    .join(', ')

/**
 * Transforms an API product object, calculating stocks based on location purpose and filters
 */
export const transformProduct = (apiProduct: any, selectedBuilding: FilterOptions, selectedFloor: FilterOptions): any => {
  const locations = apiProduct.stock_locations || []

  const filteredLocations = locations.filter((loc: any) => matchesFilters(loc, selectedBuilding, selectedFloor))

  const pajanganLocations = filteredLocations.filter((loc: any) => loc.purpose === 'DISPLAY')
  const stockPajangan = pajanganLocations.reduce((sum: number, loc: any) => sum + loc.quantity, 0)
  const lokasiPajangan = pajanganLocations.map((loc: any) => loc.location_code).join(', ')

  const gudangLocations = filteredLocations.filter((loc: any) => loc.purpose === 'WAREHOUSE')
  const stockGudang = gudangLocations.reduce((sum: number, loc: any) => sum + loc.quantity, 0)
  const lokasiGudang = gudangLocations.map((loc: any) => loc.location_code).join(', ')

  const ltcLocation = filteredLocations.find((loc: any) => loc.purpose === 'BRANCH')
  const stockLTC = ltcLocation ? ltcLocation.quantity : 0
  const lokasiLTC = ltcLocation ? ltcLocation.location_code : 'N/A'

  const filteredTotalStock = filteredLocations.reduce((sum: number, loc: any) => sum + loc.quantity, 0)
  const filteredAllLocationsCode = filteredLocations.map((loc: any) => loc.location_code).join(', ')

  return {
    id: apiProduct.id,
    sku: apiProduct.sku,
    name: apiProduct.name,
    price: apiProduct.price,
    weight: apiProduct.weight,
    length: apiProduct.length,
    width: apiProduct.width,
    height: apiProduct.height,
    total_cbm: apiProduct.total_cbm,
    is_package: Boolean(apiProduct.is_package),
    category_name: apiProduct.category_name || null,
    thumbnail_path: apiProduct.thumbnail_path,
    image_path: apiProduct.image_path,

    stockPajangan,
    lokasiPajangan,
    pajanganLocations,
    stockGudang,
    lokasiGudang,
    gudangLocations,
    stockLTC,
    lokasiLTC,
    totalStock: filteredTotalStock,
    allLocationsCode: filteredAllLocationsCode,
    stock_locations: filteredLocations,
    components: apiProduct.components || [] // Pass components for virtual stock calc
  }
}
