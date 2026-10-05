<script setup>
import { ref, computed, watch, onMounted, onUnmounted } from 'vue';
import { getProductStockTimeline } from '@/api/helpers/statistics';

const props = defineProps({
  productId: {
    type: String,
    required: true
  },
  buildings: {
    type: Array,
    default: () => []
  }
});

const page = ref(1);
const limit = ref(100);

const isPending = ref(false);
const error = ref(null);
const timelineResult = ref({ data: [], totalPages: 1 });

const fetchTimeline = async () => {
  if (!props.productId) return;
  isPending.value = true;
  error.value = null;
  try {
    const res = await getProductStockTimeline(props.productId, page.value, limit.value, props.buildings);
    timelineResult.value = res.data;
  } catch (err) {
    console.error(err) // Auto-added to prevent unused var
    error.value = err;
  } finally {
    isPending.value = false;
  }
};

onMounted(() => {
  fetchTimeline();
  window.addEventListener('keydown', handleKeydown);
});

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeydown);
});

watch([() => props.productId, () => props.buildings, page], () => {
  fetchTimeline();
}, { deep: true });

const actualData = computed(() => timelineResult.value?.data || []);
const actualTotalPages = computed(() => timelineResult.value?.totalPages || 1);

const sliderIndex = ref(0);

// API returns newest first (index 0). We reverse it so slider left (0) is oldest, right (max) is newest.
const baseReversedData = computed(() => [...actualData.value].reverse());

// Movement Type Filter
const hiddenMovementTypes = ref(new Set());

const availableMovementTypes = computed(() => {
  const types = new Set(baseReversedData.value.map(d => d.movement_type));
  return Array.from(types).sort();
});

const toggleMovementTypeFilter = (type) => {
  const newSet = new Set(hiddenMovementTypes.value);
  if (newSet.has(type)) {
    newSet.delete(type);
  } else {
    newSet.add(type);
  }
  hiddenMovementTypes.value = newSet;
  compareIndex.value = null; // Reset compare mode on filter change
};

const reversedData = computed(() => {
  return baseReversedData.value.filter(d => !hiddenMovementTypes.value.has(d.movement_type));
});

watch(reversedData, (newData) => {
  if (newData.length > 0) {
    sliderIndex.value = newData.length - 1; // Default to newest point on load

  }
});

const currentPoint = computed(() => {
  if (reversedData.value.length === 0) return null;
  return reversedData.value[sliderIndex.value];
});

// Since page 1 is newest, "Previous" means going to older records (page + 1)
const prevPage = () => {
  if (page.value < actualTotalPages.value) page.value++;
};
const nextPage = () => {
  if (page.value > 1) page.value--;
};

// UI helpers
const formatDate = (dateString) => {
  if (!dateString) return '-';
  return new Date(dateString).toLocaleString('id-ID', { dateStyle: 'long', timeStyle: 'short' });
};

// Keyboard Navigation & Sparkline
const handleKeydown = (e) => {
  if (reversedData.value.length === 0) return;
  // Jangan navigasi jika user sedang mengetik di input box (seperti kotak pencarian)
  if (['INPUT', 'TEXTAREA'].includes(e.target.tagName)) return;

  if (e.key === 'ArrowLeft') {
    e.preventDefault();
    if (sliderIndex.value > 0) sliderIndex.value--;
  } else if (e.key === 'ArrowRight') {
    e.preventDefault();
    if (sliderIndex.value < reversedData.value.length - 1) sliderIndex.value++;
  }
};

const sparklinePoints = computed(() => {
  const data = reversedData.value;
  if (data.length < 2) return '';

  const balances = data.map(d => d.balance_after);
  const min = Math.min(...balances);
  const max = Math.max(...balances);
  const range = max - min || 1; // Hindari division by zero

  const height = 40; // Relative height untuk SVG viewBox
  return data.map((d, i) => {
    const x = (i / (data.length - 1)) * 100;
    const y = height - ((d.balance_after - min) / range) * height;
    return `${x},${y}`;
  }).join(' ');
});

const currentSparklineX = computed(() => {
  if (reversedData.value.length < 2) return 0;
  return (sliderIndex.value / (reversedData.value.length - 1)) * 100;
});

const anomalies = computed(() => {
  const data = reversedData.value;
  if (data.length < 2) return [];

  const balances = data.map(d => d.balance_after);
  const min = Math.min(...balances);
  const max = Math.max(...balances);
  const range = max - min || 1;
  const height = 40;

  return data.map((d, i) => {
    // Definisi anomali: perubahan > 25% dari rentang balance dan nilainya > 5
    const isAnomaly = Math.abs(d.net_change) > (range * 0.25) && Math.abs(d.net_change) > 5;
    if (!isAnomaly) return null;

    const x = (i / (data.length - 1)) * 100;
    const y = height - ((d.balance_after - min) / range) * height;
    return { x, y, type: d.net_change > 0 ? 'up' : 'down' };
  }).filter(Boolean);
});

const parsedNotes = computed(() => {
  if (!currentPoint.value || !currentPoint.value.notes) {
    return { text: 'Tidak ada catatan spesifik untuk transaksi ini.', ref: null };
  }

  const notes = currentPoint.value.notes;
  // Cari pola referensi seperti INV/..., SO-..., PO-...
  const refMatch = notes.match(/(?:Ref:|Invoice:|PO:)?\s*(INV\/[A-Za-z0-9/\-_]+|[A-Z]{2,3}-\d+)/i);

  if (refMatch) {
    const fullMatch = refMatch[0];
    const refCode = refMatch[1] || fullMatch.replace(/(?:Ref:|Invoice:|PO:)\s*/i, '');
    let cleanText = notes.replace(fullMatch, '').replace(/[()]/g, '').trim();
    if (cleanText.toLowerCase() === 'sale') cleanText = 'Penjualan';

    return {
      text: cleanText || 'Transaksi Sistem',
      ref: refCode.trim()
    };
  }

  return { text: notes, ref: null };
});

// Mode Perbandingan (Compare Mode)
const compareIndex = ref(null);

const toggleCompare = () => {
  if (compareIndex.value === null) {
    compareIndex.value = sliderIndex.value;
  } else {
    compareIndex.value = null;
  }
};

const compareStats = computed(() => {
  if (compareIndex.value === null || reversedData.value.length === 0) return null;

  const startIdx = Math.min(compareIndex.value, sliderIndex.value);
  const endIdx = Math.max(compareIndex.value, sliderIndex.value);

  if (startIdx === endIdx) return { net: 0, in: 0, out: 0, adjust: 0 };

  let totalIn = 0;
  let totalOut = 0;
  let totalAdjust = 0;

  for (let i = startIdx + 1; i <= endIdx; i++) {
    const mov = reversedData.value[i];
    if (mov.movement_type === 'ADJUSTMENT' || mov.movement_type === 'STOCK_OPNAME') {
      totalAdjust += mov.net_change;
    } else if (mov.net_change > 0) {
      totalIn += mov.net_change;
    } else if (mov.net_change < 0) {
      totalOut += Math.abs(mov.net_change);
    }
  }

  const netDelta = reversedData.value[endIdx].balance_after - reversedData.value[startIdx].balance_after;

  return { net: netDelta, in: totalIn, out: totalOut, adjust: totalAdjust };
});

const compareSparklineX = computed(() => {
  if (compareIndex.value === null || reversedData.value.length < 2) return null;
  return (compareIndex.value / (reversedData.value.length - 1)) * 100;
});
</script>

<template>
  <div class="flex flex-col bg-background relative w-full h-full">
    <div class="max-w-3xl mx-auto w-full h-full">
      <!-- MAIN CONTENT -->
      <div v-if="isPending" class="py-20 flex flex-col items-center justify-center gap-4">
        <font-awesome-icon icon="fa-solid fa-circle-notch" spin class="text-4xl text-primary" />
        <p class="text-text/50 text-sm animate-pulse">Memuat mesin waktu...</p>
      </div>

      <div v-else-if="error"
        class="py-20 flex items-center justify-center text-danger border border-danger/20 bg-danger/5 rounded-2xl">
        {{ error.message }}
      </div>

      <div v-else-if="reversedData.length > 0" class="flex flex-col gap-8">

        <!-- Current Status Card -->
        <div
          class="bg-background rounded-3xl p-10 border-2 border-secondary/10 shadow-lg shadow-secondary/5 flex flex-col items-center justify-center text-center relative overflow-hidden">
          <!-- Decorative Background Elements -->
          <div class="absolute -top-10 -right-10 w-40 h-40 bg-primary/5 rounded-full blur-3xl"></div>
          <div class="absolute -bottom-10 -left-10 w-40 h-40 bg-accent/5 rounded-full blur-3xl"></div>

          <span
            class="relative z-10 text-sm uppercase font-bold tracking-widest text-text/40 mb-3 bg-secondary/5 px-4 py-1 rounded-full border border-secondary/10">
            Titik Waktu: {{ formatDate(currentPoint.created_at) }}
          </span>

          <div class="relative z-10 flex items-center gap-2 text-7xl font-black text-text mb-6 mt-2 tracking-tighter">
            <span style="font-family: 'Doto', sans-serif;">{{ currentPoint.balance_after ?? 0 }}</span>
            <span class="text-2xl text-text/40 font-medium tracking-normal">Pcs</span>
          </div>

          <div class="relative z-10 inline-flex items-center gap-3 px-6 py-3 rounded-full font-bold text-sm shadow-sm"
            :class="currentPoint.net_change > 0 ? 'bg-success/10 text-success border border-success/20' : (currentPoint.net_change < 0 ? 'bg-danger/10 text-danger border border-danger/20' : 'bg-secondary/10 text-text/70 border border-secondary/20')">
            <font-awesome-icon
              :icon="currentPoint.net_change > 0 ? 'fa-solid fa-arrow-trend-up' : (currentPoint.net_change < 0 ? 'fa-solid fa-arrow-trend-down' : 'fa-solid fa-minus')" />
            {{ currentPoint.net_change > 0 ? '+' : '' }}{{ currentPoint.net_change }}
            <span class="opacity-70 font-medium">({{ currentPoint.movement_type }})</span>
          </div>

          <!-- Delta Compare Panel -->
          <div v-if="compareStats"
            class="relative z-10 mt-5 bg-warning/10 border border-warning/20 rounded-xl p-4 w-full max-w-md text-left">
            <div class="text-xs font-bold text-warning/80 uppercase mb-2 flex items-center justify-between">
              <span>Hasil Perbandingan Data</span>
              <font-awesome-icon icon="fa-solid fa-code-compare" />
            </div>
            <div class="grid grid-cols-3 gap-2 text-sm">
              <div class="flex flex-col">
                <span class="text-text/40 text-[10px] uppercase">Masuk</span>
                <span class="font-bold text-success">+{{ compareStats.in }}</span>
              </div>
              <div class="flex flex-col border-l border-r border-warning/20 px-2">
                <span class="text-text/40 text-[10px] uppercase">Keluar</span>
                <span class="font-bold text-danger">-{{ compareStats.out }}</span>
              </div>
              <div class="flex flex-col text-right">
                <span class="text-text/40 text-[10px] uppercase">Selisih Bersih</span>
                <span class="font-bold"
                  :class="compareStats.net > 0 ? 'text-success' : (compareStats.net < 0 ? 'text-danger' : 'text-text/60')">
                  {{ compareStats.net > 0 ? '+' : '' }}{{ compareStats.net }}
                </span>
              </div>
            </div>
          </div>

          <button @click="toggleCompare"
            class="relative z-10 mt-5 px-4 py-2 rounded-lg text-xs font-bold transition-colors border shadow-sm"
            :class="compareIndex !== null ? 'bg-danger/10 text-danger border-danger/20 hover:bg-danger/20' : 'bg-background text-text/60 border-secondary/20 hover:bg-secondary/10'">
            <font-awesome-icon :icon="compareIndex !== null ? 'fa-solid fa-times' : 'fa-solid fa-crosshairs'"
              class="mr-1" />
            {{ compareIndex !== null ? 'Batalkan Perbandingan' : 'Bandingkan dari Titik Ini' }}
          </button>

          <div class="relative z-10 mt-6 pt-5 border-t border-secondary/10 w-full max-w-md">
            <p class="text-sm text-text/80 font-medium mb-2">Catatan Transaksi:</p>

            <div v-if="parsedNotes.ref" class="mb-3 flex justify-center">
              <span
                class="inline-flex items-center gap-2 px-3 py-1.5 bg-primary/10 text-primary border border-primary/20 rounded-lg text-xs font-bold cursor-pointer hover:bg-primary/20 transition-colors"
                title="Klik untuk melihat dokumen (Fitur Mendatang)">
                <font-awesome-icon icon="fa-solid fa-file-invoice" />
                {{ parsedNotes.ref }}
                <font-awesome-icon icon="fa-solid fa-arrow-up-right-from-square" class="ml-1 opacity-50" />
              </span>
            </div>

            <p class="text-sm text-text/60 italic leading-relaxed">
              "{{ parsedNotes.text }}"
            </p>
            <div class="flex items-center justify-center gap-2 mt-3 text-xs text-text/40">
              <font-awesome-icon icon="fa-solid fa-user" />
              Diinput oleh <span class="font-bold text-text/60">{{ currentPoint.user_name || 'System' }}</span>
            </div>
          </div>
        </div>

        <!-- Timeline Slider Control -->
        <div class="bg-background rounded-2xl p-8 border border-secondary/20 shadow-sm">

          <!-- Movement Type Filter -->
          <div v-if="availableMovementTypes.length > 1"
            class="flex flex-wrap items-center gap-2 mb-8 pb-6 border-b border-secondary/10">
            <span class="text-xs font-bold text-text/40 uppercase tracking-wider mr-2">Filter Jenis Transaksi:</span>
            <button v-for="type in availableMovementTypes" :key="type" @click="toggleMovementTypeFilter(type)"
              class="px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase transition-all border shadow-sm"
              :class="!hiddenMovementTypes.has(type) ? 'bg-primary/10 text-primary border-primary/20 hover:bg-primary/20' : 'bg-transparent text-text/40 border-secondary/20 hover:bg-secondary/10'">
              <font-awesome-icon
                :icon="!hiddenMovementTypes.has(type) ? 'fa-solid fa-check-square' : 'fa-solid fa-square'"
                class="mr-1.5 opacity-70" />
              {{ type.replace('_', ' ') }}
            </button>
          </div>

          <div v-if="reversedData.length > 0">
            <div class="flex items-center justify-between mb-6">
              <div class="flex flex-col">
                <span class="text-xs font-bold text-text/40 uppercase tracking-wider mb-1">Riwayat Lama</span>
                <span class="text-[10px] text-text/30 font-mono">{{ formatDate(reversedData[0]?.created_at) }}</span>
              </div>

              <div class="flex flex-col items-end">
                <span class="text-xs font-bold text-text/40 uppercase tracking-wider mb-1">Riwayat Baru</span>
                <span class="text-[10px] text-text/30 font-mono">{{ formatDate(reversedData[reversedData.length -
                  1]?.created_at) }}</span>
              </div>
            </div>

            <div class="relative pt-2 pb-6">
              <!-- Mini Sparkline Background -->
              <div class="w-full h-12 mb-2 relative pointer-events-none opacity-40">
                <svg viewBox="0 0 100 40" class="w-full h-full overflow-visible" preserveAspectRatio="none">
                  <polyline v-if="sparklinePoints" :points="sparklinePoints" fill="none" stroke="currentColor"
                    stroke-width="2" class="text-primary/50" vector-effect="non-scaling-stroke" />
                  <!-- Anomaly Highlights -->
                  <circle v-for="(point, idx) in anomalies" :key="'ano-' + idx" :cx="point.x" :cy="point.y" r="2.5"
                    :class="point.type === 'up' ? 'fill-success' : 'fill-danger'" vector-effect="non-scaling-stroke" />
                </svg>
                <!-- Compare Point Indicator Line -->
                <div v-if="compareSparklineX !== null"
                  class="absolute top-0 bottom-0 w-[2px] bg-warning/80 transition-all duration-100 z-0"
                  :style="`left: ${compareSparklineX}%`"></div>
                <!-- Current Point Indicator Line -->
                <div v-if="reversedData.length > 0"
                  class="absolute top-0 bottom-0 w-[2px] bg-primary/80 transition-all duration-100 z-10"
                  :style="`left: ${currentSparklineX}%`"></div>
              </div>

              <input type="range" :min="0" :max="reversedData.length - 1" v-model="sliderIndex"
                class="relative z-20 w-full h-3 bg-secondary/10 rounded-full appearance-none cursor-ew-resize accent-primary hover:bg-secondary/20 transition-colors" />
              <div
                class="absolute -bottom-2 left-1/2 -translate-x-1/2 text-xs font-bold text-primary bg-primary/10 px-3 py-1 rounded-full pointer-events-none flex items-center gap-2">
                <font-awesome-icon icon="fa-solid fa-arrows-left-right" class="text-[10px] opacity-60" />
                Geser Slider (←/→)
              </div>

              <!-- Quick Jump Controls -->
              <div class="flex items-center justify-between mt-5 px-2">
                <button @click="sliderIndex = 0"
                  class="text-[10px] uppercase font-bold text-text/40 hover:text-primary transition-colors flex items-center gap-1 group">
                  <font-awesome-icon icon="fa-solid fa-backward-step"
                    class="group-hover:-translate-x-1 transition-transform" /> Awal Halaman
                </button>
                <button @click="sliderIndex = reversedData.length - 1"
                  class="text-[10px] uppercase font-bold text-text/40 hover:text-primary transition-colors flex items-center gap-1 group">
                  Akhir Halaman <font-awesome-icon icon="fa-solid fa-forward-step"
                    class="group-hover:translate-x-1 transition-transform" />
                </button>
              </div>
            </div>
          </div> <!-- Close v-if="reversedData.length > 0" -->

          <div v-else
            class="py-10 text-center text-sm font-bold text-text/40 bg-secondary/5 rounded-xl border border-secondary/10 border-dashed">
            Semua data pada halaman ini disembunyikan oleh filter.
          </div>

          <!-- Pagination Controls -->
          <div class="flex justify-between items-center mt-8 pt-6 border-t border-secondary/10">
            <button @click="prevPage" :disabled="page === actualTotalPages"
              class="px-5 py-2.5 text-sm font-bold rounded-xl border-2 border-secondary/10 hover:bg-secondary/5 hover:border-secondary/20 disabled:opacity-40 disabled:cursor-not-allowed transition-all flex items-center gap-2 text-text/80 group">
              <font-awesome-icon icon="fa-solid fa-arrow-left"
                class="group-hover:-translate-x-1 transition-transform" />
              Ke Masa Lalu
            </button>

            <div class="flex flex-col items-center">
              <span class="text-xs font-bold text-text/40 uppercase tracking-wider mb-1">Halaman Timeline</span>
              <span class="text-sm text-text/80 font-mono bg-secondary/5 px-3 py-1 rounded-lg">{{ page }} / {{
                actualTotalPages }}</span>
            </div>

            <button @click="nextPage" :disabled="page === 1"
              class="px-5 py-2.5 text-sm font-bold rounded-xl border-2 border-secondary/10 hover:bg-secondary/5 hover:border-secondary/20 disabled:opacity-40 disabled:cursor-not-allowed transition-all flex items-center gap-2 text-text/80 group">
              Ke Masa Depan
              <font-awesome-icon icon="fa-solid fa-arrow-right"
                class="group-hover:translate-x-1 transition-transform" />
            </button>
          </div>
        </div>

      </div>
      <div v-else
        class="py-20 flex flex-col items-center justify-center text-text/40 gap-4 bg-secondary/5 rounded-3xl border border-secondary/10 dashed">
        <div class="w-16 h-16 rounded-full bg-secondary/10 flex items-center justify-center text-2xl mb-2">
          <font-awesome-icon icon="fa-solid fa-box-open" />
        </div>
        <p class="font-medium text-lg text-text/60">Belum Ada Riwayat Mutasi</p>
        <p class="text-sm">Produk ini belum memiliki pergerakan stok apapun.</p>
      </div>
    </div>
  </div>
</template>

<style scoped>
input[type=range] {
  -webkit-appearance: none;
  appearance: none;
}

input[type=range]::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  height: 24px;
  width: 24px;
  border-radius: 50%;
  background: hsl(var(--color-primary));
  cursor: ew-resize;
  border: 4px solid hsl(var(--color-background));
  box-shadow: 0 0 0 2px hsl(var(--color-primary)/0.2), 0 4px 6px -1px rgb(0 0 0 / 0.1);
  transition: transform 0.1s;
}

input[type=range]::-webkit-slider-thumb:hover {
  transform: scale(1.1);
}

input[type=range]::-webkit-slider-thumb:active {
  transform: scale(0.95);
  box-shadow: 0 0 0 4px hsl(var(--color-primary)/0.3);
}
</style>
