<!-- frontend\src\components\SummaryView.vue -->
<script setup>
import { ref, computed } from 'vue'
import { useSummary } from '@/composables/useSummary.js'
import { formatJamMenit } from '@/api/helpers/time.js'
// ... import removed
import SummaryDetailModal from './SummaryDetailModal.vue'
import TableSkeleton from '@/components/ui/TableSkeleton.vue'
import { useAuthStore } from '@/stores/auth.js'

const props = defineProps({
  users: { type: Array, required: true },
  year: { type: Number, required: true },
  month: { type: Number, required: true },
  globalInfo: { type: Object, default: () => ({}) },
  loading: { type: Boolean, default: false },
})

const auth = useAuthStore()
const { summaries } = useSummary(props)
const selectedSummary = ref(null)

const gridClass = computed(() => {
  return auth.isAdmin ? 'md:grid-cols-7' : 'md:grid-cols-6'
})

function showDetails(summary) {
  selectedSummary.value = summary
}
function closeModal() {
  selectedSummary.value = null
}
</script>

<template>
  <div>
    <!-- Info Waktu Ideal (Tidak berubah) -->
    <div v-if="globalInfo && globalInfo.idealMinutes" class="text-sm text-text/80 mb-4">
      <span>
        <span class="text-lg font-bold text-text mb-2 mr-1">Ringkasan Bulanan</span>
        ( Waktu Kerja Ideal:
        <!--  Gunakan 'idealMinutes' dari globalInfo baru -->
        <strong class="font-semibold text-text">{{
          formatJamMenit(globalInfo.idealMinutes)
        }}</strong>
        )
      </span>
    </div>

    <div
      class="bg-background rounded-xl shadow-md border border-secondary/20 overflow-x-auto overflow-y-auto relative custom-scrollbar h-[calc(100vh-300px)] table-container">
      <table class="w-full text-sm text-left text-text border-collapse">
        <thead class="sticky top-0 z-30 bg-background/95 backdrop-blur-md shadow-sm ring-1 ring-secondary/5">
          <tr class="text-xs text-text/80 uppercase">
            <th class="px-6 py-3 sticky left-0 z-30 bg-background/95 backdrop-blur-md border-b border-secondary/10 shadow-[4px_0_8px_-4px_rgba(0,0,0,0.05)] w-[250px]">Nama</th>
            <th class="px-6 py-3 text-center border-b border-secondary/10">Jam Kerja</th>
            <th class="px-6 py-3 text-center border-b border-secondary/10">Lembur</th>
            <th class="px-6 py-3 text-center border-b border-secondary/10">Telat</th>
            <th class="px-6 py-3 text-center border-b border-secondary/10">Early Out</th>
            <th class="px-6 py-3 text-center border-b border-secondary/10">Absen</th>
            <th v-if="auth.isAdmin" class="px-6 py-3 text-right border-b border-secondary/10 sticky right-0 z-30 bg-background/95 backdrop-blur-md shadow-[-4px_0_8px_-4px_rgba(0,0,0,0.05)]">Uang Lembur</th>
          </tr>
        </thead>
        <TransitionGroup tag="tbody" name="list" class="divide-y divide-secondary/5 relative">
          <template v-if="loading">
             <TableSkeleton v-for="n in 5" :key="`skeleton-${n}`" />
          </template>

          <tr v-else-if="!summaries.length" key="empty">
              <td :colspan="auth.isAdmin ? 7 : 6" class="py-12 text-center text-text/50 italic">
                  Tidak ada data ringkasan untuk periode ini.
              </td>
          </tr>

          <tr v-else v-for="s in summaries" :key="s.id" @click="showDetails(s)"
              class="border-b border-secondary/20 hover:bg-secondary/5 transition-colors cursor-pointer group relative">
            <td class="px-6 py-4 font-bold text-text whitespace-nowrap sticky left-0 z-20 bg-background group-hover:bg-secondary/5 transition-colors shadow-[4px_0_8px_-4px_rgba(0,0,0,0.05)]">
              {{ s.nama }}
            </td>
            <td class="px-6 py-4 text-center">
              {{ s.workHours }}
            </td>
            <td class="px-6 py-4 text-center">
              {{ s.lemburHours }}
            </td>
            <td class="px-6 py-4 text-center text-danger/80" :class="{ 'font-bold': s.telatMinutes > 0 }">
              {{ s.telatHours }}
            </td>
            <td class="px-6 py-4 text-center text-warning/80">
              {{ s.earlyOutHours }}
            </td>
             <td class="px-6 py-4 text-center">
              <span v-if="s.absenceDays > 0" class="bg-danger/10 text-danger px-2 py-1 rounded-full text-xs font-bold">{{ s.absenceDays }} hari</span>
              <span v-else class="text-text/40">-</span>
            </td>
            <td v-if="auth.isAdmin" class="px-6 py-4 text-right font-bold text-primary font-mono sticky right-0 z-20 bg-background group-hover:bg-secondary/5 transition-colors shadow-[-4px_0_8px_-4px_rgba(0,0,0,0.05)]">
              Rp {{ s.uangLembur.toLocaleString('id-ID') }}
            </td>
          </tr>
        </TransitionGroup>
      </table>
    </div>

    <!-- Mobile Card View (Optional, but Table handles overflow) -->
    <!-- Keeping it table-only for now as requested -->


    <!-- Modal (Tidak berubah) -->
    <SummaryDetailModal
      v-if="selectedSummary"
      :summary="selectedSummary"
      :year="props.year"
      :month="props.month"
      @close="closeModal"
    />
  </div>

</template>

<style scoped>
.custom-scrollbar::-webkit-scrollbar {
  width: 6px;
  height: 6px;
}

.custom-scrollbar::-webkit-scrollbar-track {
  background: transparent;
}

.custom-scrollbar::-webkit-scrollbar-thumb {
  background-color: hsl(var(--color-secondary) / 0.3);
  border-radius: 4px;
}

.custom-scrollbar::-webkit-scrollbar-thumb:hover {
  background-color: hsl(var(--color-secondary) / 0.5);
}

/* List Transitions */
.list-enter-active,
.list-leave-active {
  transition: all 0.3s ease;
}

.list-enter-from,
.list-leave-to {
  opacity: 0;
  transform: translateX(-10px);
}
.list-leave-active {
  position: absolute;
  width: 100%;
}
</style>
