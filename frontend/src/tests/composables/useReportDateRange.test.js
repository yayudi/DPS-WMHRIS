import { describe, it, expect } from 'vitest'
import { useReportDateRange } from '@/composables/useReportDateRange.js'

describe('useReportDateRange composable', () => {
  it('initializes with default monthly values and extra filters', () => {
    const { filterValues, availableYears } = useReportDateRange({
      searchQuery: 'test-query',
      categories: [1, 2]
    })

    const currentYear = new Date().getFullYear()
    expect(filterValues.value.reportType).toBe('monthly')
    expect(filterValues.value.year).toBe(currentYear)
    expect(filterValues.value.searchQuery).toBe('test-query')
    expect(filterValues.value.categories).toEqual([1, 2])
    expect(availableYears.value).toContain(currentYear)
    expect(availableYears.value.length).toBe(7)
  })

  it('generates correct payload for annual reportType', () => {
    const { filterValues, getDatePayload } = useReportDateRange()
    filterValues.value.reportType = 'annual'
    filterValues.value.year = 2026

    const payload = getDatePayload()
    expect(payload.startDate).toBe('2026-01-01')
    expect(payload.endDate).toBe('2026-12-31')
    expect(payload.timeResolution).toBe('monthly')

    const compPayload = getDatePayload({ withComparison: true })
    expect(compPayload.prevStartDate).toBe('2025-01-01')
    expect(compPayload.prevEndDate).toBe('2025-12-31')
  })

  it('generates correct payload for monthly reportType', () => {
    const { filterValues, getDatePayload } = useReportDateRange()
    filterValues.value.reportType = 'monthly'
    filterValues.value.year = 2026
    filterValues.value.selectedMonth = '04'

    const payload = getDatePayload()
    expect(payload.startDate).toBe('2026-04-01')
    expect(payload.endDate).toBe('2026-04-30')
    expect(payload.timeResolution).toBe('daily')

    const compPayload = getDatePayload({ withComparison: true })
    expect(compPayload.prevStartDate).toBe('2026-03-01')
    expect(compPayload.prevEndDate).toBe('2026-03-31')
  })

  it('generates correct payload for custom reportType with comparison', () => {
    const { filterValues, getDatePayload } = useReportDateRange()
    filterValues.value.reportType = 'custom'
    filterValues.value.startDate = '2026-06-10'
    filterValues.value.endDate = '2026-06-20'

    const payload = getDatePayload({ withComparison: true })
    expect(payload.startDate).toBe('2026-06-10')
    expect(payload.endDate).toBe('2026-06-20')
    expect(payload.timeResolution).toBe('daily')
    expect(payload.prevEndDate).toBe('2026-06-09')
    expect(payload.prevStartDate).toBe('2026-05-30')
  })

  it('generates dynamic filter schema for different report types', () => {
    const { filterValues, getDateFilterSchema } = useReportDateRange()

    // Monthly
    filterValues.value.reportType = 'monthly'
    const monthlySchema = getDateFilterSchema()
    expect(monthlySchema).toHaveLength(2)
    expect(monthlySchema[0].key).toBe('selectedMonth')
    expect(monthlySchema[1].key).toBe('year')

    // Annual
    filterValues.value.reportType = 'annual'
    const annualSchema = getDateFilterSchema()
    expect(annualSchema).toHaveLength(1)
    expect(annualSchema[0].key).toBe('year')

    // Custom
    filterValues.value.reportType = 'custom'
    const customSchema = getDateFilterSchema()
    expect(customSchema).toHaveLength(1)
    expect(customSchema[0].type).toBe('daterange')
  })

  it('resets date filters to default without erasing extra fields', () => {
    const { filterValues, resetDateFilters } = useReportDateRange({ customField: 'retained' })
    filterValues.value.reportType = 'annual'
    filterValues.value.year = 2020

    resetDateFilters()
    expect(filterValues.value.reportType).toBe('monthly')
    expect(filterValues.value.year).toBe(new Date().getFullYear())
    expect(filterValues.value.customField).toBe('retained')
  })
})
