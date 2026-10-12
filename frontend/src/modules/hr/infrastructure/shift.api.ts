import axios from '@/core/infrastructure/http.client'
import { Schedule, Shift } from '../domain/shift.entity'

const ENDPOINT = '/schedules'

export const shiftApi = {
  async fetchSchedules(userId?: number | string, startDate?: string, endDate?: string): Promise<Schedule[]> {
    const { data } = await axios.get(ENDPOINT, {
      params: { userId, startDate, endDate }
    })
    return data.data || []
  },

  async createSchedule(payload: any): Promise<any> {
    const { data } = await axios.post(ENDPOINT, payload)
    return data
  },

  async deleteSchedule(userId: number | string, date: string): Promise<any> {
    const response = await axios.delete(ENDPOINT, { params: { userId, date } })
    return response.data
  },

  async uploadScheduleImport(formData: FormData): Promise<any> {
    const response = await axios.post('/schedules/import', formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    })
    return response.data
  },

  async fetchShifts(): Promise<Shift[]> {
    const { data } = await axios.get('/shifts')
    return data.data || []
  },

  async createShift(payload: any): Promise<any> {
    const { data } = await axios.post('/shifts', payload)
    return data
  },

  async updateShift(id: number | string, payload: any): Promise<any> {
    const { data } = await axios.put(`/shifts/${id}`, payload)
    return data
  },

  async deleteShift(id: number | string): Promise<any> {
    const { data } = await axios.delete(`/shifts/${id}`)
    return data
  }
}
