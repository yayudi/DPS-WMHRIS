<script setup>
import { ref } from 'vue'
import { useSummary } from '@/composables/useSummary'
import { formatJamMenit } from '@/api/helpers/time'
import SummaryDetailModal from './SummaryDetailModal.vue'
import BaseSkeleton from '@/components/ui/BaseSkeleton.vue'
import BasePagination from '@/components/ui/BasePagination.vue'
import { useAuthStore } from '@/modules/auth/application/auth.store'
import { usePagination } from '@/composables/usePagination'

const props = defineProps({
  users: {
    type: Array,
    required: true
  },
  year: {
    type: Number,
    default: null
  },
  month: {
    type: Number,
    default: null
  },
  startDate: {
    type: String, // YYYY-MM-DD
    default: null
  },
  endDate: {
    type: String, // YYYY-MM-DD
    default: null
  },
  globalInfo: {
    type: Object,
    default: () => ({})
  },
  loading: {
    type: Boolean,
    default: false
  },
  mobileLayout: {
    type: String,
    default: 'card'
  }
})

const authStore = useAuthStore()

const { summaries } = useSummary(props)
const selectedSummary = ref(null)

const {
  paginatedData: paginatedSummaries,
  meta: pagination,
  changePage,
  changePageSize
} = usePagination({
  totalItems: summaries,
  storageKey: 'summaryPageSize',
  initialLimit: 10
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
        <strong class="font-semibold text-text">{{ formatJamMenit(globalInfo.idealMinutes) }}</strong>
        )
      </span>
    </div>

    <div
      class="bg-background rounded-xl shadow-md border border-secondary/20 overflow-x-auto overflow-y-auto relative custom-scrollbar h-[calc(100vh-300px)] table-container"
    >
      <table class="w-full text-sm text-left text-text border-collapse block md:table">
        <thead
          class="hidden md:table-header-group sticky top-0 z-30 bg-background/95 backdrop-blur-md shadow-sm ring-1 ring-secondary/5"
        >
          <tr class="text-xs text-text/80 uppercase">
            <th
              class="px-6 py-3 sticky left-0 z-30 bg-background/95 backdrop-blur-md border-b border-secondary/10 shadow-[4px_0_8px_-4px_rgba(0,0,0,0.05)] w-[250px]"
            >
              Nama
            </th>
            <th class="px-6 py-3 text-center border-b border-secondary/10">Jam Kerja</th>
            <th class="px-6 py-3 text-center border-b border-secondary/10">Lembur</th>
            <th class="px-6 py-3 text-center border-b border-secondary/10">Telat</th>
            <th class="px-6 py-3 text-center border-b border-secondary/10">Early Out</th>
            <th class="px-6 py-3 text-center border-b border-secondary/10">Absen</th>
            <th
              v-if="authStore.isAdmin"
              class="px-6 py-3 text-right border-b border-secondary/10 sticky right-0 z-30 bg-background/95 backdrop-blur-md shadow-[-4px_0_8px_-4px_rgba(0,0,0,0.05)]"
            >
              Uang Lembur
            </th>
          </tr>
        </thead>
        <TransitionGroup tag="tbody" name="list" class="block md:table-row-group divide-y divide-secondary/5 relative">
          <template v-if="loading">
            <tr v-for="n in 5" :key="`skeleton-${n}`" class="border-b border-secondary/20 animate-pulse">
              <td v-for="i in 5" :key="i" class="px-6 py-4">
                <BaseSkeleton
                  :shape="i === 5 ? 'rect' : 'text'"
                  :className="i === 1 ? 'w-8 h-4 mx-auto' : i === 5 ? 'w-16 h-6 mx-auto rounded-md' : 'w-full h-4'"
                />
              </td>
            </tr>
          </template>

          <tr v-else-if="!paginatedSummaries.length" key="empty" class="block md:table-row">
            <td :colspan="authStore.isAdmin ? 7 : 6" class="py-12 text-center text-text/50 italic block md:table-cell">
              Tidak ada data ringkasan untuk periode ini.
            </td>
          </tr>

          <tr
            v-else
            v-for="s in paginatedSummaries"
            :key="s.id"
            @click="showDetails(s)"
            class="block md:table-row border-b border-secondary/20 md:border-b-secondary/20 hover:bg-secondary/5 transition-colors cursor-pointer group relative mb-4 md:mb-0 bg-background/50 md:bg-transparent rounded-xl md:rounded-none shadow-sm md:shadow-none p-4 md:p-0"
            :class="{ 'mx-4': mobileLayout === 'card' }"
          >
            <td
              class="flex justify-between items-center md:table-cell px-2 md:px-6 py-2 md:py-4 font-bold text-text whitespace-nowrap md:sticky md:left-0 z-20 md:bg-background md:group-hover:bg-secondary/5 transition-colors md:shadow-[4px_0_8px_-4px_rgba(0,0,0,0.05)] border-b border-secondary/10 md:border-none mb-2 md:mb-0"
            >
              <span class="text-base md:text-sm">{{ s.nama }}</span>
              <span class="md:hidden text-xs font-normal text-text/60 bg-secondary/10 px-2 py-1 rounded">Detail ></span>
            </td>
            <td class="flex justify-between items-center md:table-cell px-2 md:px-6 py-1 md:py-4 text-center">
              <span class="md:hidden text-text/60 text-xs uppercase font-semibold">Jam Kerja</span>
              <span class="font-mono text-text/80">{{ s.workHours }}</span>
            </td>
            <td
              class="justify-between items-center px-2 md:px-6 py-1 md:py-4 text-center"
              :class="mobileLayout === 'compact' ? 'hidden md:table-cell' : 'flex md:table-cell'"
            >
              <span class="md:hidden text-text/60 text-xs uppercase font-semibold">Lembur</span>
              <span class="font-mono text-primary">{{ s.lemburHours }}</span>
            </td>
            <td
              class="flex justify-between items-center md:table-cell px-2 md:px-6 py-1 md:py-4 text-center text-danger/80"
              :class="{ 'font-bold': s.telatMinutes > 0 }"
            >
              <span class="md:hidden text-text/60 text-xs uppercase font-semibold">Telat</span>
              <span>{{ s.telatHours }}</span>
            </td>
            <td
              class="justify-between items-center px-2 md:px-6 py-1 md:py-4 text-center text-warning/80"
              :class="mobileLayout === 'compact' ? 'hidden md:table-cell' : 'flex md:table-cell'"
            >
              <span class="md:hidden text-text/60 text-xs uppercase font-semibold">Early Out</span>
              <span>{{ s.earlyOutHours }}</span>
            </td>
            <td class="flex justify-between items-center md:table-cell px-2 md:px-6 py-1 md:py-4 text-center">
              <span class="md:hidden text-text/60 text-xs uppercase font-semibold">Absen</span>
              <span v-if="s.absenceDays > 0" class="bg-danger/10 text-danger px-2 py-1 rounded-full text-xs font-bold"
                >{{ s.absenceDays }} hari</span
              >
              <span v-else class="text-text/40">-</span>
            </td>
            <td
              v-if="authStore.isAdmin"
              class="justify-between items-center px-2 md:px-6 py-1 md:py-4 text-right font-bold text-primary font-mono md:sticky md:right-0 z-20 md:bg-background md:group-hover:bg-secondary/5 transition-colors md:shadow-[-4px_0_8px_-4px_rgba(0,0,0,0.05)] border-t border-secondary/10 md:border-none mt-2 md:mt-0 pt-2 md:pt-4"
              :class="mobileLayout === 'compact' ? 'hidden md:table-cell' : 'flex md:table-cell'"
            >
              <span class="md:hidden text-text/60 text-xs uppercase font-semibold">Uang Lembur</span>
              <span>Rp {{ s.uangLembur.toLocaleString('id-ID') }}</span>
            </td>
          </tr>
        </TransitionGroup>
      </table>
    </div>

    <!-- Pagination -->
    <div v-if="!loading && summaries.length > 0" class="rounded-xl overflow-hidden">
      <BasePagination
        :pagination="pagination"
        :show-limit-picker="true"
        @changePage="changePage"
        @update:limit="changePageSize"
        class="bg-transparent mb-0 pb-1"
      />
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
  transition: all 0.3s ease;
}
</style>
