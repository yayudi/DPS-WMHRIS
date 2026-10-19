import { describe, it, expect } from 'vitest'
import dayjs from 'dayjs'
import {
  formatDate,
  formatCurrency,
  formatNumber,
  formatTags,
  getDefaultMonthRange,
  MONTH_OPTIONS,
  SHORT_MONTH_NAMES,
  getCurrentMonth,
  getMonthLabel,
  WEEK_DAYS,
  SHORT_WEEK_DAYS,
  getDayLabel,
  formatWorkDaysLabel,
  formatTimeAgo,
  timeToMinutes,
  minutesToTime
} from '@/utils/formatters.js'

describe('formatters utility', () => {
  describe('formatDate', () => {
    it('returns "-" when date is null, undefined, or empty', () => {
      expect(formatDate(null)).toBe('-')
      expect(formatDate(undefined)).toBe('-')
      expect(formatDate('')).toBe('-')
    })

    it('returns "-" when date is invalid string', () => {
      expect(formatDate('invalid-date-string')).toBe('-')
    })

    it('formats date with default format "DD MMM YYYY, HH:mm"', () => {
      const formatted = formatDate('2026-10-16T15:30:00')
      expect(formatted).toBe('16 Oct 2026, 15:30')
    })

    it('formats date with custom format string', () => {
      const formatted = formatDate('2026-10-16T15:30:00', 'YYYY-MM-DD')
      expect(formatted).toBe('2026-10-16')
    })
  })

  describe('formatCurrency & formatNumber', () => {
    it('formats currency correctly', () => {
      expect(formatCurrency(null)).toBe('-')
      expect(formatCurrency(50000)).toContain('50.000')
    })

    it('formats numbers correctly', () => {
      expect(formatNumber(null)).toBe('-')
      expect(formatNumber(1250000)).toBe('1.250.000')
    })
  })

  describe('formatTags', () => {
    it('parses comma-separated and JSON tags', () => {
      expect(formatTags('tag1, tag2')).toEqual(['tag1', 'tag2'])
      expect(formatTags('["tagA", "tagB"]')).toEqual(['tagA', 'tagB'])
      expect(formatTags(null)).toEqual([])
    })
  })

  describe('getDefaultMonthRange', () => {
    it('returns start and end of current month by default', () => {
      const range = getDefaultMonthRange()
      expect(range.startDate).toBe(dayjs().startOf('month').format('YYYY-MM-DD'))
      expect(range.endDate).toBe(dayjs().endOf('month').format('YYYY-MM-DD'))
    })

    it('returns start of month to today when endToday option is true', () => {
      const range = getDefaultMonthRange({ endToday: true })
      expect(range.startDate).toBe(dayjs().startOf('month').format('YYYY-MM-DD'))
      expect(range.endDate).toBe(dayjs().format('YYYY-MM-DD'))
    })

    it('calculates month range for a specific past date', () => {
      const range = getDefaultMonthRange('2025-02-15')
      expect(range.startDate).toBe('2025-02-01')
      expect(range.endDate).toBe('2025-02-28')
    })

    it('supports custom date formatting', () => {
      const range = getDefaultMonthRange('2025-02-15', { format: 'DD/MM/YYYY' })
      expect(range.startDate).toBe('01/02/2025')
      expect(range.endDate).toBe('28/02/2025')
    })
  })

  describe('MONTH_OPTIONS & month helpers', () => {
    it('has 12 months with value and label', () => {
      expect(MONTH_OPTIONS).toHaveLength(12)
      expect(MONTH_OPTIONS[0]).toEqual({ value: '01', label: 'Januari' })
      expect(MONTH_OPTIONS[11]).toEqual({ value: '12', label: 'Desember' })
      expect(SHORT_MONTH_NAMES).toHaveLength(12)
      expect(SHORT_MONTH_NAMES[0]).toBe('Jan')
      expect(SHORT_MONTH_NAMES[7]).toBe('Agu')
      expect(SHORT_MONTH_NAMES[11]).toBe('Des')
    })

    it('getCurrentMonth returns 2-digit month string', () => {
      expect(getCurrentMonth('2026-05-20')).toBe('05')
      expect(getCurrentMonth(new Date('2026-11-01'))).toBe('11')
    })

    it('getMonthLabel resolves label from string, number, or Date', () => {
      expect(getMonthLabel('01')).toBe('Januari')
      expect(getMonthLabel(5)).toBe('Mei')
      expect(getMonthLabel('12')).toBe('Desember')
      expect(getMonthLabel(new Date('2026-03-15'))).toBe('Maret')
      expect(getMonthLabel(null)).toBe('-')
      expect(getMonthLabel('')).toBe('-')
    })

    it('getMonthLabel supports short option and handles ISO date strings', () => {
      expect(getMonthLabel('01', { short: true })).toBe('Jan')
      expect(getMonthLabel('08', { short: true })).toBe('Agu')
      expect(getMonthLabel(12, { short: true })).toBe('Des')
      expect(getMonthLabel('2026-03', { short: true })).toBe('Mar')
      expect(getMonthLabel('2026-09-15', { short: true })).toBe('Sep')
      expect(getMonthLabel('2026-10-01')).toBe('Oktober')
      expect(getMonthLabel(new Date('2026-04-10'), { short: true })).toBe('Apr')
    })
  })

  describe('WEEK_DAYS & weekday helpers', () => {
    it('has 7 days in Indonesian starting with Minggu', () => {
      expect(WEEK_DAYS).toHaveLength(7)
      expect(WEEK_DAYS[0]).toBe('Minggu')
      expect(WEEK_DAYS[1]).toBe('Senin')
      expect(WEEK_DAYS[6]).toBe('Sabtu')
      expect(SHORT_WEEK_DAYS).toHaveLength(7)
      expect(SHORT_WEEK_DAYS[0]).toBe('Min')
      expect(SHORT_WEEK_DAYS[1]).toBe('Sen')
      expect(SHORT_WEEK_DAYS[6]).toBe('Sab')
    })

    it('getDayLabel resolves correct name for index or Date', () => {
      expect(getDayLabel(1)).toBe('Senin')
      expect(getDayLabel(1, { short: true })).toBe('Sen')
      expect(getDayLabel(0)).toBe('Minggu')
      expect(getDayLabel(0, { short: true })).toBe('Min')
      expect(getDayLabel(new Date('2026-10-19'))).toBe('Senin') // 2026-10-19 is Monday
      expect(getDayLabel(new Date('2026-10-19'), { short: true })).toBe('Sen')
      expect(getDayLabel(null)).toBe('-')
    })

    it('formatWorkDaysLabel produces human readable summary', () => {
      expect(formatWorkDaysLabel('1,2,3,4,5')).toBe('Senin - Jumat')
      expect(formatWorkDaysLabel('1,2,3,4,5,6')).toBe('Senin - Sabtu')
      expect(formatWorkDaysLabel('1,2,3')).toBe('3 Hari Kerja')
      expect(formatWorkDaysLabel('')).toBe('-')
      expect(formatWorkDaysLabel(null)).toBe('-')
    })
  })

  describe('formatTimeAgo', () => {
    it('returns empty string for empty/invalid dates', () => {
      expect(formatTimeAgo(null)).toBe('')
      expect(formatTimeAgo('')).toBe('')
      expect(formatTimeAgo('invalid')).toBe('')
    })

    it('formats recent events accurately', () => {
      const now = new Date()
      expect(formatTimeAgo(now.toISOString())).toBe('Baru saja')

      const tenMinutesAgo = new Date(now.getTime() - 10 * 60 * 1000)
      expect(formatTimeAgo(tenMinutesAgo)).toBe('10 mnt')
      expect(formatTimeAgo(tenMinutesAgo, { withSuffix: true })).toBe('10 mnt yang lalu')

      const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000)
      expect(formatTimeAgo(twoHoursAgo)).toBe('2 jam')
      expect(formatTimeAgo(twoHoursAgo, { withSuffix: true })).toBe('2 jam yang lalu')
    })
  })

  describe('timeToMinutes & minutesToTime', () => {
    it('converts time string to total minutes', () => {
      expect(timeToMinutes('00:00')).toBe(0)
      expect(timeToMinutes('08:30')).toBe(510)
      expect(timeToMinutes('08:30:45')).toBe(510)
      expect(timeToMinutes('')).toBeNull()
      expect(timeToMinutes(null)).toBeNull()
      expect(timeToMinutes('invalid')).toBeNull()
    })

    it('converts minutes to formatted time string', () => {
      expect(minutesToTime(510)).toBe('08:30')
      expect(minutesToTime(510, { includeSeconds: true })).toBe('08:30:00')
      expect(minutesToTime(0)).toBe('00:00')
      expect(minutesToTime(null)).toBe('')
      expect(minutesToTime(-10)).toBe('')
    })
  })
})

