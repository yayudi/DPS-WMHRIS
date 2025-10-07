<script setup>
import { ref, computed } from 'vue';
import { RouterLink } from 'vue-router';

// --- STATE MANAGEMENT ---
const activeTimeRange = ref('7d'); // 7d, 30d, 90d

// --- MOCK DATA ---
const statsData = ref({
  totalStockValue: 124550000,
  stockTurnover: 4.2,
  inboundItems: 340,
  outboundItems: 412,
  lowStockItems: [
    { id: 4, name: 'Kampas Rem Depan Avanza', sku: 'SKU-004', stockDisplay: 8 },
    { id: 5, name: 'Aki GS Astra MF', sku: 'SKU-005', stockDisplay: 5 },
  ],
  topMovers: [
    { id: 3, name: 'Busi NGK BKR6E-11', outbound: 152 },
    { id: 2, name: 'Oli Mesin Shell Helix 5L', outbound: 98 },
    { id: 1, name: 'Filter Udara Sakura A-123', outbound: 75 },
  ],
  dailyMovement: [
    { day: 'Sen', inbound: 30, outbound: 45 },
    { day: 'Sel', inbound: 40, outbound: 55 },
    { day: 'Rab', inbound: 25, outbound: 30 },
    { day: 'Kam', inbound: 50, outbound: 60 },
    { day: 'Jum', inbound: 60, outbound: 80 },
    { day: 'Sab', inbound: 70, outbound: 90 },
    { day: 'Min', inbound: 15, outbound: 22 },
  ]
});

// Computed property untuk mendapatkan nilai maksimum dari pergerakan harian (untuk skala chart)
const maxDailyMovement = computed(() => {
  const allValues = statsData.value.dailyMovement.flatMap(d => [d.inbound, d.outbound]);
  return Math.max(...allValues, 1); // minimal 1 untuk menghindari pembagian dengan nol
});
</script>

<template>
  <div class="bg-secondary/20 min-h-screen p-4 sm:p-6">
    <!-- Header Halaman -->
    <div class="mb-6 flex justify-between items-center">
      <div>
        <h2 class="text-2xl font-bold text-text flex items-center gap-3">
          <font-awesome-icon icon="fa-solid fa-chart-line" />
          <span>Analitik & Laporan Stok</span>
        </h2>
        <p class="text-sm text-text/70 mt-1">Analisis performa inventaris Anda.</p>
      </div>
      <RouterLink to="/wms" class="text-sm text-text/80 hover:text-primary font-semibold flex items-center gap-2 transition-colors">
        <font-awesome-icon icon="fa-solid fa-arrow-left" />
        <span>Kembali ke WMS</span>
      </RouterLink>
    </div>

    <!-- Konten Utama -->
    <div class="space-y-6">
      <!-- Filter & KPI Utama -->
      <div class="flex flex-col md:flex-row gap-6">
        <!-- Filter -->
        <div class="w-full md:w-1/4">
          <div class="bg-background rounded-xl shadow-md border border-secondary/20 p-4 space-y-3">
            <label class="text-sm font-semibold text-text">Rentang Waktu</label>
            <div class="flex flex-col gap-2">
              <button @click="activeTimeRange = '7d'" :class="['w-full text-left text-sm p-2 rounded-md transition-colors', activeTimeRange === '7d' ? 'bg-primary text-white font-bold' : 'hover:bg-secondary/20']">7 Hari Terakhir</button>
              <button @click="activeTimeRange = '30d'" :class="['w-full text-left text-sm p-2 rounded-md transition-colors', activeTimeRange === '30d' ? 'bg-primary text-white font-bold' : 'hover:bg-secondary/20']">30 Hari Terakhir</button>
              <button @click="activeTimeRange = '90d'" :class="['w-full text-left text-sm p-2 rounded-md transition-colors', activeTimeRange === '90d' ? 'bg-primary text-white font-bold' : 'hover:bg-secondary/20']">90 Hari Terakhir</button>
              <input type="date" class="w-full text-sm p-2 rounded-md bg-background border border-secondary/50 focus:ring-primary/50 focus:border-primary" />
            </div>
          </div>
        </div>
        <!-- KPI Cards -->
        <div class="w-full md:w-3/4 grid grid-cols-2 lg:grid-cols-4 gap-6">
          <div class="bg-background rounded-xl shadow-md border border-secondary/20 p-4">
            <p class="text-sm font-semibold text-text/70">Nilai Stok Total</p>
            <p class="text-3xl font-bold text-primary">Rp {{ (statsData.totalStockValue / 1000000).toFixed(1) }} Jt</p>
          </div>
          <div class="bg-background rounded-xl shadow-md border border-secondary/20 p-4">
            <p class="text-sm font-semibold text-text/70">Perputaran Stok</p>
            <p class="text-3xl font-bold text-text">{{ statsData.stockTurnover }}x</p>
          </div>
          <div class="bg-background rounded-xl shadow-md border border-secondary/20 p-4">
            <p class="text-sm font-semibold text-text/70">Item Masuk</p>
            <p class="text-3xl font-bold text-text">{{ statsData.inboundItems }}</p>
          </div>
          <div class="bg-background rounded-xl shadow-md border border-secondary/20 p-4">
            <p class="text-sm font-semibold text-text/70">Item Keluar</p>
            <p class="text-3xl font-bold text-text">{{ statsData.outboundItems }}</p>
          </div>
        </div>
      </div>

      <!-- Charts & Data Tables -->
      <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <!-- Line Chart Pergerakan Stok -->
        <div class="lg:col-span-2 bg-background rounded-xl shadow-md border border-secondary/20 p-6">
          <h4 class="font-bold text-text mb-4">Pergerakan Stok Harian</h4>
          <div class="h-64 flex justify-between items-end gap-2">
            <!-- Mockup Chart Bar -->
            <div v-for="data in statsData.dailyMovement" :key="data.day" class="w-full flex flex-col items-center justify-end h-full">
              <div class="flex items-end w-full h-full gap-1 justify-center">
                 <div class="w-1/2 bg-green-500 rounded-t-sm" :style="{ height: `${(data.inbound / maxDailyMovement) * 100}%` }"></div>
                 <div class="w-1/2 bg-accent rounded-t-sm" :style="{ height: `${(data.outbound / maxDailyMovement) * 100}%` }"></div>
              </div>
              <p class="text-xs text-text/70 mt-2">{{ data.day }}</p>
            </div>
          </div>
           <div class="flex justify-center items-center gap-4 text-xs mt-4">
              <span class="flex items-center gap-1"><span class="w-3 h-3 bg-green-500 rounded-sm"></span> Masuk</span>
              <span class="flex items-center gap-1"><span class="w-3 h-3 bg-accent rounded-sm"></span> Keluar</span>
            </div>
        </div>

        <!-- Tabel Produk Terlaris -->
        <div class="bg-background rounded-xl shadow-md border border-secondary/20 p-6">
          <h4 class="font-bold text-text mb-4">Produk Terlaris</h4>
          <ul class="space-y-3 text-sm">
            <li v-for="item in statsData.topMovers" :key="item.id" class="flex justify-between items-center">
              <span class="text-text/90">{{ item.name }}</span>
              <span class="font-bold text-primary">{{ item.outbound }}</span>
            </li>
          </ul>
        </div>
      </div>
    </div>
  </div>
</template>
