import { ref, computed } from 'vue'
import dayjs from 'dayjs'
import {
  getDefaultMonthRange,
  MONTH_OPTIONS,
  SHORT_MONTH_NAMES,
  getCurrentMonth,
  getMonthLabel
} from '@/utils/formatters.js'

/**
 * Standar pilihan tipe rentang laporan analitik (Bulanan, Tahunan, Kustom).
 */
export const REPORT_TYPE_OPTIONS = Object.freeze([
  {
    id: 'monthly',
    value: 'monthly',
    label: 'Bulan',
    longLabel: 'Bulanan (Per Hari)',
    icon: 'fa-solid fa-calendar'
  },
  {
    id: 'annual',
    value: 'annual',
    label: 'Tahun',
    longLabel: 'Tahunan (Per Bulan)',
    icon: 'fa-solid fa-calendar-days'
  },
  {
    id: 'custom',
    value: 'custom',
    label: 'Kustom',
    longLabel: 'Rentang Waktu Kustom',
    icon: 'fa-solid fa-calendar-plus'
  }
])

/**
 * Composable untuk standarisasi state filter waktu laporan analitik (annual / monthly / custom),
 * komputasi opsi tahun, schema filter UI terpadu, dan payload generator tanggal.
 *
 * @param {Record<string, any>} [initialExtra={}] - State filter tambahan di luar tanggal
 * @param {object} [options={}] - Opsi konfigurasi
 * @param {number} [options.pastYears=5] - Jumlah tahun ke belakang
 * @param {number} [options.futureYears=1] - Jumlah tahun ke depan
 * @returns {object}
 */
export function useReportDateRange(initialExtra = {}, options = {}) {
  const currentYear = new Date().getFullYear()
  const past = options.pastYears ?? 5
  const future = options.futureYears ?? 1

  const availableYears = computed(() => {
    const list = []
    for (let y = currentYear - past; y <= currentYear + future; y++) {
      list.push(y)
    }
    return list
  })

  const availableYearOptions = computed(() => {
    return availableYears.value.map((y) => ({
      id: y,
      value: y,
      label: String(y)
    }))
  })

  const defaultDateValues = () => ({
    reportType: 'monthly',
    year: currentYear,
    selectedMonth: getCurrentMonth(),
    ...getDefaultMonthRange()
  })

  const filterValues = ref({
    ...defaultDateValues(),
    ...initialExtra
  })

  const resetDateFilters = () => {
    Object.assign(filterValues.value, defaultDateValues())
  }

  /**
   * Menghasilkan startDate, endDate, timeResolution, dan (opsional) rentang perbandingan periode sebelumnya.
   *
   * @param {object} [calcOptions={}]
   * @param {boolean} [calcOptions.withComparison=false]
   * @returns {{ startDate: string, endDate: string, timeResolution: string, prevStartDate?: string, prevEndDate?: string }}
   */
  const getDatePayload = (calcOptions = {}) => {
    const f = filterValues.value
    let startDate, endDate, timeResolution
    let prevStartDate, prevEndDate

    if (f.reportType === 'annual') {
      startDate = `${f.year}-01-01`
      endDate = `${f.year}-12-31`
      timeResolution = 'monthly'

      if (calcOptions.withComparison) {
        const prevYear = f.year - 1
        prevStartDate = `${prevYear}-01-01`
        prevEndDate = `${prevYear}-12-31`
      }
    } else if (f.reportType === 'monthly') {
      const d = new Date(`${f.year}-${f.selectedMonth}-02`)
      const range = getDefaultMonthRange(d)
      startDate = range.startDate
      endDate = range.endDate
      timeResolution = 'daily'

      if (calcOptions.withComparison) {
        const prev = dayjs(d).subtract(1, 'month')
        const prevRange = getDefaultMonthRange(prev)
        prevStartDate = prevRange.startDate
        prevEndDate = prevRange.endDate
      }
    } else {
      startDate = f.startDate
      endDate = f.endDate
      timeResolution = 'daily'

      if (calcOptions.withComparison) {
        const diffDays = dayjs(endDate).diff(dayjs(startDate), 'day') + 1
        prevEndDate = dayjs(startDate).subtract(1, 'day').format('YYYY-MM-DD')
        prevStartDate = dayjs(startDate).subtract(diffDays, 'day').format('YYYY-MM-DD')
      }
    }

    const payload = { startDate, endDate, timeResolution }
    if (calcOptions.withComparison) {
      payload.prevStartDate = prevStartDate
      payload.prevEndDate = prevEndDate
    }
    return payload
  }

  /**
   * Menghasilkan schema dynamic date filter untuk FilterBar berdasarkan reportType saat ini.
   *
   * @returns {Array<object>}
   */
  const getDateFilterSchema = () => {
    const filters = []
    if (filterValues.value.reportType === 'annual') {
      filters.push({
        type: 'select',
        key: 'year',
        label: 'Tahun',
        options: availableYearOptions.value,
        clearable: false,
        searchable: false
      })
    } else if (filterValues.value.reportType === 'monthly') {
      filters.push({
        type: 'select',
        key: 'selectedMonth',
        label: 'Bulan',
        options: MONTH_OPTIONS,
        trackBy: 'value',
        clearable: false,
        searchable: false,
        placeholder: 'Pilih Bulan'
      })
      filters.push({
        type: 'select',
        key: 'year',
        label: 'Tahun',
        options: availableYearOptions.value,
        clearable: false,
        searchable: false
      })
    } else {
      filters.push({
        type: 'daterange',
        keyStart: 'startDate',
        keyEnd: 'endDate',
        label: 'Rentang Waktu'
      })
    }
    return filters
  }

  return {
    filterValues,
    availableYears,
    availableYearOptions,
    defaultDateValues,
    resetDateFilters,
    getDatePayload,
    getDateFilterSchema,
    REPORT_TYPE_OPTIONS,
    MONTH_OPTIONS,
    SHORT_MONTH_NAMES,
    getCurrentMonth,
    getMonthLabel
  }
}
