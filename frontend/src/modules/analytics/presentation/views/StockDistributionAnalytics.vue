<template>
  <div class="space-y-6">
    <div class="flex items-center justify-between">
      <h2 class="text-2xl font-bold leading-7 text-text sm:truncate sm:text-3xl sm:tracking-tight">
        {{ t('analytics.distribution.title') }}
      </h2>
      <div class="flex space-x-3">
        <button
          @click="fetchData"
          type="button"
          class="inline-flex items-center rounded-md bg-background px-3 py-2 text-sm font-semibold text-text shadow-sm border border-secondary/30 hover:bg-secondary/5"
          :disabled="loading"
        >
          <font-awesome-icon v-if="loading" icon="fa-solid fa-spinner" class="animate-spin -ml-1 mr-2 text-text/50" />
          <font-awesome-icon v-else icon="fa-solid fa-rotate" class="-ml-0.5 mr-1.5 text-text/40" />
          {{ t('common.btn.refresh') }}
        </button>
      </div>
    </div>

    <!-- Filters -->
    <div class="bg-background p-4 rounded-lg shadow-sm border border-secondary/20">
      <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div>
          <label class="block text-sm font-medium leading-6 text-text mb-1">{{ t('common.label.purpose') }}</label>
          <TriStateSelect
            v-model="filters.purpose"
            :options="purposeOptions"
            label="label"
            track-by="value"
            :placeholder="t('common.filter.all_purposes')"
            @update:model-value="fetchData"
          />
        </div>
        <div>
          <label class="block text-sm font-medium leading-6 text-text mb-1">{{ t('common.label.building') }}</label>
          <TriStateSelect
            v-model="filters.building"
            :options="buildingOptions"
            label="label"
            track-by="value"
            :placeholder="t('common.filter.all_buildings')"
            @update:model-value="fetchData"
            :disabled="!filters.purpose.include.length && !filters.purpose.exclude.length && uniquePurposes.length > 0"
          />
        </div>
        <div>
          <label class="block text-sm font-medium leading-6 text-text mb-1">{{ t('common.label.floor') }}</label>
          <TriStateSelect
            v-model="filters.floor"
            :options="floorOptions"
            label="label"
            track-by="value"
            :placeholder="t('common.filter.all_floors')"
            @update:model-value="fetchData"
            :disabled="!filters.building.include.length && !filters.building.exclude.length"
          />
        </div>
      </div>
    </div>

    <!-- KPIs -->
    <div class="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
      <div class="overflow-hidden rounded-lg bg-background px-4 py-5 shadow-sm border border-secondary/20 sm:p-6">
        <dt class="truncate text-sm font-medium text-text/60">{{ t('analytics.distribution.kpi_active_locations') }}</dt>
        <dd class="mt-1 text-3xl font-semibold tracking-tight text-text">{{ locationLoads.length }}</dd>
      </div>
      <div class="overflow-hidden rounded-lg bg-background px-4 py-5 shadow-sm border border-secondary/20 sm:p-6">
        <dt class="truncate text-sm font-medium text-text/60">{{ t('analytics.distribution.kpi_avg_products_per_loc') }}</dt>
        <dd class="mt-1 text-3xl font-semibold tracking-tight text-text">{{ avgProductsPerLocation }}</dd>
      </div>
      <div class="overflow-hidden rounded-lg bg-background px-4 py-5 shadow-sm border border-secondary/20 sm:p-6">
        <dt class="truncate text-sm font-medium text-text/60">{{ t('analytics.distribution.kpi_scattered_products') }}</dt>
        <dd class="mt-1 text-3xl font-semibold tracking-tight text-text">{{ duplicateProducts.length }}</dd>
      </div>
      <div class="overflow-hidden rounded-lg bg-background px-4 py-5 shadow-sm border border-secondary/20 sm:p-6">
        <dt class="truncate text-sm font-medium text-text/60">{{ t('analytics.distribution.kpi_total_stock_qty') }}</dt>
        <dd class="mt-1 text-3xl font-semibold tracking-tight text-text">{{ formatNumber(totalQuantity) }}</dd>
      </div>
    </div>

    <div class="grid grid-cols-1 xl:grid-cols-2 gap-6">
      <!-- Data Table: Beban Lokasi -->
      <div class="bg-background rounded-lg shadow-sm border border-secondary/20 overflow-hidden flex flex-col">
        <div class="px-4 py-5 sm:px-6 border-b border-secondary/20">
          <h3 class="text-base font-semibold leading-6 text-text">{{ t('analytics.distribution.table_load_title') }}</h3>
          <p class="mt-1 text-sm text-text/60">{{ t('analytics.distribution.table_load_sub') }}</p>
        </div>
        <div class="overflow-x-auto flex-1 max-h-[600px] custom-scrollbar">
          <table class="min-w-full divide-y divide-secondary">
            <thead class="bg-secondary sticky top-0 z-10">
              <tr>
                <th
                  scope="col"
                  class="py-3.5 pl-4 pr-3 text-left text-sm font-semibold text-text sm:pl-6"
                  :title="t('analytics.distribution.col_code_tooltip')"
                >
                  {{ t('analytics.distribution.col_code') }}
                </th>
                <th
                  scope="col"
                  class="px-3 py-3.5 text-left text-sm font-semibold text-text"
                  :title="t('analytics.distribution.col_building_floor_tooltip')"
                >
                  {{ t('analytics.distribution.col_building_floor') }}
                </th>
                <th
                  scope="col"
                  class="px-3 py-3.5 text-left text-sm font-semibold text-text"
                  :title="t('analytics.distribution.col_purpose_tooltip')"
                >
                  {{ t('common.label.purpose') }}
                </th>
                <th
                  scope="col"
                  class="px-3 py-3.5 text-right text-sm font-semibold text-text"
                  :title="t('analytics.distribution.col_product_count_tooltip')"
                >
                  {{ t('analytics.distribution.col_product_count') }}
                </th>
                <th
                  scope="col"
                  class="px-3 py-3.5 text-right text-sm font-semibold text-text"
                  :title="t('analytics.distribution.col_quantity_tooltip')"
                >
                  {{ t('analytics.distribution.col_quantity') }}
                </th>
              </tr>
            </thead>
            <tbody class="divide-y divide-secondary/20 bg-background">
              <tr v-for="loc in locationLoads" :key="loc.location_id">
                <td class="whitespace-nowrap py-4 pl-4 pr-3 text-sm font-medium text-text sm:pl-6">{{ loc.code }}</td>
                <td class="whitespace-nowrap px-3 py-4 text-sm text-text/60">
                  <span
                    class="inline-flex items-center rounded-md px-2 py-1 text-xs font-medium ring-1 ring-inset"
                    :class="getLocationBuildingColorClass(loc.building)"
                  >
                    {{ loc.building }} <span v-if="loc.floor" class="ml-1 opacity-75"> - {{ t('common.label.floor_abbr') }} {{ loc.floor }}</span>
                  </span>
                </td>
                <td class="whitespace-nowrap px-3 py-4 text-sm text-text/60">
                  <span
                    class="inline-flex items-center rounded-md px-2 py-1 text-xs font-medium ring-1 ring-inset"
                    :class="getLocationPurposeColorClass(loc.purpose)"
                    >{{ loc.purpose || 'N/A' }}</span
                  >
                </td>
                <td class="whitespace-nowrap px-3 py-4 text-sm text-text/60 text-right">
                  {{ formatNumber(loc.total_products) }}
                </td>
                <td class="whitespace-nowrap px-3 py-4 text-sm text-text/60 text-right">
                  {{ formatNumber(loc.total_quantity) }}
                </td>
              </tr>
              <tr v-if="locationLoads.length === 0">
                <td colspan="5" class="px-3 py-4 text-sm text-text/50 text-center">{{ t('analytics.distribution.no_location_data') }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- Data Table: Sebaran Lokasi -->
      <div class="bg-background rounded-lg shadow-sm border border-secondary/20 overflow-hidden flex flex-col">
        <div class="px-4 py-5 sm:px-6 border-b border-secondary/20">
          <h3 class="text-base font-semibold leading-6 text-text">{{ t('analytics.distribution.table_scatter_title') }}</h3>
          <p class="mt-1 text-sm text-text/60">
            {{ t('analytics.distribution.table_scatter_sub') }}
          </p>
        </div>
        <div class="overflow-x-auto flex-1 max-h-[600px] custom-scrollbar">
          <table class="min-w-full divide-y divide-secondary">
            <thead class="bg-secondary sticky top-0 z-10">
              <tr>
                <th
                  scope="col"
                  class="py-3.5 pl-4 pr-3 text-left text-sm font-semibold text-text sm:pl-6"
                  :title="t('analytics.distribution.col_product_tooltip')"
                >
                  {{ t('analytics.distribution.col_product') }}
                </th>
                <th
                  scope="col"
                  class="px-3 py-3.5 text-left text-sm font-semibold text-text"
                  :title="t('analytics.distribution.col_purpose_tooltip')"
                >
                  {{ t('common.label.purpose') }}
                </th>
                <th
                  scope="col"
                  class="px-3 py-3.5 text-center text-sm font-semibold text-text"
                  :title="t('analytics.distribution.col_location_count_tooltip')"
                >
                  {{ t('analytics.distribution.col_location_count') }}
                </th>
                <th
                  scope="col"
                  class="px-3 py-3.5 text-left text-sm font-semibold text-text"
                  :title="t('analytics.distribution.col_locations_list_tooltip')"
                >
                  {{ t('analytics.distribution.col_locations_list') }}
                </th>
              </tr>
            </thead>
            <tbody class="divide-y divide-secondary/20 bg-background">
              <tr v-for="item in duplicateProducts" :key="item.product_id + item.purpose">
                <td class="py-4 pl-4 pr-3 text-sm sm:pl-6">
                  <div class="font-medium text-text">{{ item.sku }}</div>
                  <div class="text-text/60 truncate max-w-[200px]" :title="item.name">{{ item.name }}</div>
                </td>
                <td class="whitespace-nowrap px-3 py-4 text-sm text-text/60">
                  <span
                    class="inline-flex items-center rounded-md bg-primary/10 px-2 py-1 text-xs font-medium text-primary ring-1 ring-inset ring-primary/20"
                    >{{ item.purpose || 'N/A' }}</span
                  >
                </td>
                <td class="whitespace-nowrap px-3 py-4 text-sm text-text text-center font-semibold">
                  {{ item.location_count }}
                </td>
                <td class="px-3 py-4 text-sm text-text/60 max-w-[250px] leading-relaxed">
                  <span
                    v-for="loc in item.locations.split(', ')"
                    :key="loc"
                    class="inline-block mr-1 mb-1 rounded bg-secondary/10 px-1.5 py-0.5 text-xs text-text/70 border border-secondary/20"
                  >
                    {{ loc }}
                  </span>
                </td>
              </tr>
              <tr v-if="duplicateProducts.length === 0">
                <td colspan="4" class="px-3 py-4 text-sm text-text/50 text-center">
                  {{ t('analytics.distribution.no_scattered_data') }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, computed } from 'vue'
import { useI18n } from '@/core/infrastructure/localization'
import { useToast } from '@/core/presentation/composables/useToast'
import { analyticsApi } from '../../infrastructure/analytics.api'
import TriStateSelect from '@/core/presentation/components/ui/TriStateSelect.vue'
import { formatNumber, getLocationPurposeColorClass, getLocationBuildingColorClass } from '@/core/utils/formatters'
import { useLocationHierarchyFilter } from '../composables/useLocationHierarchyFilter'

const { t } = useI18n()
const { toast } = useToast()
const loading = ref(false)
const locationLoads = ref([])
const duplicateProducts = ref([])
const filters = ref({
  purpose: { include: [], exclude: [] },
  building: { include: [], exclude: [] },
  floor: { include: [], exclude: [] }
})

const {
  uniquePurposes,
  purposeOptions,
  buildingOptions,
  floorOptions,
  hydrateFromLocations
} = useLocationHierarchyFilter(filters, { prefixFloorLabel: true })

const fetchData = async () => {
  loading.value = true
  try {
    const params = {}
    if (filters.value.purpose.include.length || filters.value.purpose.exclude.length) {
      params.purpose = JSON.stringify(filters.value.purpose)
    }
    if (filters.value.building.include.length || filters.value.building.exclude.length) {
      params.building = JSON.stringify(filters.value.building)
    }
    if (filters.value.floor.include.length || filters.value.floor.exclude.length) {
      params.floor = JSON.stringify(filters.value.floor)
    }

    const response = await analyticsApi.fetchLocationAnalysis(params)
    if (response?.success) {
      locationLoads.value = response.data?.locationLoads || []
      duplicateProducts.value = response.data?.duplicateProducts || []
      hydrateFromLocations(locationLoads.value)
    }
  } catch (error) {
    console.error('Failed to fetch location analysis:', error)
    toast(error.response?.data?.message || t('analytics.distribution.error_load'), 'error')
  } finally {
    loading.value = false
  }
}

const avgProductsPerLocation = computed(() => {
  if (locationLoads.value.length === 0) return 0
  const total = locationLoads.value.reduce((sum, loc) => sum + loc.total_products, 0)
  return (total / locationLoads.value.length).toFixed(1)
})

const totalQuantity = computed(() => {
  return locationLoads.value.reduce((sum, loc) => sum + loc.total_quantity, 0)
})

onMounted(() => {
  fetchData()
})
</script>
