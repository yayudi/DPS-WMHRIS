<!-- src/components/stats/OverviewDashboard.vue -->
<script setup>
import { computed } from 'vue'
import { useAuthStore } from '@/stores/auth.js'
import { formatNumber, formatCurrency } from '@/utils/formatters.js'
import CombinedAnalyticsDashboard from '@/views/analytics/CombinedAnalyticsDashboard.vue'

const auth = useAuthStore()

const props = defineProps({
  kpiData: {
    type: Object,
    required: true
  }
})

const todayDateString = computed(() => {
  return new Date().toLocaleDateString('id-ID', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  })
})
</script>

<template>
  <div class="space-y-8 animate-fade-in">
    <!-- Header Section -->
    <div
      class="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 border-b border-secondary/20 pb-6"
    >
      <div>
        <h2 class="text-2xl font-black text-primary mb-1 tracking-tight">Executive Summary</h2>
        <p class="text-sm text-text/60">Ringkasan performa gudang dan analitik WMS secara keseluruhan.</p>
      </div>
      <div class="bg-background border border-secondary/30 px-4 py-2 rounded-full shadow-sm flex items-center gap-2">
        <font-awesome-icon icon="fa-solid fa-calendar-day" class="text-primary text-sm" />
        <span class="text-xs font-bold text-text/80 uppercase tracking-wider">{{ todayDateString }}</span>
      </div>
    </div>

    <!-- 4 KPI Cards (Glassmorphism & Gradients) -->
    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
      <!-- KPI 1 -->
      <div
        class="group relative overflow-hidden bg-background border border-secondary/20 rounded-2xl p-5 shadow-text/5 shadow-sm hover:shadow-text/10 hover:shadow-xl hover:-translate-y-1 transition-all duration-300"
      >
        <div
          class="absolute -right-6 -top-6 w-24 h-24 bg-success/10 rounded-full blur-2xl group-hover:bg-success/20 transition-all"
        ></div>
        <div class="relative z-10 flex flex-col h-full justify-between">
          <div class="flex justify-between items-start mb-3 gap-2">
            <p class="text-[11px] font-extrabold text-text/50 uppercase tracking-widest leading-tight">
              List Selesai Hari Ini
            </p>
            <div
              class="w-10 h-10 rounded-xl bg-success/10 border border-success/20 flex items-center justify-center text-success shrink-0 group-hover:scale-110 transition-transform"
            >
              <font-awesome-icon icon="fa-solid fa-check-double" class="text-lg" />
            </div>
          </div>
          <p
            class="text-3xl font-black text-text w-full truncate"
            :title="formatNumber(props.kpiData.listsCompletedToday)"
          >
            {{ formatNumber(props.kpiData.listsCompletedToday) }}
          </p>
        </div>
      </div>

      <!-- KPI 2 -->
      <div
        class="group relative overflow-hidden bg-background border border-secondary/20 rounded-2xl p-5 shadow-text/5 shadow-sm hover:shadow-text/10 hover:shadow-xl hover:-translate-y-1 transition-all duration-300"
      >
        <div
          class="absolute -right-6 -top-6 w-24 h-24 bg-primary/10 rounded-full blur-2xl group-hover:bg-primary/20 transition-all"
        ></div>
        <div class="relative z-10 flex flex-col h-full justify-between">
          <div class="flex justify-between items-start mb-3 gap-2">
            <p class="text-[11px] font-extrabold text-text/50 uppercase tracking-widest leading-tight">
              Item Terambil (PCS)
            </p>
            <div
              class="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shrink-0 group-hover:scale-110 transition-transform"
            >
              <font-awesome-icon icon="fa-solid fa-box-open" class="text-lg" />
            </div>
          </div>
          <p
            class="text-3xl font-black text-text w-full truncate"
            :title="formatNumber(props.kpiData.itemsPickedToday)"
          >
            {{ formatNumber(props.kpiData.itemsPickedToday) }}
          </p>
        </div>
      </div>

      <!-- KPI 3 -->
      <div
        class="group relative overflow-hidden bg-background border border-secondary/20 rounded-2xl p-5 shadow-text/5 shadow-sm hover:shadow-text/10 hover:shadow-xl hover:-translate-y-1 transition-all duration-300"
      >
        <div
          class="absolute -right-6 -top-6 w-24 h-24 bg-warning/10 rounded-full blur-2xl group-hover:bg-warning/20 transition-all"
        ></div>
        <div class="relative z-10 flex flex-col h-full justify-between">
          <div class="flex justify-between items-start mb-3 gap-2">
            <p class="text-[11px] font-extrabold text-text/50 uppercase tracking-widest leading-tight">
              User Aktif Gudang
            </p>
            <div
              class="w-10 h-10 rounded-xl bg-warning/10 border border-warning/20 flex items-center justify-center text-warning shrink-0 group-hover:scale-110 transition-transform"
            >
              <font-awesome-icon icon="fa-solid fa-users" class="text-lg" />
            </div>
          </div>
          <p
            class="text-3xl font-black text-text w-full truncate"
            :title="formatNumber(props.kpiData.usersActiveToday)"
          >
            {{ formatNumber(props.kpiData.usersActiveToday) }}
          </p>
        </div>
      </div>

      <!-- KPI 4 -->
      <div
        v-if="auth.hasPermission('statistic.finance.view')"
        class="group relative overflow-hidden bg-background border border-secondary/20 rounded-2xl p-5 shadow-text/5 shadow-sm hover:shadow-text/10 hover:shadow-xl hover:-translate-y-1 transition-all duration-300"
      >
        <div
          class="absolute -right-6 -top-6 w-24 h-24 bg-accent/10 rounded-full blur-2xl group-hover:bg-accent/20 transition-all"
        ></div>
        <div class="relative z-10 flex flex-col h-full justify-between">
          <div class="flex justify-between items-start mb-3 gap-2">
            <p class="text-[11px] font-extrabold text-text/50 uppercase tracking-widest leading-tight">
              Total Nilai Inventaris
            </p>
            <div
              class="w-10 h-10 rounded-xl bg-accent/10 border border-accent/20 flex items-center justify-center text-accent shrink-0 group-hover:scale-110 transition-transform"
            >
              <font-awesome-icon icon="fa-solid fa-vault" class="text-lg" />
            </div>
          </div>
          <p
            class="text-2xl font-black text-text w-full truncate"
            :title="formatCurrency(props.kpiData.totalInventoryValue)"
          >
            {{ formatCurrency(props.kpiData.totalInventoryValue) }}
          </p>
        </div>
      </div>
    </div>

    <!-- Dashboard Gabungan (Menggantikan Navigasi Laporan Analitik) -->
    <div class="mt-8 border-t border-secondary/20 pt-8">
      <CombinedAnalyticsDashboard />
    </div>
  </div>
</template>
