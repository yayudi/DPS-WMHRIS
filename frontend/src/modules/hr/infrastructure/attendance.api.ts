import axios from '@/core/infrastructure/http.client'
import { AttendanceData } from '../domain/attendance.entity'
import { normalizeLogs } from '@/api/helpers/normalize'

export const attendanceApi = {
  /**
   * Mengambil daftar tahun dan bulan yang tersedia dari API backend.
   */
  async getAvailableIndexes(): Promise<any> {
    const response = await axios.get('/attendance/indexes')
    return response.data
  },

  /**
   * Mengambil data absensi bulanan dari API backend.
   */
  async getAbsensiData(year: number, month: number): Promise<AttendanceData> {
    const { data: raw } = await axios.get(`/attendance/${year}/${month}`)
    return {
      summary: raw.globalInfo,
      users: normalizeLogs(raw.allUsers, raw.logRows, raw.globalInfo.holidayMap, year, month)
    }
  },

  async fetchAttendanceEvents(params: any): Promise<any[]> {
    const { data } = await axios.get('/attendance/history', { params })
    return data.data
  },

  /**
   * Mengambil data absensi berdasarkan Start Date & End Date.
   */
  async getAbsensiRange(startDate: string, endDate: string): Promise<AttendanceData> {
    const { data: raw } = await axios.get('/attendance/range', { params: { startDate, endDate } })
    return {
      summary: raw.globalInfo,
      users: normalizeLogs(raw.allUsers, raw.logRows, raw.globalInfo.holidayMap, startDate, endDate)
    }
  },

  /**
   * Mengupload file absensi.
   */
  async uploadAbsensiFile(formData: FormData): Promise<any> {
    const response = await axios.post('/attendance/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    })
    return response.data
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
