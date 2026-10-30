// frontend/src/stores/downloadStore.js
import { defineStore } from 'pinia'
import { ref } from 'vue'
import { analyticsApi } from '@/modules/analytics/infrastructure/analytics.api'

export const useDownloadStore = defineStore('download', () => {
  const jobs = ref([])

  const pendingCount = ref(0)
  const isExpanded = ref(false) // For the UI widget

  const fetchJobs = async () => {
    try {
      const res = await analyticsApi.getUserExportJobs()
      const list = Array.isArray(res) ? res : res?.data || []
      jobs.value = list

      // Count active jobs
      const activeJobs = jobs.value.filter(j => j.status === 'PENDING' || j.status === 'PROCESSING')
      pendingCount.value = activeJobs.length
    } catch (error) {
      console.error('Failed to fetch download jobs:', error)
    }
  }

  const notifyNewJob = () => {
    isExpanded.value = true // Auto expand when new download starts
    fetchJobs() // Fetch immediately
  }

  const toggleWidget = () => {
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
