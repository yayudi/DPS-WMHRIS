import { describe, it, expect } from 'vitest'
import {
  formatCurrency,
  formatNumber,
  formatTags,
  formatFileName,
  getDynamicColorClass,
  getLocationPurposeColorClass,
  getLocationBuildingColorClass
} from './formatters'

describe('formatters utility', () => {
  describe('getDynamicColorClass (djb2 hash calculation)', () => {
    it('returns fallback color for null, undefined, or empty label', () => {
      const fallback = 'bg-secondary/10 text-text/60 ring-secondary/20'
      expect(getDynamicColorClass(null)).toBe(fallback)
      expect(getDynamicColorClass(undefined)).toBe(fallback)
      expect(getDynamicColorClass('')).toBe(fallback)
      expect(getDynamicColorClass('   ')).toBe(fallback)
    })

    it('returns a valid Tailwind palette class for 1-character labels without NaN bug', () => {
      const resultA = getDynamicColorClass('A')
      const resultB = getDynamicColorClass('B')

      expect(resultA).toBeDefined()
      expect(resultA).not.toBe('undefined')
      expect(resultA).toMatch(/^bg-.* text-.* ring-.*/)

      expect(resultB).toBeDefined()
      expect(resultB).not.toBe('undefined')
      expect(resultB).toMatch(/^bg-.* text-.* ring-.*/)
    })

    it('returns a valid Tailwind palette class for 2-character labels', () => {
      const result12 = getDynamicColorClass('12')
      const resultAB = getDynamicColorClass('AB')

      expect(result12).toBeDefined()
      expect(result12).not.toBe('undefined')
      expect(result12).toMatch(/^bg-.* text-.* ring-.*/)

      expect(resultAB).toBeDefined()
      expect(resultAB).not.toBe('undefined')
    })

    it('produces deterministic output for repeated calls with same input', () => {
      const label = 'Gedung Utama Warehouse'
      const first = getDynamicColorClass(label)
      const second = getDynamicColorClass(label)
      expect(first).toBe(second)
    })

    it('works correctly via getLocationPurposeColorClass and getLocationBuildingColorClass', () => {
      const purposeClass = getLocationPurposeColorClass('storage')
      const buildingClass = getLocationBuildingColorClass('A')

      expect(purposeClass).toBeDefined()
      expect(buildingClass).toBeDefined()
      expect(purposeClass).not.toBe('undefined')
      expect(buildingClass).not.toBe('undefined')
    })
  })

  describe('formatCurrency', () => {
    it('returns "-" for null, undefined, or empty string', () => {
      expect(formatCurrency(null)).toBe('-')
      expect(formatCurrency(undefined)).toBe('-')
      expect(formatCurrency('')).toBe('-')
    })

    it('formats numbers into Indonesian Rupiah format', () => {
      const formatted = formatCurrency(50000)
      // Intl format on id-ID usually returns "Rp 50.000" or with non-breaking space
      expect(formatted).toMatch(/Rp\s*50\.000/)
    })

    it('returns original input if NaN string is passed', () => {
      expect(formatCurrency('invalid_num')).toBe('invalid_num')
    })
  })

  describe('formatNumber', () => {
    it('returns "-" for null, undefined, or empty string', () => {
      expect(formatNumber(null)).toBe('-')
      expect(formatNumber(undefined)).toBe('-')
      expect(formatNumber('')).toBe('-')
    })

    it('formats numeric values with thousands separator', () => {
      expect(formatNumber(1000000)).toBe('1.000.000')
      expect(formatNumber(0)).toBe('0')
    })
  })

  describe('formatTags', () => {
    it('handles empty or null values', () => {
      expect(formatTags(null)).toEqual([])
      expect(formatTags('')).toEqual([])
    })

    it('returns array as is', () => {
      expect(formatTags(['tag1', 'tag2'])).toEqual(['tag1', 'tag2'])
    })

    it('parses JSON string array', () => {
      expect(formatTags('["electronics", "fragile"]')).toEqual(['electronics', 'fragile'])
    })

    it('falls back to comma-separated splitting', () => {
      expect(formatTags('shoes, apparel, sale')).toEqual(['shoes', 'apparel', 'sale'])
    })
  })

  describe('formatFileName', () => {
    it('returns fallback when filePath is falsy', () => {
      expect(formatFileName(null, 'EXPORT')).toBe('Memproses file...')
    })

    it('strips 13-digit timestamp prefix if present', () => {
      const result = formatFileName('downloads/1788406595673-stock_report.xlsx', 'STOCK_REPORT')
      expect(result).toBe('stock_report.xlsx')
    })
  })
})

