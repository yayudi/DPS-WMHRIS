import { describe, it, expect } from 'vitest'
import {
  VIEW_PURPOSE_MAP,
  filterLocationsByView,
  getBuildingOptions,
  getFloorOptions
} from '@/utils/wmsLocationFilters.js'

const locations = [
  { id: 1, code: 'A19-1-01', building: 'A19', floor: 1, purpose: 'WAREHOUSE' },
  { id: 2, code: 'A19-2-01', building: 'A19', floor: 2, purpose: 'WAREHOUSE' },
  { id: 3, code: 'A20-1-01', building: 'A20', floor: '1', purpose: 'WAREHOUSE' },
  { id: 4, code: 'B16-3-01', building: 'B16', floor: 3, purpose: 'WAREHOUSE' },
  { id: 5, code: 'OASIS-D1', building: 'OASIS', floor: 1, purpose: 'DISPLAY' },
  { id: 6, code: 'LTC-01', building: 'LTC', floor: null, purpose: 'BRANCH' },
  { id: 7, code: 'X', building: '', floor: 9, purpose: 'WAREHOUSE' },
  { id: 8, code: 'Y', building: null, floor: undefined, purpose: 'DISPLAY' }
]

describe('wmsLocationFilters', () => {
  it('maps views to purposes', () => {
    expect(VIEW_PURPOSE_MAP.gudang).toBe('WAREHOUSE')
    expect(VIEW_PURPOSE_MAP.pajangan).toBe('DISPLAY')
    expect(VIEW_PURPOSE_MAP.ltc).toBe('BRANCH')
    expect(VIEW_PURPOSE_MAP.all).toBeUndefined()
  })

  it('filterLocationsByView returns all for "all" and filtered for others', () => {
    expect(filterLocationsByView(locations, 'all')).toHaveLength(locations.length)
    expect(filterLocationsByView(locations, 'gudang').every(l => l.purpose === 'WAREHOUSE')).toBe(true)
    expect(filterLocationsByView(null, 'gudang')).toEqual([])
  })

  it('getBuildingOptions is unique, sorted, ignores empty and follows purpose', () => {
    expect(getBuildingOptions(locations, 'gudang')).toEqual([
      { label: 'A19', value: 'A19' },
      { label: 'A20', value: 'A20' },
      { label: 'B16', value: 'B16' }
    ])
    expect(getBuildingOptions(locations, 'pajangan')).toEqual([{ label: 'OASIS', value: 'OASIS' }])
    expect(getBuildingOptions(locations, 'ltc')).toEqual([{ label: 'LTC', value: 'LTC' }])
    expect(getBuildingOptions(locations, 'all').map(o => o.value)).toEqual(['A19', 'A20', 'B16', 'LTC', 'OASIS'])
    expect(getBuildingOptions([], 'all')).toEqual([])
  })

  it('getFloorOptions is empty without selected building, then follows purpose and building include/exclude', () => {
    expect(getFloorOptions(locations, 'gudang')).toEqual([])
    expect(getFloorOptions(locations, 'gudang', { include: [], exclude: [] })).toEqual([])
    expect(getFloorOptions(locations, 'gudang', { include: ['A19'], exclude: [] }).map(o => o.value)).toEqual([
      '1',
      '2'
    ])
    expect(getFloorOptions(locations, 'gudang', { include: ['A19', 'B16'], exclude: [] }).map(o => o.value)).toEqual([
      '1',
      '2',
      '3'
    ])
    expect(getFloorOptions(locations, 'gudang', { include: [], exclude: ['A19', 'A20'] }).map(o => o.value)).toEqual([
      '3',
      '9'
    ])
    expect(getFloorOptions(locations, 'ltc', { include: ['LTC'], exclude: [] })).toEqual([])
  })
})
