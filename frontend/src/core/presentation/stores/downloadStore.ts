import { createJobQueueStore } from './createJobQueueStore'
import { analyticsApi } from '@/modules/analytics/infrastructure/analytics.api'

export const useDownloadStore = createJobQueueStore('download', () =>
  analyticsApi.getUserExportJobs()
)
