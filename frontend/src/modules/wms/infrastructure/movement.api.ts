import { http } from '@/core/infrastructure/http.client'
import type { Movement } from '../domain/movement.entity'

export const movementApi = {
  async fetchMovements(params: Record<string, any>): Promise<any> {
    const response = await http.get('/wms/movements', { params })
    return response.data
  },

  async fetchMovementById(id: number | string): Promise<Movement> {
    const response = await http.get(`/wms/movements/${id}`)
    return response.data
  },

  async createMovement(payload: Movement): Promise<any> {
    const response = await http.post('/wms/movements', payload)
    return response.data
  },
  
  async batchMove(payload: { items: any[], notes?: string }): Promise<any> {
    const response = await http.post('/wms/movements/batch', payload)
    return response.data
  }
}
