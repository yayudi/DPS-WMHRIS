// frontend/src/stores/downloadStore.js
import { defineStore } from 'pinia'
import { ref } from 'vue'
import axios from '@/core/infrastructure/http.client'

export const useDownloadStore = defineStore('download', () => {
  const jobs = ref([])

  const pendingCount = ref(0)
  const isExpanded = ref(false) // For the UI widget

  const fetchJobs = async () => {
    try {
      const res = await axios.get('/reports/my-jobs')
      if (res.data && res.data.success) {
        jobs.value = res.data.data

        // Count active jobs
        const activeJobs = jobs.value.filter(j => j.status === 'PENDING' || j.status === 'PROCESSING')
        pendingCount.value = activeJobs.length
      }
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
