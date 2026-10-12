import { http } from '@/core/infrastructure/http.client'

export const categoryApi = {
  async fetchCategories(search: string = ''): Promise<any> {
    const response = await http.get('/categories', { params: { search } })
    return response.data || response
  },
  async createCategory(payload: { name: string }): Promise<any> {
    const response = await http.post('/categories', payload)
    return response.data
  },
  async updateCategory(id: number | string, payload: { name: string }): Promise<any> {
    const response = await http.put(`/categories/${id}`, payload)
    return response.data
  },
  async deleteCategory(id: number | string): Promise<any> {
    const response = await http.delete(`/categories/${id}`)
    return response.data
  }
}
