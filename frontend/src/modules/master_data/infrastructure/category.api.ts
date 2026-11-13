import { http } from '@/core/infrastructure/http.client'

export const categoryApi = {
  async fetchCategories(search: string = ''): Promise<any> {
    const response = await http.get('/categories', { params: { search } })
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
  }
}
