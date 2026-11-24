import { http } from '@/core/infrastructure/http.client'

export const categoryApi = {
  async fetchCategories(search: string = '', status: string = 'active'): Promise<any> {
    const response = await http.get('/categories', { params: { search, status } })
    return response.data || response
  },
  async createCategory(payload: { name: string }): Promise<any> {
    return http.post('/categories', payload)
  },
  async updateCategory(id: number | string, payload: { name: string }): Promise<any> {
    return http.put(`/categories/${id}`, payload)
  },
  async deleteCategory(id: number | string): Promise<any> {
    return http.delete(`/categories/${id}`)
  },
  async restoreCategory(id: number | string): Promise<any> {
    return http.post(`/categories/${id}/restore`)
  }
}
