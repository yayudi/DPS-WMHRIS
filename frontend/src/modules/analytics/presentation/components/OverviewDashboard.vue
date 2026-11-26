<script setup lang="ts">
import { computed, defineAsyncComponent, onMounted } from 'vue'
import { RouterLink } from 'vue-router'
import { useI18n } from '@/core/presentation/composables/useI18n'
import { useAuthStore } from '@/modules/auth/application/auth.store'
import { useReplenishment } from '@/modules/wms/application/useReplenishment'
import { formatNumber, formatCurrency } from '@/core/utils/formatters'
import type { KpiSummary, OperationalPulse, StockHealthSummary } from '../../domain/analytics.entity'

const VueApexCharts = defineAsyncComponent(() => import('vue3-apexcharts'))

const props = withDefaults(
  defineProps<{
    kpiData: KpiSummary
    isRefreshing?: boolean
  }>(),
  {
    isRefreshing: false
  }
)

const emit = defineEmits<{
  refresh: []
}>()

const { t, d } = useI18n()
const auth = useAuthStore()
const { onHoldCount, loadOnHoldFulfillments } = useReplenishment()

onMounted(() => {
  void loadOnHoldFulfillments()
})

const canViewFinance = computed(() => auth.hasPermission('statistic.finance.view'))

const pulse = computed<OperationalPulse>(() => {
  const raw = props.kpiData.pulse
  return {
    outboundToday: raw?.outboundToday ?? props.kpiData.itemsPickedToday ?? 0,
    outboundYesterday: raw?.outboundYesterday ?? 0,
    inboundToday: raw?.inboundToday ?? 0,
    inboundYesterday: raw?.inboundYesterday ?? 0,
    transferToday: raw?.transferToday ?? 0,
    listsCompletedToday: raw?.listsCompletedToday ?? props.kpiData.listsCompletedToday ?? 0,
    listsCompletedYesterday: raw?.listsCompletedYesterday ?? 0,
    usersActiveToday: raw?.usersActiveToday ?? props.kpiData.usersActiveToday ?? 0,
    pendingStockRequests: raw?.pendingStockRequests ?? 0,
    totalActiveSkus: raw?.totalActiveSkus ?? 0,
    totalInventoryValue: raw?.totalInventoryValue ?? props.kpiData.totalInventoryValue ?? 0
  }
})

const stockHealth = computed<StockHealthSummary>(() => ({
  criticalCount: props.kpiData.stockHealth?.criticalCount ?? 0,
  warningCount: props.kpiData.stockHealth?.warningCount ?? 0,
  safeCount: props.kpiData.stockHealth?.safeCount ?? 0,
  deadOverstockCount: props.kpiData.stockHealth?.deadOverstockCount ?? 0,
  emptyCount: props.kpiData.stockHealth?.emptyCount ?? 0,
  negativeCount: props.kpiData.stockHealth?.negativeCount ?? 0
}))

const criticalSkus = computed(() => props.kpiData.watchlist?.criticalSkus ?? [])
const duplicateLocations = computed(() => props.kpiData.watchlist?.duplicateLocations ?? [])
const topLoadedLocations = computed(() => props.kpiData.watchlist?.topLoadedLocations ?? [])
const movementTrend = computed(() => props.kpiData.movementTrend ?? [])
const buildingDistribution = computed(() => props.kpiData.buildingDistribution ?? [])

const todayDateString = computed(() =>
  d(new Date(), {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  })
)

interface DeltaMeta {
  text: string
  badgeClass: string
}

function formatDelta(today: number, yesterday: number): DeltaMeta {
  if (yesterday <= 0) {
    if (today > 0) {
      return {
        text: t('analytics.overview.delta_new'),
        badgeClass: 'bg-success/10 text-success border-success/20'
      }
    }
    return {
      text: t('analytics.overview.delta_flat'),
      badgeClass: 'bg-secondary/20 text-text/60 border-secondary/30'
    }
  }

  const pct = Math.round(((today - yesterday) / yesterday) * 100)
  if (pct > 0) {
    return {
      text: `+${pct}%`,
      badgeClass: 'bg-success/10 text-success border-success/20'
    }
  }
  if (pct < 0) {
    return {
      text: `${pct}%`,
      badgeClass: 'bg-danger/10 text-danger border-danger/20'
    }
  }
  return {
    text: '0%',
    badgeClass: 'bg-secondary/20 text-text/60 border-secondary/30'
  }
}

const outboundDelta = computed(() => formatDelta(pulse.value.outboundToday, pulse.value.outboundYesterday))
const inboundDelta = computed(() => formatDelta(pulse.value.inboundToday, pulse.value.inboundYesterday))

const totalHealthSkus = computed(() => {
  const h = stockHealth.value
  return h.criticalCount + h.warningCount + h.safeCount + h.deadOverstockCount + h.emptyCount + h.negativeCount
})

const healthSegments = computed(() => {
  const total = totalHealthSkus.value || 1
  const h = stockHealth.value
  return [
    {
      key: 'critical',
      label: t('analytics.overview.health_critical'),
      count: h.criticalCount,
      pct: (h.criticalCount / total) * 100,
      barClass: 'bg-danger',
      pillClass: 'bg-danger/10 text-danger border-danger/20'
    },
    {
      key: 'warning',
      label: t('analytics.overview.health_warning'),
      count: h.warningCount,
      pct: (h.warningCount / total) * 100,
      barClass: 'bg-warning',
      pillClass: 'bg-warning/10 text-warning border-warning/20'
    },
    {
      key: 'dead',
      label: t('analytics.overview.health_dead'),
      count: h.deadOverstockCount,
      pct: (h.deadOverstockCount / total) * 100,
      barClass: 'bg-accent',
      pillClass: 'bg-accent/10 text-accent border-accent/20'
    },
    {
      key: 'empty',
      label: t('analytics.overview.health_empty'),
      count: h.emptyCount,
      pct: (h.emptyCount / total) * 100,
      barClass: 'bg-secondary',
      pillClass: 'bg-secondary/20 text-text/70 border-secondary/30'
    },
    {
      key: 'negative',
      label: t('analytics.overview.health_negative'),
      count: h.negativeCount,
      pct: (h.negativeCount / total) * 100,
      barClass: 'bg-rose-700',
      pillClass: 'bg-danger/15 text-danger border-danger/30'
    },
    {
      key: 'safe',
      label: t('analytics.overview.health_safe'),
      count: h.safeCount,
      pct: (h.safeCount / total) * 100,
      barClass: 'bg-success',
      pillClass: 'bg-success/10 text-success border-success/20'
    }
  ]
})

const maxBuildingQty = computed(() =>
  Math.max(...buildingDistribution.value.map(b => b.total_quantity), 1)
)

const trendSeries = computed(() => [
  {
    name: t('analytics.overview.series_inbound'),
    data: movementTrend.value.map(item => item.total_inbound)
  },
  {
    name: t('analytics.overview.series_outbound'),
    data: movementTrend.value.map(item => item.total_outbound)
  },
  {
    name: t('analytics.overview.series_transfer'),
    data: movementTrend.value.map(item => item.total_transfer)
  }
])

const trendChartOptions = computed(() => ({
  chart: {
    type: 'area',
    height: 290,
    toolbar: { show: false },
    background: 'transparent',
    fontFamily: 'inherit'
  },
  colors: ['#10b981', '#3b82f6', '#f59e0b'],
  stroke: { curve: 'smooth', width: 2 },
  fill: {
    type: 'gradient',
    gradient: { opacityFrom: 0.35, opacityTo: 0.05 }
  },
  dataLabels: { enabled: false },
  xaxis: {
    categories: movementTrend.value.map(item => item.date.slice(5)),
    labels: { style: { colors: '#64748b', fontSize: '11px' } }
  },
  yaxis: {
    labels: {
      style: { colors: '#64748b', fontSize: '11px' },
      formatter: (val: number) => formatNumber(Math.round(val))
    }
  },
  legend: { position: 'top', horizontalAlign: 'right', fontSize: '12px' },
  grid: { borderColor: 'rgba(148, 163, 184, 0.15)', strokeDashArray: 4 }
}))
</script>

<template>
  <div class="space-y-6 animate-fade-in">
    <!-- Header Section -->
    <div class="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-secondary/20 pb-5">
      <div>
        <h2 class="text-2xl font-black text-primary tracking-tight">{{ t('analytics.overview.title') }}</h2>
        <p class="text-sm text-text/60 mt-0.5">{{ t('analytics.overview.subtitle') }}</p>
      </div>
      <div class="flex flex-wrap items-center gap-2.5">
        <div class="bg-background border border-secondary/30 px-3.5 py-2 rounded-full shadow-sm flex items-center gap-2">
          <font-awesome-icon icon="fa-solid fa-calendar-day" class="text-primary text-xs" />
          <span class="text-xs font-bold text-text/80 uppercase tracking-wider">{{ todayDateString }}</span>
        </div>
        <button
          type="button"
          :disabled="isRefreshing"
          @click="emit('refresh')"
          class="inline-flex items-center gap-2 px-3.5 py-2 rounded-full border border-secondary/30 bg-background hover:bg-primary/10 hover:text-primary hover:border-primary/30 text-xs font-bold text-text/80 transition-colors disabled:opacity-50"
        >
          <font-awesome-icon icon="fa-solid fa-rotate" :spin="isRefreshing" />
          <span>{{ t('analytics.overview.refresh') }}</span>
        </button>
      </div>
    </div>

    <!-- Block 1: Operational Pulse Cards -->
    <div
      class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4"
      :class="canViewFinance ? 'xl:grid-cols-5' : 'xl:grid-cols-4'"
    >
      <!-- Card 1: Outbound Today -->
      <router-link
        to="/analytics/stock-movement"
        class="group relative overflow-hidden bg-background border border-secondary/20 rounded-2xl p-4 shadow-sm hover:border-primary/40 hover:shadow-md transition-all"
      >
        <div class="flex justify-between items-start gap-2 mb-2">
          <span class="text-[11px] font-extrabold text-text/50 uppercase tracking-wider leading-tight">
            {{ t('analytics.overview.pulse_outbound_today') }}
          </span>
          <span class="px-2 py-0.5 text-[10px] font-bold rounded-full border shrink-0" :class="outboundDelta.badgeClass">
            {{ outboundDelta.text }}
          </span>
        </div>
        <p class="text-2xl font-black text-text truncate">{{ formatNumber(pulse.outboundToday) }}</p>
        <p class="text-xs text-text/60 mt-1">
          {{ t('analytics.overview.lists_completed_sub', { count: formatNumber(pulse.listsCompletedToday) }) }}
        </p>
      </router-link>

      <!-- Card 2: Inbound & Transfer Today -->
      <router-link
        to="/wms/batch-log"
        class="group relative overflow-hidden bg-background border border-secondary/20 rounded-2xl p-4 shadow-sm hover:border-success/40 hover:shadow-md transition-all"
      >
        <div class="flex justify-between items-start gap-2 mb-2">
          <span class="text-[11px] font-extrabold text-text/50 uppercase tracking-wider leading-tight">
            {{ t('analytics.overview.pulse_inbound_today') }}
          </span>
          <span class="px-2 py-0.5 text-[10px] font-bold rounded-full border shrink-0" :class="inboundDelta.badgeClass">
            {{ inboundDelta.text }}
          </span>
        </div>
        <p class="text-2xl font-black text-text truncate">{{ formatNumber(pulse.inboundToday) }}</p>
        <p class="text-xs text-text/60 mt-1">
          {{ t('analytics.overview.transfer_sub', { count: formatNumber(pulse.transferToday) }) }}
        </p>
      </router-link>

      <!-- Card 3: Operational Queue (Action Required) -->
      <div class="min-w-0 bg-background border border-secondary/20 rounded-2xl p-4 shadow-sm flex flex-col justify-between">
        <div class="flex justify-between items-center mb-2">
          <span class="text-[11px] font-extrabold text-text/50 uppercase tracking-wider leading-tight">
            {{ t('analytics.overview.pulse_operational_queue') }}
          </span>
          <font-awesome-icon icon="fa-solid fa-bell" class="text-warning text-sm" />
        </div>
        <div class="space-y-1.5">
          <router-link
            to="/wms/replenishment"
            class="flex items-center justify-between text-xs px-2.5 py-1.5 rounded-lg bg-secondary/10 hover:bg-primary/10 hover:text-primary transition-colors"
          >
            <span class="font-medium">{{ t('analytics.overview.queue_replenishment') }}</span>
            <span
              class="px-2 py-0.5 rounded-full text-[11px] font-bold"
              :class="onHoldCount > 0 ? 'bg-warning text-background' : 'bg-secondary/30 text-text/70'"
            >
              {{ formatNumber(onHoldCount) }}
            </span>
          </router-link>
          <router-link
            to="/wms/stock-requests"
            class="flex items-center justify-between text-xs px-2.5 py-1.5 rounded-lg bg-secondary/10 hover:bg-primary/10 hover:text-primary transition-colors"
          >
            <span class="font-medium">{{ t('analytics.overview.queue_stock_requests') }}</span>
            <span
              class="px-2 py-0.5 rounded-full text-[11px] font-bold"
              :class="pulse.pendingStockRequests > 0 ? 'bg-primary text-background' : 'bg-secondary/30 text-text/70'"
            >
              {{ formatNumber(pulse.pendingStockRequests) }}
            </span>
          </router-link>
        </div>
      </div>

      <!-- Card 4: Warehouse Activity & SKU Coverage -->
      <div class="min-w-0 bg-background border border-secondary/20 rounded-2xl p-4 shadow-sm">
        <div class="flex justify-between items-start gap-2 mb-2">
          <span class="text-[11px] font-extrabold text-text/50 uppercase tracking-wider leading-tight">
            {{ t('analytics.overview.active_users_today') }}
          </span>
          <div class="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
            <font-awesome-icon icon="fa-solid fa-users" class="text-sm" />
          </div>
        </div>
        <p class="text-2xl font-black text-text truncate">{{ formatNumber(pulse.usersActiveToday) }}</p>
        <p class="text-xs text-text/60 mt-1">
          {{ t('analytics.overview.active_skus_sub', { count: formatNumber(pulse.totalActiveSkus) }) }}
        </p>
      </div>

      <!-- Card 5: Inventory Value (Permission-gated) -->
      <router-link
        v-if="canViewFinance"
        to="/analytics/inventory-value"
        class="group min-w-0 bg-background border border-secondary/20 rounded-2xl p-4 shadow-sm hover:border-accent/40 hover:shadow-md transition-all"
      >
        <div class="flex justify-between items-start gap-2 mb-2">
          <span class="text-[11px] font-extrabold text-text/50 uppercase tracking-wider leading-tight">
            {{ t('analytics.overview.total_inventory_value') }}
          </span>
          <div class="w-8 h-8 rounded-lg bg-accent/10 text-accent flex items-center justify-center shrink-0">
            <font-awesome-icon icon="fa-solid fa-vault" class="text-sm" />
          </div>
        </div>
        <p class="text-xl font-black text-text truncate" :title="formatCurrency(pulse.totalInventoryValue)">
          {{ formatCurrency(pulse.totalInventoryValue) }}
        </p>
        <p class="text-xs text-accent font-medium mt-1">{{ t('analytics.overview.view_valuation') }} →</p>
      </router-link>
    </div>

    <!-- Block 2: Macro Visualizations -->
    <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <!-- Left 2/3: 14-Day Movement Trend -->
      <div class="lg:col-span-2 bg-background border border-secondary/20 rounded-2xl p-5 shadow-sm">
        <div class="flex items-center justify-between gap-2 mb-4">
          <div>
            <h3 class="font-bold text-base text-text">{{ t('analytics.overview.trend_title') }}</h3>
            <p class="text-xs text-text/60">{{ t('analytics.overview.trend_subtitle') }}</p>
          </div>
          <router-link to="/analytics/stock-timeline" class="text-xs font-semibold text-primary hover:underline shrink-0">
            {{ t('analytics.overview.view_all') }} →
          </router-link>
        </div>

        <VueApexCharts
          v-if="movementTrend.length > 0"
          type="area"
          height="290"
          :options="trendChartOptions"
          :series="trendSeries"
        />
        <div v-else class="h-64 flex items-center justify-center text-sm text-text/50">
          {{ t('analytics.overview.empty_trend') }}
        </div>
      </div>

      <!-- Right 1/3: 30-Day Stock Health & Building Distribution -->
      <div class="bg-background border border-secondary/20 rounded-2xl p-5 shadow-sm flex flex-col justify-between gap-5">
        <div>
          <div class="flex items-center justify-between gap-2 mb-3">
            <h3 class="font-bold text-base text-text">{{ t('analytics.overview.health_title') }}</h3>
            <router-link to="/analytics/stock-movement" class="text-xs font-semibold text-primary hover:underline">
              {{ t('analytics.overview.view_all') }} →
            </router-link>
          </div>

          <!-- Stacked Bar -->
          <div class="w-full h-3 rounded-full overflow-hidden flex bg-secondary/20 mb-4">
            <div
              v-for="seg in healthSegments"
              :key="seg.key"
              :style="{ width: `${seg.pct}%` }"
              :class="seg.barClass"
              :title="`${seg.label}: ${seg.count}`"
            ></div>
          </div>

          <div class="grid grid-cols-2 gap-2">
            <router-link
              v-for="seg in healthSegments"
              :key="seg.key"
              to="/analytics/stock-movement"
              class="flex items-center justify-between px-2.5 py-1.5 rounded-lg border text-xs transition-opacity hover:opacity-85"
              :class="seg.pillClass"
            >
              <span class="font-medium truncate">{{ seg.label }}</span>
              <span class="font-black ml-1">{{ formatNumber(seg.count) }}</span>
            </router-link>
          </div>
        </div>

        <div class="border-t border-secondary/20 pt-4">
          <div class="flex items-center justify-between gap-2 mb-3">
            <h4 class="font-bold text-sm text-text">{{ t('analytics.overview.building_dist_title') }}</h4>
            <router-link to="/analytics/stock-distribution" class="text-xs font-semibold text-primary hover:underline">
              {{ t('analytics.overview.view_all') }} →
            </router-link>
          </div>
          <div v-if="buildingDistribution.length > 0" class="space-y-2.5">
            <div v-for="b in buildingDistribution.slice(0, 4)" :key="b.building" class="space-y-1">
              <div class="flex justify-between text-xs">
                <span class="font-semibold text-text">{{ b.building }}</span>
                <span class="text-text/60">{{ formatNumber(b.total_quantity) }} pcs · {{ b.total_skus }} SKU</span>
              </div>
              <div class="w-full h-1.5 rounded-full bg-secondary/20 overflow-hidden">
                <div
                  class="h-full bg-primary rounded-full"
                  :style="{ width: `${Math.max((b.total_quantity / maxBuildingQty) * 100, 4)}%` }"
                ></div>
              </div>
            </div>
          </div>
          <p v-else class="text-xs text-text/50">{{ t('analytics.overview.empty_watchlist') }}</p>
        </div>
      </div>
    </div>

    <!-- Block 3: Actionable Top-5 Watchlists -->
    <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <!-- Watchlist 1: Critical SKUs (DOI <= 7 Days) -->
      <div class="bg-background border border-secondary/20 rounded-2xl p-5 shadow-sm flex flex-col">
        <div class="flex items-center justify-between gap-2 mb-3">
          <h3 class="font-bold text-sm text-text flex items-center gap-2">
            <font-awesome-icon icon="fa-solid fa-fire" class="text-danger" />
            <span>{{ t('analytics.overview.watchlist_critical_title') }}</span>
          </h3>
          <router-link to="/analytics/stock-movement" class="text-xs font-semibold text-primary hover:underline shrink-0">
            {{ t('analytics.overview.view_all') }} →
          </router-link>
        </div>
        <div v-if="criticalSkus.length > 0" class="divide-y divide-secondary/15 text-xs">
          <div v-for="item in criticalSkus" :key="item.product_id" class="py-2.5 flex items-center justify-between gap-2">
            <div class="min-w-0">
              <p class="font-bold text-text truncate">{{ item.sku }}</p>
              <p class="text-text/60 truncate">{{ item.name }}</p>
            </div>
            <div class="text-right shrink-0">
              <span class="inline-block px-2 py-0.5 rounded-full bg-danger/10 text-danger font-bold">
                {{ item.days_of_inventory }} {{ t('analytics.overview.days_short') }}
              </span>
              <p class="text-[11px] text-text/50 mt-0.5">{{ formatNumber(item.current_stock) }} pcs</p>
            </div>
          </div>
        </div>
        <p v-else class="text-xs text-text/50 py-6 text-center">{{ t('analytics.overview.empty_watchlist') }}</p>
      </div>

      <!-- Watchlist 2: Scattered / Duplicate Locations -->
      <div class="bg-background border border-secondary/20 rounded-2xl p-5 shadow-sm flex flex-col">
        <div class="flex items-center justify-between gap-2 mb-3">
          <h3 class="font-bold text-sm text-text flex items-center gap-2">
            <font-awesome-icon icon="fa-solid fa-clone" class="text-warning" />
            <span>{{ t('analytics.overview.watchlist_duplicate_title') }}</span>
          </h3>
          <router-link to="/analytics/location-capacity" class="text-xs font-semibold text-primary hover:underline shrink-0">
            {{ t('analytics.overview.view_all') }} →
          </router-link>
        </div>
        <div v-if="duplicateLocations.length > 0" class="divide-y divide-secondary/15 text-xs">
          <div
            v-for="item in duplicateLocations"
            :key="`${item.product_id}-${item.purpose}`"
            class="py-2.5 flex items-center justify-between gap-2"
          >
            <div class="min-w-0">
              <p class="font-bold text-text truncate">{{ item.sku }} · {{ item.name }}</p>
              <p class="text-text/60 truncate" :title="item.locations">{{ item.locations }}</p>
            </div>
            <div class="text-right shrink-0">
              <span class="inline-block px-2 py-0.5 rounded-full bg-warning/15 text-warning font-bold">
                {{ item.location_count }} {{ t('analytics.overview.locations_unit') }}
              </span>
              <p class="text-[11px] text-text/50 mt-0.5">{{ item.purpose || '-' }}</p>
            </div>
          </div>
        </div>
        <p v-else class="text-xs text-text/50 py-6 text-center">{{ t('analytics.overview.empty_watchlist') }}</p>
      </div>

      <!-- Watchlist 3: Top Loaded Locations -->
      <div class="bg-background border border-secondary/20 rounded-2xl p-5 shadow-sm flex flex-col">
        <div class="flex items-center justify-between gap-2 mb-3">
          <h3 class="font-bold text-sm text-text flex items-center gap-2">
            <font-awesome-icon icon="fa-solid fa-boxes-stacked" class="text-primary" />
            <span>{{ t('analytics.overview.watchlist_loaded_title') }}</span>
          </h3>
          <router-link to="/analytics/location-capacity" class="text-xs font-semibold text-primary hover:underline shrink-0">
            {{ t('analytics.overview.view_all') }} →
          </router-link>
        </div>
        <div v-if="topLoadedLocations.length > 0" class="divide-y divide-secondary/15 text-xs">
          <div v-for="loc in topLoadedLocations" :key="loc.location_id" class="py-2.5 flex items-center justify-between gap-2">
            <div class="min-w-0">
              <p class="font-bold text-text truncate">{{ loc.code }}</p>
              <p class="text-text/60 truncate">{{ loc.building }} · {{ loc.purpose || '-' }}</p>
            </div>
            <div class="text-right shrink-0">
              <p class="font-bold text-primary">{{ formatNumber(loc.total_quantity) }} pcs</p>
              <p class="text-[11px] text-text/50">{{ loc.total_products }} SKU · {{ formatNumber(loc.total_weight_kg, 1) }} kg</p>
            </div>
          </div>
        </div>
        <p v-else class="text-xs text-text/50 py-6 text-center">{{ t('analytics.overview.empty_watchlist') }}</p>
      </div>
    </div>
  </div>
</template>
