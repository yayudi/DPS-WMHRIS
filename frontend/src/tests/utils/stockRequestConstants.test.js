import { describe, it, expect } from 'vitest'
import {
  STOCK_REQUEST_STATUS,
  STOCK_REQUEST_TYPE,
  STOCK_REQUEST_FILTER_OPTIONS,
  getStockRequestBadgeClass
} from '@/utils/stockRequestConstants.js'

describe('stockRequestConstants utility', () => {
  it('defines valid statuses and types', () => {
    expect(STOCK_REQUEST_STATUS.PENDING).toBe('PENDING')
    expect(STOCK_REQUEST_STATUS.APPROVED).toBe('APPROVED')
    expect(STOCK_REQUEST_STATUS.SHIPPED).toBe('SHIPPED')
    expect(STOCK_REQUEST_STATUS.COMPLETED).toBe('COMPLETED')
    expect(STOCK_REQUEST_STATUS.REJECTED).toBe('REJECTED')

    expect(STOCK_REQUEST_TYPE.TRANSFER).toBe('TRANSFER')
    expect(STOCK_REQUEST_TYPE.STOCK_OPNAME).toBe('STOCK_OPNAME')
  })

  it('defines filter options starting with ALL', () => {
    expect(STOCK_REQUEST_FILTER_OPTIONS).toEqual([
      'ALL',
      'PENDING',
      'APPROVED',
      'SHIPPED',
      'COMPLETED',
      'REJECTED'
    ])
  })

  it('returns corresponding Tailwind classes for each status', () => {
    expect(getStockRequestBadgeClass('PENDING')).toContain('text-warning')
    expect(getStockRequestBadgeClass('APPROVED')).toContain('text-primary')
    expect(getStockRequestBadgeClass('SHIPPED')).toContain('text-accent')
    expect(getStockRequestBadgeClass('REJECTED')).toContain('text-danger')
    expect(getStockRequestBadgeClass('COMPLETED')).toContain('text-success')
    expect(getStockRequestBadgeClass('UNKNOWN')).toContain('text-text')
    expect(getStockRequestBadgeClass(null)).toContain('text-text')
  })
})
