import { http } from '@/core/infrastructure/http.client'
import { AttendanceData } from '../domain/attendance.entity'
import { normalizeLogs } from '@/modules/hr/application/utils/normalize'

export const attendanceApi = {
  /**
   * Mengambil daftar tahun dan bulan yang tersedia dari API backend.
   */
  async getAvailableIndexes(): Promise<any> {
    const response = await http.get('/attendance/indexes')
    return (response as any)?.data || response
  },

  /**
   * Mengambil data absensi bulanan dari API backend.
   */
  async getAbsensiData(year: number, month: number): Promise<AttendanceData> {
    const response = await http.get(`/attendance/${year}/${month}`)
    const raw = ((response as any)?.data || response) as any
    return {
      summary: raw.globalInfo,
      users: normalizeLogs(raw.allUsers, raw.logRows, raw.globalInfo.holidayMap, year, month)
    }
  },

  async fetchAttendanceEvents(params: any): Promise<any[]> {
    const response = await http.get('/attendance/history', { params })
    return (response.data as any)?.data || response.data || []
  },

  /**
   * Mengambil data absensi berdasarkan Start Date & End Date.
   */
  async getAbsensiRange(startDate: string, endDate: string): Promise<AttendanceData> {
    const response = await http.get('/attendance/range', { params: { startDate, endDate } })
    const raw = ((response as any)?.data || response) as any
    return {
      summary: raw.globalInfo,
      users: normalizeLogs(raw.allUsers, raw.logRows, raw.globalInfo.holidayMap, startDate, endDate)
    }
  },

  /**
   * Memperbarui absensi individual karyawan.
   */
  async updateAttendance(payload: any): Promise<any> {
    return http.post('/attendance/update', payload)
  },

  /**
   * Mengupload file absensi.
   */
  async uploadAbsensiFile(formData: FormData): Promise<any> {
    return http.upload('/attendance/upload', formData)
  },

  hitungDendaTelat(menitTelat: number) {
    const aturanDenda = [
      [5, 0],
      [15, 10000],
      [30, 25000],
      [60, 50000],
      [Infinity, 100000],
    ]
    return aturanDenda.find(([max]) => menitTelat <= max)?.[1] || 0
  }
}
