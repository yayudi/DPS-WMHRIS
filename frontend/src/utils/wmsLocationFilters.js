// frontend/src/utils/wmsLocationFilters.js

/**
 * Pemetaan tab lokasi WMS (`activeView`) ke `location.purpose` di database.
 * `all` tidak dipetakan (artinya semua purpose).
 */
export const VIEW_PURPOSE_MAP = Object.freeze({
  gudang: 'WAREHOUSE',
  pajangan: 'DISPLAY',
  ltc: 'BRANCH'
})

/**
 * Menyaring daftar lokasi berdasarkan tab aktif (purpose).
 * @param {Array<{building?: string|null, floor?: string|number|null, purpose?: string|null}>} locations
 * @param {string} activeView - 'all' | 'gudang' | 'pajangan' | 'ltc'
 * @returns {Array<Object>}
 */
export const filterLocationsByView = (locations, activeView) => {
  const list = Array.isArray(locations) ? locations : []
  const purpose = VIEW_PURPOSE_MAP[activeView]
  if (!purpose) return list
  return list.filter(loc => loc.purpose === purpose)
}

/**
 * Opsi filter Gedung (unik, terurut) mengikuti purpose pada tab aktif.
 * @param {Array<Object>} locations
 * @param {string} activeView
 * @returns {Array<{label: string, value: string}>}
 */
export const getBuildingOptions = (locations, activeView) => {
  const buildings = new Set()
  for (const loc of filterLocationsByView(locations, activeView)) {
    const building = typeof loc.building === 'string' ? loc.building.trim() : ''
    if (building) buildings.add(building)
  }
  return Array.from(buildings)
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
    .map(b => ({ label: b, value: b }))
}

/**
 * Opsi filter Lantai (unik, terurut) mengikuti purpose tab aktif dan filter Gedung terpilih.
 * Lantai bergantung pada Gedung: tanpa Gedung terpilih (include/exclude kosong) hasilnya kosong.
 * @param {Array<Object>} locations
 * @param {string} activeView
 * @param {{include?: string[], exclude?: string[]}} [selectedBuilding]
 * @returns {Array<{label: string, value: string}>}
 */
export const getFloorOptions = (locations, activeView, selectedBuilding = {}) => {
  const include = selectedBuilding?.include || []
  const exclude = selectedBuilding?.exclude || []
  if (include.length === 0 && exclude.length === 0) return []

  const floors = new Set()

  for (const loc of filterLocationsByView(locations, activeView)) {
    if (loc.floor === null || loc.floor === undefined || String(loc.floor).trim() === '') continue
    if (include.length > 0) {
      if (!include.includes(loc.building)) continue
    } else if (exclude.length > 0 && exclude.includes(loc.building)) {
      continue
    }
    floors.add(String(loc.floor).trim())
  }

  return Array.from(floors)
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
    .map(f => ({ label: f, value: f }))
}
