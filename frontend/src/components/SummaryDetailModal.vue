<!-- components\SummaryDetailModal.vue -->
<script setup>
import { computed, ref, watch } from 'vue';
import { formatJamMenit } from "@/api/helpers/time.js";

const props = defineProps({
  summary: { type: Object, required: true },
  year: { type: Number, required: true },
  month: { type: Number, required: true },
});

const emit = defineEmits(['close']);

// Computed property untuk mengelompokkan semua data harian per minggu
const weeklyDetails = computed(() => {
  const weeks = {};

  const getWeekOfMonth = (date) => {
    const firstDayOfMonth = new Date(date.getFullYear(), date.getMonth(), 1).getDay();
    const adjustedFirstDay = firstDayOfMonth === 0 ? 6 : firstDayOfMonth - 1;
    return Math.ceil((date.getDate() + adjustedFirstDay) / 7);
  }

  const ensureWeek = (weekNumber) => {
    if (!weeks[weekNumber]) {
      weeks[weekNumber] = { late: [], overtime: [], earlyOut: [], absent: [] };
    }
  };

  (props.summary.dendaPerHari || []).forEach(item => {
    const date = new Date(props.year, props.month - 1, item.tanggal);
    const weekNumber = getWeekOfMonth(date);
    ensureWeek(weekNumber);
    weeks[weekNumber].late.push(item);
  });

  (props.summary.lemburPerHari || []).forEach(item => {
    const date = new Date(props.year, props.month - 1, item.tanggal);
    const weekNumber = getWeekOfMonth(date);
    ensureWeek(weekNumber);
    weeks[weekNumber].overtime.push(item);
  });

  (props.summary.earlyOutPerHari || []).forEach(item => {
    const date = new Date(props.year, props.month - 1, item.tanggal);
    const weekNumber = getWeekOfMonth(date);
    ensureWeek(weekNumber);
    weeks[weekNumber].earlyOut.push(item);
  });

  (props.summary.absenPerHari || []).forEach(tanggal => {
    const date = new Date(props.year, props.month - 1, tanggal);
    const weekNumber = getWeekOfMonth(date);
    ensureWeek(weekNumber);
    weeks[weekNumber].absent.push(tanggal);
  });

  const sortedWeeks = Object.keys(weeks).sort((a, b) => a - b);
  const sortedWeeklyDetails = {};
  for (const week of sortedWeeks) {
      sortedWeeklyDetails[week] = weeks[week];
  }

  return sortedWeeklyDetails;
});

// State untuk melacak tab minggu yang aktif
const activeWeek = ref(null);

// Fungsi untuk mengubah tab minggu yang aktif
function selectWeek(weekNumber) {
  activeWeek.value = weekNumber;
}

// Watcher untuk secara otomatis memilih tab minggu pertama saat data siap
watch(weeklyDetails, (newDetails) => {
  const firstWeek = Object.keys(newDetails)[0];
  if (firstWeek) {
    activeWeek.value = firstWeek;
  }
}, { immediate: true });

</script>

<template>
  <div @click.self="emit('close')" class="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center p-4 z-50">
    <div class="bg-background rounded-lg shadow-xl w-full max-w-lg max-h-[90vh] flex flex-col">
      <div class="p-4 border-b border-secondary/20 sticky top-0 bg-background rounded-t-lg">
        <h3 class="text-xl font-bold text-text">{{ summary.nama }}</h3>
        <p class="text-sm text-text/70">Rincian Absensi</p>
        <button @click="emit('close')" class="absolute top-4 right-4 text-text/40 hover:text-primary transition-colors text-2xl font-light">&times;</button>
      </div>

      <div class="p-4 space-y-5 overflow-y-auto text-sm">
        <!-- Rincian Uang Lembur (Tetap di atas) -->
        <section>
          <h4 class="font-semibold mb-2 text-text/90">Rincian Uang Lembur</h4>
          <div class="text-xs space-y-1 text-text/80 bg-secondary/10 p-3 rounded-md">
            <p class="flex justify-between"><span>Uang Lembur Kotor:</span> <span class="font-mono">Rp {{ summary.uangLemburKotor.toLocaleString('id-ID') }}</span></p>
            <p class="flex justify-between"><span>Potongan Denda Telat:</span> <span class="font-mono text-accent">- Rp {{ summary.dendaTelat.toLocaleString('id-ID') }}</span></p>
            <p class="font-bold border-t border-secondary/20 pt-2 mt-2 flex justify-between text-text"><span>Uang Lembur Diterima:</span> <span class="font-mono text-primary">Rp {{ summary.uangLembur.toLocaleString('id-ID') }}</span></p>
          </div>
        </section>

        <section>
          <!-- Navigasi Tab Mingguan -->
          <div class="border-b border-secondary/20 flex space-x-4">
            <button
              v-for="weekNumber in Object.keys(weeklyDetails)"
              :key="weekNumber"
              @click="selectWeek(weekNumber)"
              :class="[
                'pb-2 text-sm font-semibold border-b-2 transition-colors',
                activeWeek === weekNumber
                  ? 'border-primary text-primary'
                  : 'border-transparent text-text/60 hover:border-secondary hover:text-text'
              ]"
            >
              Minggu ke-{{ weekNumber }}
            </button>
          </div>

          <!-- Konten untuk Tab yang Aktif -->
          <div v-if="activeWeek && weeklyDetails[activeWeek]" class="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4 mt-4">

            <!-- Kolom Kiri: Absen & Pulang Cepat -->
            <div class="space-y-4">
              <div v-if="weeklyDetails[activeWeek].overtime.length > 0">
                <h5 class="text-xs font-bold text-text/80 mb-1">Lembur ({{ weeklyDetails[activeWeek].overtime.length }} hari)</h5>
                <ul class="text-xs space-y-1 list-disc pl-4 text-text/80">
                  <li v-for="item in weeklyDetails[activeWeek].overtime" :key="item.tanggal">
                    Tgl {{ item.tanggal }}: <span class="font-mono font-semibold">{{ formatJamMenit(item.lembur) }}</span>
                  </li>
                </ul>
              </div>
              <div v-if="weeklyDetails[activeWeek].late.length > 0">
                <h5 class="text-xs font-bold text-text/80 mb-1">Telat ({{ weeklyDetails[activeWeek].late.length }} hari)</h5>
                <ul class="text-xs space-y-1 list-disc pl-4 text-text/80">
                  <li v-for="item in weeklyDetails[activeWeek].late" :key="item.tanggal">
                    Tgl {{ item.tanggal }}: <span class="font-mono font-semibold">{{ item.telat }} mnt</span> (Denda Rp {{ item.denda.toLocaleString('id-ID') }})
                  </li>
                </ul>
              </div>
            </div>


            <!-- Kolom Kanan: Lembur & Telat -->
            <div class="space-y-4">
              <div v-if="weeklyDetails[activeWeek].absent.length > 0">
                <h5 class="text-xs font-bold text-text/80 mb-1">Absen ({{ weeklyDetails[activeWeek].absent.length }} hari)</h5>
                <p class="text-xs text-text/80 bg-secondary/10 p-2 rounded-md">Tanggal: <span class="font-mono">{{ weeklyDetails[activeWeek].absent.join(', ') }}</span></p>
              </div>
              <div v-if="weeklyDetails[activeWeek].earlyOut.length > 0">
                <h5 class="text-xs font-bold text-text/80 mb-1">Pulang Cepat ({{ weeklyDetails[activeWeek].earlyOut.length }} hari)</h5>
                <ul class="text-xs space-y-1 list-disc pl-4 text-text/80">
                  <li v-for="item in weeklyDetails[activeWeek].earlyOut" :key="item.tanggal">
                    Tgl {{ item.tanggal }}: <span class="font-mono font-semibold">{{ formatJamMenit(item.jamKeluar) }}</span>
                  </li>
                </ul>
              </div>
            </div>

          </div>
        </section>
      </div>
    </div>
  </div>
</template>
