import { http } from '@/core/infrastructure/http.client'

export interface ImportJobItem {
  id: number
  job_name: string
  file_name: string
  status: string
  created_at: string
  [key: string]: unknown
}

export const jobApi = {
  async fetchImportJobs(): Promise<ImportJobItem[]> {
    const res = await http.get('/jobs/import')
    return res.data || []
  },

  async cancelImportJob(id: number | string): Promise<any> {
    const res = await http.delete(`/jobs/import/${id}`)
    return res.data
  }
}
