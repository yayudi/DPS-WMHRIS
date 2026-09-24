<script setup>
import { ref, onMounted } from 'vue'
import { fetchKpiSummary } from '@/api/helpers/stats.js'
import OverviewDashboard from '@/components/stats/OverviewDashboard.vue'

const kpiData = ref(null)
const isLoading = ref(true)
const errorMessage = ref(null)

async function loadKpiData() {
  isLoading.value = true
  errorMessage.value = null
  try {
    const data = await fetchKpiSummary()
    kpiData.value = data
  } catch (error) {
    console.error(error)
    errorMessage.value = error.message || 'Gagal terhubung ke server.'
  } finally {
    isLoading.value = false
  }
}

onMounted(() => {
  loadKpiData()
})
</script>

<template>
  <div class="bg-background rounded-xl shadow-md border border-secondary/20 p-6 min-h-[calc(50vh+20rem)] relative overflow-visible animate-fade-in">
    <div v-if="isLoading" class="flex flex-col items-center justify-center h-80">
      <font-awesome-icon icon="fa-solid fa-circle-notch" spin class="text-primary text-4xl mb-3" />
      <span class="text-text/50 font-medium">Memuat Data...</span>
    </div>

    <div v-else-if="errorMessage" class="flex flex-col items-center justify-center h-80 text-danger">
      <div class="bg-danger/10 p-4 rounded-full mb-3">
        <font-awesome-icon icon="fa-solid fa-triangle-exclamation" class="text-3xl" />
      </div>
      <h3 class="font-bold text-lg">Gagal Memuat Data</h3>
      <p class="text-sm opacity-80 mt-1">{{ errorMessage }}</p>
    </div>

    <template v-else>
      <OverviewDashboard
        v-if="kpiData"
        :kpi-data="kpiData"
      />
    </template>
  </div>
</template>

<style scoped>
.animate-fade-in {
  animation: fadeIn 0.4s ease-out forwards;
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(5px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
</style>
