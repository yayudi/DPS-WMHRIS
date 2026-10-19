import { describe, it, expect } from 'vitest'
import {
  SOURCE_OPTIONS,
  SALES_CHANNEL_OPTIONS,
  RETURN_SOURCE_OPTIONS,
  ANALYTICS_SOURCE_OPTIONS,
  PLATFORM_OPTIONS,
  PURPOSE_OPTIONS,
  getSourceBadgeClass
} from '@/utils/channelConstants.js'

describe('channelConstants utility', () => {
  it('defines SOURCE_OPTIONS with Offline, Tokopedia, and Shopee', () => {
    expect(SOURCE_OPTIONS).toHaveLength(3)
    expect(SOURCE_OPTIONS.map((o) => o.value)).toEqual(['Offline', 'Tokopedia', 'Shopee'])
    expect(SALES_CHANNEL_OPTIONS).toBe(SOURCE_OPTIONS)
  })

  it('defines RETURN_SOURCE_OPTIONS and ANALYTICS_SOURCE_OPTIONS', () => {
    expect(RETURN_SOURCE_OPTIONS).toHaveLength(3)
    expect(RETURN_SOURCE_OPTIONS.map((o) => o.id)).toEqual(['tokopedia', 'shopee', 'manual'])
    expect(ANALYTICS_SOURCE_OPTIONS).toHaveLength(3)
    expect(ANALYTICS_SOURCE_OPTIONS.map((o) => o.id)).toEqual(['Tokopedia', 'Shopee', 'Offline'])
  })

  it('defines PLATFORM_OPTIONS with 4 supported platforms', () => {
    expect(PLATFORM_OPTIONS).toHaveLength(4)
    expect(PLATFORM_OPTIONS).toContain('Shopee')
    expect(PLATFORM_OPTIONS).toContain('Tokopedia')
    expect(PLATFORM_OPTIONS).toContain('Offline')
    expect(PLATFORM_OPTIONS).toContain('Lainnya')
  })

  it('defines PURPOSE_OPTIONS with DISPLAY and BRANCH', () => {
    expect(PURPOSE_OPTIONS).toHaveLength(2)
    expect(PURPOSE_OPTIONS[0].id).toBe('DISPLAY')
    expect(PURPOSE_OPTIONS[1].id).toBe('BRANCH')
  })

  describe('getSourceBadgeClass', () => {
    it('returns brand colors for standard channels', () => {
      expect(getSourceBadgeClass('Tokopedia')).toContain('#00AA5B')
      expect(getSourceBadgeClass('Shopee')).toContain('#EE4D2D')
      expect(getSourceBadgeClass('Offline')).toContain('bg-secondary')
    })

    it('supports border styling variant', () => {
      const cls = getSourceBadgeClass('tokopedia', { border: true })
      expect(cls).toContain('border-success')
      expect(cls).toContain('text-success')
    })

    it('supports solid styling variant', () => {
      expect(getSourceBadgeClass('tokopedia', { solid: true })).toBe('bg-success')
      expect(getSourceBadgeClass('shopee', { solid: true })).toBe('bg-warning')
      expect(getSourceBadgeClass('other', { solid: true })).toBe('bg-secondary')
    })

    it('handles manual and system sources gracefully', () => {
      expect(getSourceBadgeClass('manual')).toContain('bg-primary')
      expect(getSourceBadgeClass('system')).toContain('bg-accent')
    })
  })
})
