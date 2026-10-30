import { createJobQueueStore } from './createJobQueueStore'
import { jobApi } from '@/modules/settings/infrastructure/job.api'

export const useUploadStore = createJobQueueStore('upload', () =>
  jobApi.fetchImportJobs()
)
