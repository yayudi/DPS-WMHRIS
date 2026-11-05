import { http } from '@/core/infrastructure/http.client'

export interface PaperSize {
  id?: number
  name: string
  width_mm: number
  height_mm: number
  [key: string]: unknown
}

export interface StickerTemplate {
  id?: number
  name: string
  paper_size_id: number
  content?: string
  layout_config?: unknown
  [key: string]: unknown
}

export const stickerApi = {
  // Paper Sizes
  async fetchPaperSizes(): Promise<PaperSize[]> {
    const res = await http.get('/paper-sizes')
    return res.data || []
  },

  async createPaperSize(payload: PaperSize): Promise<any> {
    const res = await http.post('/paper-sizes', payload)
    return res.data
  },

  async updatePaperSize(id: number | string, payload: PaperSize): Promise<any> {
    const res = await http.put(`/paper-sizes/${id}`, payload)
    return res.data
  },

  async deletePaperSize(id: number | string): Promise<any> {
    const res = await http.delete(`/paper-sizes/${id}`)
    return res.data
  },

  // Sticker Templates
  async fetchStickerTemplates(): Promise<StickerTemplate[]> {
    const res = await http.get('/sticker-templates')
    return res.data || []
  },

  async createStickerTemplate(payload: StickerTemplate): Promise<any> {
    const res = await http.post('/sticker-templates', payload)
    return res.data
  },

  async updateStickerTemplate(id: number | string, payload: StickerTemplate): Promise<any> {
    const res = await http.put(`/sticker-templates/${id}`, payload)
    return res.data
  },

  async deleteStickerTemplate(id: number | string): Promise<any> {
    const res = await http.delete(`/sticker-templates/${id}`)
    return res.data
  },

  async exportSticker(payload: unknown): Promise<Blob> {
    return http.blob('/sticker-templates/export', { method: 'POST', data: payload })
  }
}
