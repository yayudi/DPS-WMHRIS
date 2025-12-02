<script setup>
import { ref, computed } from 'vue' // ✅ Tambahkan 'computed'
import { useSummary } from '@/composables/UseSummary.js'
import { formatJamMenit } from '@/api/helpers/time.js'
import SummaryDetailModal from './SummaryDetailModal.vue'
import { useAuthStore } from '@/stores/auth.js' // ✅ 1. Import auth store

const props = defineProps({
  users: { type: Array, required: true },
  year: { type: Number, required: true },
  month: { type: Number, required: true },
  globalInfo: { type: Object, default: () => ({}) },
})

const auth = useAuthStore() // ✅ 2. Inisialisasi auth store
const { summaries } = useSummary(props)
const selectedSummary = ref(null)

// ✅ 3. Buat computed class untuk grid
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
      class="border border-secondary/30 rounded-lg bg-background shadow-sm flex flex-col max-h-[70vh]"
    >
      <!-- Table Header -->
      <!--  Gunakan :class dinamis, hapus grid-cols-7 -->
      <div
        class="grid gap-4 bg-secondary/10 p-3 font-bold text-xs text-text/80 uppercase hidden md:grid flex-shrink-0"
        :class="gridClass"
      >
        <div class="col-span-1">Nama</div>
        <div class="text-center">Jam Kerja</div>
        <div class="text-center">Lembur</div>
        <div class="text-center">Telat</div>
        <div class="text-center">Early Out</div>
        <div class="text-center">Absen</div>
        <!--  Sembunyikan kolom ini jika bukan admin -->
        <div v-if="auth.isAdmin" class="text-right">Uang Lembur</div>
      </div>

      <!-- Container untuk baris data yang bisa di-scroll -->
      <div class="divide-y divide-secondary/20 overflow-y-auto">
        <template v-for="s in summaries" :key="s.id">
          <div @click="showDetails(s)" class="cursor-pointer hover:bg-primary/10 transition-colors">
            <!--  Gunakan :class dinamis, hapus md:grid-cols-7 -->
            <div class="grid grid-cols-2 md:grid gap-4 items-center text-sm p-3" :class="gridClass">
              <div class="md:col-span-1 col-span-2 font-semibold text-text">{{ s.nama }}</div>
              <div class="md:text-center">
                <span class="md:hidden text-xs text-text/70">Jam Kerja: </span>{{ s.workHours }}
              </div>
              <div class="md:text-center">
                <span class="md:hidden text-xs text-text/70">Lembur: </span>{{ s.lemburHours }}
              </div>
              <div class="md:text-center">
                <span class="md:hidden text-xs text-text/70">Telat: </span>{{ s.telatHours }}
              </div>
              <div class="md:text-center">
                <span class="md:hidden text-xs text-text/70">Early Out: </span>{{ s.earlyOutHours }}
              </div>
              <div class="md:text-center">
                <span class="md:hidden text-xs text-text/70">Absen: </span>{{ s.absenceDays }} hari
              </div>
              <!--  Sembunyikan kolom ini jika bukan admin -->
              <div v-if="auth.isAdmin" class="md:text-right font-semibold text-primary">
                <span class="md:hidden text-xs text-text/70">Uang Lembur: </span>Rp
                {{ s.uangLembur.toLocaleString('id-ID') }}
              </div>
            </div>
          </div>
        </template>
      </div>
    </div>

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
