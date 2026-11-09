import { http } from '@/core/infrastructure/http.client'
import { Schedule, Shift } from '../domain/shift.entity'

const ENDPOINT = '/schedules'

export const shiftApi = {
  async fetchSchedules(userId?: number | string, startDate?: string, endDate?: string): Promise<Schedule[]> {
    const response = await http.get<Schedule[]>(ENDPOINT, {
      params: { userId, startDate, endDate }
    })
    return response.data || []
  },

  async createSchedule(payload: any): Promise<any> {
    return http.post(ENDPOINT, payload)
  },

  async deleteSchedule(userId: number | string, date: string): Promise<any> {
    return http.delete(ENDPOINT, { params: { userId, date } })
  },

  async uploadScheduleImport(formData: FormData): Promise<any> {
    return http.upload('/schedules/import', formData)
  },

  async fetchShifts(): Promise<Shift[]> {
    const response = await http.get<Shift[]>('/shifts')
    return response.data || []
  },

  async createShift(payload: any): Promise<any> {
    return http.post('/shifts', payload)
  },

  async updateShift(id: number | string, payload: any): Promise<any> {
    return http.put(`/shifts/${id}`, payload)
  },

  async deleteShift(id: number | string): Promise<any> {
    return http.delete(`/shifts/${id}`)
  }
}
