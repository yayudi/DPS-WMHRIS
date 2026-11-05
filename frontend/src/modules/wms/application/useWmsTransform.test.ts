import { describe, it, expect } from 'vitest'
import { transformProduct, filterLocationsByView, joinLocationCodes, type LocationLike } from './useWmsTransform'

const noFilter = { include: [], exclude: [] }

const locations: (LocationLike & { location_id: number })[] = [
  { location_id: 101, location_code: 'B16 - 1', purpose: 'WAREHOUSE', quantity: 10 },
  { location_id: 102, location_code: 'B16 - 3', purpose: 'WAREHOUSE', quantity: 20 },
  { location_id: 103, location_code: 'OASIS - 4', purpose: 'WAREHOUSE', quantity: 0 },
  { location_id: 104, location_code: 'DISP - 1', purpose: 'DISPLAY', quantity: 0 },
  { location_id: 105, location_code: 'DISP - 2', purpose: 'DISPLAY', quantity: -2 },
  { location_id: 106, location_code: 'LTC - 1', purpose: 'BRANCH', quantity: 5 }
]

describe('transformProduct', () => {
  it('keeps every location intact (zero-stock hiding is a display option, not a data concern)', () => {
    const result = transformProduct({ id: 1, sku: 'S', name: 'N', stock_locations: locations }, noFilter, noFilter)

    expect(result.stock_locations).toHaveLength(locations.length)
    expect(result.allLocationsCode).toBe('B16 - 1, B16 - 3, OASIS - 4, DISP - 1, DISP - 2, LTC - 1')
    expect(result.lokasiGudang).toBe('B16 - 1, B16 - 3, OASIS - 4')
    expect(result.totalStock).toBe(33)
  })

  it('preserves slots array on transformed stock locations', () => {
    const locsWithSlots: LocationLike[] = [
      {
        location_id: 201,
        location_code: 'B16 - 1',
        quantity: 10,
        purpose: 'WAREHOUSE',
        slots: [
          {
            id: 1,
            room: 'R.UTAMA',
            rack: 'B-01',
            tier: 'T1',
            formatted_coordinate: 'R.UTAMA - B-01 - T1',
            is_primary: true
          },
          {
            id: 2,
            room: 'R.UTAMA',
            rack: 'B-02',
            tier: '',
            formatted_coordinate: 'R.UTAMA - B-02',
            is_primary: false
          }
        ]
      }
    ]
    const result = transformProduct({ id: 1, sku: 'S', name: 'N', stock_locations: locsWithSlots }, noFilter, noFilter)
    expect(result.stock_locations[0].location_id).toBe(201)
    expect(result.stock_locations[0].slots).toHaveLength(2)
    expect(result.stock_locations[0].slots[0].formatted_coordinate).toBe('R.UTAMA - B-01 - T1')
    expect(result.stock_locations[0].slots[0].is_primary).toBe(true)
    expect(result.stock_locations[0].slots[1].formatted_coordinate).toBe('R.UTAMA - B-02')
    expect(result.stock_locations[0].slots[1].is_primary).toBe(false)
  })
})

describe('filterLocationsByView', () => {
  it('returns everything for the "all" view', () => {
    expect(filterLocationsByView(locations, 'all')).toHaveLength(locations.length)
  })

  it('narrows by purpose for gudang, pajangan and ltc', () => {
    expect(filterLocationsByView(locations, 'gudang').map(l => l.location_code)).toEqual([
      'B16 - 1',
      'B16 - 3',
      'OASIS - 4'
    ])
    expect(filterLocationsByView(locations, 'pajangan').map(l => l.location_code)).toEqual(['DISP - 1', 'DISP - 2'])
    expect(filterLocationsByView(locations, 'ltc').map(l => l.location_code)).toEqual(['LTC - 1'])
  })

  it('returns nothing for an unknown view', () => {
    expect(filterLocationsByView(locations, 'unknown')).toEqual([])
  })
})

describe('joinLocationCodes', () => {
  it('keeps zero-stock locations when hideEmpty is explicitly false', () => {
    expect(joinLocationCodes(filterLocationsByView(locations, 'gudang'), false)).toBe('B16 - 1, B16 - 3, OASIS - 4')
  })

  it('skips zero-stock locations by default', () => {
    expect(joinLocationCodes(filterLocationsByView(locations, 'gudang'))).toBe('B16 - 1, B16 - 3')
  })

  it('skips zero-stock locations when hideEmpty is true', () => {
    expect(joinLocationCodes(filterLocationsByView(locations, 'gudang'), true)).toBe('B16 - 1, B16 - 3')
  })

  it('keeps negative-stock locations visible because they signal an anomaly', () => {
    expect(joinLocationCodes(filterLocationsByView(locations, 'pajangan'), true)).toBe('DISP - 2')
  })

  it('returns an empty string when nothing remains', () => {
    const allZero: LocationLike[] = [{ location_code: 'X', purpose: 'WAREHOUSE', quantity: 0 }]
    expect(joinLocationCodes(allZero, true)).toBe('')
  })
})
