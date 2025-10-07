<!-- home.vue -->
<script>
import api from '../api/axios'

export default {
  data() {
    return {
      products: [],
      error: '',
      // Data property baru untuk menyimpan hasil tes
      testResult: null,
      isTestLoading: false,
    }
  },
}
</script>
<template>
  <div class="min-h-screen bg-secondary/20">
    <header class="bg-primary text-white p-4 flex justify-between items-center shadow-md">
      <h2 class="text-xl font-bold flex items-center gap-2">
        <font-awesome-icon icon="fa-solid fa-home" />
        <span>Dashboard</span>
      </h2>
    </header>

    <main class="p-6">
      <h3 class="text-lg font-semibold text-text mb-4">Menu Utama</h3>

      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
        <router-link
          to="/absensi"
          class="bg-background shadow-md rounded-xl p-6 flex flex-col items-center justify-center hover:shadow-lg hover:-translate-y-1 transition-all"
        >
          <font-awesome-icon icon="fa-solid fa-calendar-alt" class="text-primary text-4xl mb-3" />
          <p class="font-medium text-text text-center">Absensi</p>
        </router-link>

        <router-link
          to="/wms"
          class="bg-background shadow-md rounded-xl p-6 flex flex-col items-center justify-center hover:shadow-lg hover:-translate-y-1 transition-all"
        >
          <font-awesome-icon icon="fa-solid fa-warehouse" class="text-primary text-4xl mb-3" />
          <p class="font-medium text-text text-center">WMS</p>
          <p class="font-small text-text text-center">Warehouse Management System</p>
        </router-link>

        <router-link
          to="/stats"
          class="bg-background shadow-md rounded-xl p-6 flex flex-col items-center justify-center hover:shadow-lg hover:-translate-y-1 transition-all"
        >
          <font-awesome-icon icon="fa-solid fa-chart-line" class="text-primary text-4xl mb-3" />
          <p class="font-medium text-text text-center">Statistik</p>
        </router-link>
      </div>
    </main>
  </div>
</template>
