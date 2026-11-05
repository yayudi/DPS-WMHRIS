import { defineStore } from 'pinia'
import { ref, type Ref } from 'vue'

export interface JobQueueItem {
  id?: string | number
  status?: string
  [key: string]: unknown
}

export interface JobQueueStore<T extends JobQueueItem = JobQueueItem> {
  jobs: Ref<T[]>
  pendingCount: Ref<number>
  isExpanded: Ref<boolean>
  fetchJobs: () => Promise<void>
  notifyNewJob: () => void
  toggleWidget: () => void
}

/**
 * Higher-order Pinia store factory to consolidate background job queue state and logic.
 * Standardizes polling/fetching, active job counting (PENDING | PROCESSING), and widget expansion.
 *
 * @param storeId - Unique Pinia store identifier
 * @param fetchJobsApi - Async function retrieving job queue records
 */
export function createJobQueueStore<T extends JobQueueItem = JobQueueItem>(
  storeId: string,
  fetchJobsApi: () => Promise<T[] | { data: T[] } | unknown>
) {
  return defineStore(storeId, () => {
    const jobs = ref<T[]>([]) as Ref<T[]>
    const pendingCount = ref(0)
    const isExpanded = ref(false)

    const fetchJobs = async (): Promise<void> => {
      try {
        const res = await fetchJobsApi()
        const list: T[] = Array.isArray(res)
          ? res
          : Array.isArray((res as { data?: T[] })?.data)
            ? (res as { data: T[] }).data
            : []

        jobs.value = list

        const activeJobs = list.filter(
          j => j.status === 'PENDING' || j.status === 'PROCESSING'
        )
        pendingCount.value = activeJobs.length
      } catch (error) {
        console.error(`[JobQueueStore:${storeId}] Failed to fetch jobs:`, error)
      }
    }

    const notifyNewJob = (): void => {
      isExpanded.value = true
      fetchJobs()
    }

    const toggleWidget = (): void => {
      isExpanded.value = !isExpanded.value
    }

    return {
      jobs,
      pendingCount,
      isExpanded,
      fetchJobs,
      notifyNewJob,
      toggleWidget
    }
  })
}

