import { http } from '@/core/infrastructure/http.client'
import type { LogFilter } from '../domain/log.entity'

export const logApi = {
  /**
   * Mengambil riwayat aktivitas (System Logs)
   */
  fetchLogs(filter: LogFilter): Promise<any> {
    return http.get('/logs', { params: filter })
  }
}
