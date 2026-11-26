<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useI18n } from '@/core/presentation/composables/useI18n'
import { analyticsApi } from '../../infrastructure/analytics.api'
import type { KpiSummary } from '../../domain/analytics.entity'
import OverviewDashboard from '@/modules/analytics/presentation/components/OverviewDashboard.vue'

const { t } = useI18n()
const kpiData = ref<KpiSummary | null>(null)
const isLoading = ref(true)
const errorMessage = ref<string | null>(null)

async function loadKpiData() {
  isLoading.value = true
  errorMessage.value = null
  try {
    const data = await analyticsApi.fetchKpiSummary()
    kpiData.value = data
  } catch (error) {
    console.error(error)
    const msg = error instanceof Error ? error.message : ''
    errorMessage.value = msg || t('analytics.dashboard.conn_error')
  } finally {
    isLoading.value = false
  }
}

onMounted(() => {
  loadKpiData()
})
</script>

<template>
  <div class="shrink-0 w-full pb-6 animate-fade-in">
    <div
      v-if="isLoading && !kpiData"
      class="bg-background rounded-2xl shadow-sm border border-secondary/20 p-6 flex flex-col items-center justify-center min-h-[24rem]"
    >
      <font-awesome-icon icon="fa-solid fa-circle-notch" spin class="text-primary text-4xl mb-3" />
      <span class="text-text/50 font-medium">{{ t('common.status.loading') }}</span>
    </div>

    <div
      v-else-if="errorMessage && !kpiData"
      class="bg-background rounded-2xl shadow-sm border border-secondary/20 p-6 flex flex-col items-center justify-center min-h-[24rem] text-danger gap-3"
    >
      <div class="bg-danger/10 p-4 rounded-full">
        <font-awesome-icon icon="fa-solid fa-triangle-exclamation" class="text-3xl" />
      </div>
      <div class="text-center">
        <h3 class="font-bold text-lg">{{ t('analytics.dashboard.error_load') }}</h3>
        <p class="text-sm opacity-80 mt-1">{{ errorMessage }}</p>
      </div>
      <button
        type="button"
        @click="loadKpiData"
        class="px-4 py-2 rounded-lg bg-primary text-background text-sm font-semibold hover:bg-primary/90 transition-colors"
      >
        {{ t('analytics.overview.refresh') }}
      </button>
    </div>

    <OverviewDashboard v-else-if="kpiData" :kpi-data="kpiData" :is-refreshing="isLoading" @refresh="loadKpiData" />
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
