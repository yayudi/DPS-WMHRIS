// frontend/src/stores/uploadStore.js
import { defineStore } from 'pinia'
import { ref } from 'vue'
import { jobApi } from '@/modules/settings/infrastructure/job.api'

export const useUploadStore = defineStore('upload', () => {
  const jobs = ref([])
  const pendingCount = ref(0)
  const isExpanded = ref(false) // For the UI widget

  const fetchJobs = async () => {
    try {
      const res = await jobApi.fetchImportJobs()
      const list = Array.isArray(res) ? res : (res as any)?.data || []
      jobs.value = list
      
      // Count active jobs
      const activeJobs = jobs.value.filter((j: any) => j.status === 'PENDING' || j.status === 'PROCESSING')
      pendingCount.value = activeJobs.length
    } catch (error) {
      console.error('Failed to fetch upload jobs:', error)
    }
  }

  const toggleWidget = () => {
    isExpanded.value = !isExpanded.value
  }

  return {
    jobs,
    pendingCount,
    isExpanded,
    fetchJobs,
    toggleWidget
  }
})
