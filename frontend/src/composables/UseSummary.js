// composables/UseSummary.js

import { computed } from "vue"
import { calculateSummaryForUser } from "@/api/helpers/summary.js"

export function useSummary(props) {
  const summaries = computed(() => {
    console.log(`🚀 Menghitung ulang ringkasan untuk ${props.users.length} user...`);

    if (!props.users || props.users.length === 0) {
      return [];
    }

    return props.users.map(u => {
      const summary = calculateSummaryForUser(
        u,
        props.year,
        props.month,
        props.globalInfo
      )
      return { id: u.id, nama: u.nama, ...summary }
    })
  })

  const totalUangLembur = computed(() =>
    summaries.value.reduce((sum, s) => sum + (s.uangLembur || 0), 0)
  )

  return {
    summaries,
    totalUangLembur,
  }
}
