// frontend/src/composables/useSummary.js
import { computed } from 'vue'
import { calculateSummaryForUser } from '@/api/helpers/summary.js'
import { useAuthStore } from '@/stores/auth.js'

export function useSummary(props) {
  const auth = useAuthStore()
  const summaries = computed(() => {
    if (!props.users || props.users.length === 0) {
      return []
    }

    return props.users.map(u => {
      const summary = calculateSummaryForUser(u, props.year, props.month, props.globalInfo, auth)
      return { id: u.id, nama: u.nama, ...summary }
    })
  })

  const totalUangLembur = computed(() => summaries.value.reduce((sum, s) => sum + (s.uangLembur || 0), 0))

  return {
    summaries,
    totalUangLembur
  }
}
