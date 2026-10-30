import { describe, it, expect } from 'vitest'
import { serializeFilterParams, isTriStateFilter } from './filterParams'

describe('filterParams utility', () => {
  describe('isTriStateFilter', () => {
    it('returns true for objects with include or exclude arrays', () => {
      expect(isTriStateFilter({ include: ['A'], exclude: [] })).toBe(true)
      expect(isTriStateFilter({ exclude: ['B'] })).toBe(true)
      expect(isTriStateFilter({ include: [] })).toBe(true)
    })

    it('returns false for primitives, null, undefined, or arrays', () => {
      expect(isTriStateFilter(null)).toBe(false)
      expect(isTriStateFilter(undefined)).toBe(false)
      expect(isTriStateFilter('string')).toBe(false)
      expect(isTriStateFilter(123)).toBe(false)
      expect(isTriStateFilter(['A', 'B'])).toBe(false)
      expect(isTriStateFilter({ search: 'test' })).toBe(false)
    })
  })

  describe('serializeFilterParams', () => {
    it('serializes active TriState filters into JSON string', () => {
      const input = {
        status: { include: ['IN_STOCK'], exclude: ['OUT_OF_STOCK'] },
        building: { include: ['Gedung A'], exclude: [] },
      }

      const result = serializeFilterParams(input)

      expect(result.status).toBe(JSON.stringify({ include: ['IN_STOCK'], exclude: ['OUT_OF_STOCK'] }))
      expect(result.building).toBe(JSON.stringify({ include: ['Gedung A'], exclude: [] }))
    })

    it('omits empty TriState filters', () => {
      const input = {
        status: { include: [], exclude: [] },
        searchQuery: 'laptop',
      }

      const result = serializeFilterParams(input)

      expect(result.status).toBeUndefined()
      expect(result.searchQuery).toBe('laptop')
    })

    it('preserves primitive values and non-empty arrays', () => {
      const input = {
        page: 1,
        limit: 50,
        startDate: '2026-01-01',
        tags: ['sale', 'promo'],
      }

      const result = serializeFilterParams(input)

      expect(result.page).toBe(1)
      expect(result.limit).toBe(50)
      expect(result.startDate).toBe('2026-01-01')
      expect(result.tags).toEqual(['sale', 'promo'])
    })

    it('strips empty strings, null, and undefined values', () => {
      const input = {
        name: '',
        desc: null,
        notes: undefined,
        emptyArr: [],
      }

      const result = serializeFilterParams(input)

      expect(Object.keys(result)).toHaveLength(0)
    })
  })
})

