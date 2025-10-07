<!-- components\SummaryView.vue -->
<script setup>
import { ref} from "vue";
import { useSummary } from "@/composables/UseSummary.js";
import { formatJamMenit } from "@/api/helpers/time.js";
import SummaryDetailModal from './SummaryDetailModal.vue';

const props = defineProps({
  users: { type: Array, required: true },
  year: { type: Number, required: true },
  month: { type: Number, required: true },
  globalInfo: { type: Object, default: () => ({}) },
});
const { summaries } = useSummary(props);
const selectedSummary = ref(null);

function showDetails(summary) {
  selectedSummary.value = summary;
}
function closeModal() {
  selectedSummary.value = null;
}
</script>

<template>
  <div>
    <div v-if="globalInfo && globalInfo.m" class="text-sm text-text/80 mb-4">
      <span>
        <span class="text-lg font-bold text-text mb-2 mr-1">Ringkasan Bulanan</span>
        ( Waktu Kerja Ideal:
          <strong class="font-semibold text-text">{{ formatJamMenit(globalInfo.m) }}</strong>
        )
      </span>
    </div>

    <div class="border border-secondary/30 rounded-lg bg-background shadow-sm flex flex-col max-h-[70vh]">
      <!-- Table Header -->
      <div class="grid grid-cols-7 gap-4 bg-secondary/10 p-3 font-bold text-xs text-text/80 uppercase hidden md:grid flex-shrink-0">
        <div class="col-span-1">Nama</div>
        <div class="text-center">Jam Kerja</div>
        <div class="text-center">Lembur</div>
        <div class="text-center">Telat</div>
        <div class="text-center">Early Out</div>
        <div class="text-center">Absen</div>
        <div class="text-right">Uang Lembur</div>
      </div>

      <!-- Container untuk baris data yang bisa di-scroll -->
      <div class="divide-y divide-secondary/20 overflow-y-auto">
        <template v-for="s in summaries" :key="s.id">
          <!-- 4. @click SEKARANG MEMANGGIL 'showDetails' -->
          <div
            @click="showDetails(s)"
            class="cursor-pointer hover:bg-primary/10 transition-colors"
          >
            <div class="grid grid-cols-2 md:grid-cols-7 gap-4 items-center text-sm p-3">
              <div class="md:col-span-1 col-span-2 font-semibold text-text">{{ s.nama }}</div>
              <div class="md:text-center"><span class="md:hidden text-xs text-text/70">Jam Kerja: </span>{{ s.workHours }}</div>
              <div class="md:text-center"><span class="md:hidden text-xs text-text/70">Lembur: </span>{{ s.lemburHours }}</div>
              <div class="md:text-center"><span class="md:hidden text-xs text-text/70">Telat: </span>{{ s.telatHours }}</div>
              <div class="md:text-center"><span class="md:hidden text-xs text-text/70">Early Out: </span>{{ s.earlyOutHours }}</div>
              <div class="md:text-center"><span class="md:hidden text-xs text-text/70">Absen: </span>{{ s.absenceDays }} hari</div>
              <div class="md:text-right font-semibold text-primary"><span class="md:hidden text-xs text-text/70">Uang Lembur: </span>Rp {{ s.uangLembur.toLocaleString('id-ID') }}</div>
            </div>
          </div>

          <!-- Panel dropdown tidak lagi digunakan -->
        </template>
      </div>
    </div>

    <!-- 5. PANGGIL KOMPONEN MODAL DI SINI DENGAN PROPS YANG LENGKAP -->
    <SummaryDetailModal
      v-if="selectedSummary"
      :summary="selectedSummary"
      :year="props.year"
      :month="props.month"
      @close="closeModal"
    />
  </div>
</template>
