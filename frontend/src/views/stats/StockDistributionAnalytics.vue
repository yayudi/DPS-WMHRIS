<template>
  <div class="space-y-6">
    <div class="flex items-center justify-between">
      <h2 class="text-2xl font-bold leading-7 text-text sm:truncate sm:text-3xl sm:tracking-tight">
        Sebaran Stok & Penempatan
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
          Refresh Data
        </button>
      </div>
    </div>

    <!-- Filters -->
    <div class="bg-background p-4 rounded-lg shadow-sm border border-secondary/20">
      <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div>
          <label class="block text-sm font-medium leading-6 text-text mb-1">Purpose</label>
          <TriStateSelect
            v-model="filters.purpose"
            :options="purposeOptions"
            label="label"
            track-by="value"
            placeholder="Semua Purpose"
            @update:model-value="fetchData"
          />
        </div>
        <div>
          <label class="block text-sm font-medium leading-6 text-text mb-1">Gedung</label>
          <TriStateSelect
            v-model="filters.building"
            :options="buildingOptions"
            label="label"
            track-by="value"
            placeholder="Semua Gedung"
            @update:model-value="fetchData"
            :disabled="!filters.purpose.include.length && !filters.purpose.exclude.length && uniquePurposes.length > 0"
          />
        </div>
        <div>
          <label class="block text-sm font-medium leading-6 text-text mb-1">Lantai</label>
          <TriStateSelect
            v-model="filters.floor"
            :options="floorOptions"
            label="label"
            track-by="value"
            placeholder="Semua Lantai"
            @update:model-value="fetchData"
            :disabled="!filters.building.include.length && !filters.building.exclude.length"
          />
        </div>
      </div>
    </div>

    <!-- KPIs -->
    <div class="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
      <div class="overflow-hidden rounded-lg bg-background px-4 py-5 shadow-sm border border-secondary/20 sm:p-6">
        <dt class="truncate text-sm font-medium text-text/60">Total Lokasi Aktif</dt>
        <dd class="mt-1 text-3xl font-semibold tracking-tight text-text">{{ locationLoads.length }}</dd>
      </div>
      <div class="overflow-hidden rounded-lg bg-background px-4 py-5 shadow-sm border border-secondary/20 sm:p-6">
        <dt class="truncate text-sm font-medium text-text/60">Rata-rata Produk per Lokasi</dt>
        <dd class="mt-1 text-3xl font-semibold tracking-tight text-text">{{ avgProductsPerLocation }}</dd>
      </div>
      <div class="overflow-hidden rounded-lg bg-background px-4 py-5 shadow-sm border border-secondary/20 sm:p-6">
        <dt class="truncate text-sm font-medium text-text/60">Produk Tersebar</dt>
        <dd class="mt-1 text-3xl font-semibold tracking-tight text-text">{{ duplicateProducts.length }}</dd>
      </div>
      <div class="overflow-hidden rounded-lg bg-background px-4 py-5 shadow-sm border border-secondary/20 sm:p-6">
        <dt class="truncate text-sm font-medium text-text/60">Total Kuantitas Stok</dt>
        <dd class="mt-1 text-3xl font-semibold tracking-tight text-text">{{ formatNumber(totalQuantity) }}</dd>
      </div>
    </div>

    <div class="grid grid-cols-1 xl:grid-cols-2 gap-6">
      <!-- Data Table: Beban Lokasi -->
      <div class="bg-background rounded-lg shadow-sm border border-secondary/20 overflow-hidden flex flex-col">
        <div class="px-4 py-5 sm:px-6 border-b border-secondary/20">
          <h3 class="text-base font-semibold leading-6 text-text">Beban Tiap Lokasi</h3>
          <p class="mt-1 text-sm text-text/60">Informasi jumlah produk dan kuantitas di setiap lokasi.</p>
        </div>
        <div class="overflow-x-auto flex-1 max-h-[600px] custom-scrollbar">
          <table class="min-w-full divide-y divide-secondary">
            <thead class="bg-secondary sticky top-0 z-10">
              <tr>
                <th
                  scope="col"
                  class="py-3.5 pl-4 pr-3 text-left text-sm font-semibold text-text sm:pl-6"
                  title="Kode unik lokasi penyimpanan"
                >
                  Kode
                </th>
                <th
                  scope="col"
                  class="px-3 py-3.5 text-left text-sm font-semibold text-text"
                  title="Gedung dan lantai tempat lokasi berada"
                >
                  Gedung / Lantai
                </th>
                <th
                  scope="col"
                  class="px-3 py-3.5 text-left text-sm font-semibold text-text"
                  title="Tujuan penggunaan atau fungsi lokasi (misal: Bulky, Retail, dll)"
                >
                  Purpose
                </th>
                <th
                  scope="col"
                  class="px-3 py-3.5 text-right text-sm font-semibold text-text"
                  title="Jumlah jenis produk/SKU berbeda yang disimpan bercampur di lokasi ini"
                >
                  Jml Produk
                </th>
                <th
                  scope="col"
                  class="px-3 py-3.5 text-right text-sm font-semibold text-text"
                  title="Total keseluruhan barang (kuantitas) yang ada di lokasi ini"
                >
                  Kuantitas
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
                    {{ loc.building }} <span v-if="loc.floor" class="ml-1 opacity-75"> - Lt {{ loc.floor }}</span>
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
                <td colspan="5" class="px-3 py-4 text-sm text-text/50 text-center">Tidak ada data lokasi</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- Data Table: Sebaran Lokasi -->
      <div class="bg-background rounded-lg shadow-sm border border-secondary/20 overflow-hidden flex flex-col">
        <div class="px-4 py-5 sm:px-6 border-b border-secondary/20">
          <h3 class="text-base font-semibold leading-6 text-text">Sebaran Penempatan Produk (Berdasarkan Purpose)</h3>
          <p class="mt-1 text-sm text-text/60">
            Produk yang disimpan di lebih dari satu lokasi dengan purpose yang sama.
          </p>
        </div>
        <div class="overflow-x-auto flex-1 max-h-[600px] custom-scrollbar">
          <table class="min-w-full divide-y divide-secondary">
            <thead class="bg-secondary sticky top-0 z-10">
              <tr>
                <th
                  scope="col"
                  class="py-3.5 pl-4 pr-3 text-left text-sm font-semibold text-text sm:pl-6"
                  title="Nama produk dan kode SKU"
                >
                  Produk
                </th>
                <th
                  scope="col"
                  class="px-3 py-3.5 text-left text-sm font-semibold text-text"
                  title="Tujuan penggunaan lokasi (misal: Bulky, Retail, dll)"
                >
                  Purpose
                </th>
                <th
                  scope="col"
                  class="px-3 py-3.5 text-center text-sm font-semibold text-text"
                  title="Jumlah lokasi berbeda yang menyimpan produk ini"
                >
                  Jml Lokasi
                </th>
                <th
                  scope="col"
                  class="px-3 py-3.5 text-left text-sm font-semibold text-text"
                  title="Daftar kode lokasi tempat produk ini disimpan"
                >
                  Daftar Lokasi
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
                  Tidak ada produk yang tersebar di banyak lokasi
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
import { ref, onMounted, computed, watch } from 'vue'
import { useToast } from '@/composables/useToast.js'
import api from '@/api/axios.js'
import TriStateSelect from '@/components/ui/TriStateSelect.vue'
import { formatNumber, getLocationPurposeColorClass, getLocationBuildingColorClass } from '@/utils/formatters.js'

const { toast } = useToast()
const loading = ref(false)
const locationLoads = ref([])
const duplicateProducts = ref([])
const uniquePurposes = ref([])
const uniqueBuildingsByPurpose = ref({})
const uniqueFloorsByBuilding = ref({})
const initialLoaded = ref(false)
const filters = ref({
  purpose: { include: [], exclude: [] },
  building: { include: [], exclude: [] },
  floor: { include: [], exclude: [] }
})

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

    const response = await api.get('/statistics/location-analysis', { params })
    if (response.data.success) {
      locationLoads.value = response.data.data.locationLoads || []
      duplicateProducts.value = response.data.data.duplicateProducts || []

      // Update filter options only on initial load
      if (!initialLoaded.value) {
        const purposes = new Set()
        const buildingsByPurposeMap = {}
        const floorsByBuildingMap = {}

        locationLoads.value.forEach(loc => {
          const p = loc.purpose || 'N/A'
          purposes.add(p)

          if (!buildingsByPurposeMap[p]) buildingsByPurposeMap[p] = new Set()
          if (loc.building) {
            buildingsByPurposeMap[p].add(loc.building)
            if (!floorsByBuildingMap[loc.building]) floorsByBuildingMap[loc.building] = new Set()
            if (loc.floor) floorsByBuildingMap[loc.building].add(loc.floor)
          }
        })

        uniquePurposes.value = Array.from(purposes).sort()
        for (const p in buildingsByPurposeMap) buildingsByPurposeMap[p] = Array.from(buildingsByPurposeMap[p]).sort()
        for (const b in floorsByBuildingMap) floorsByBuildingMap[b] = Array.from(floorsByBuildingMap[b]).sort()

        uniqueBuildingsByPurpose.value = buildingsByPurposeMap
        uniqueFloorsByBuilding.value = floorsByBuildingMap
        initialLoaded.value = true
      }
    }
  } catch (error) {
    console.error('Failed to fetch location analysis:', error)
    toast(error.response?.data?.message || 'Gagal memuat data analisis lokasi', 'error')
  } finally {
    loading.value = false
  }
}

watch(
  () => filters.value.purpose,
  () => {
    filters.value.building = { include: [], exclude: [] }
    filters.value.floor = { include: [], exclude: [] }
  },
  { deep: true }
)

watch(
  () => filters.value.building,
  () => {
    filters.value.floor = { include: [], exclude: [] }
  },
  { deep: true }
)

const availableBuildings = computed(() => {
  const activePurposes = filters.value.purpose.include
  if (!activePurposes.length) {
    const all = new Set()
    Object.values(uniqueBuildingsByPurpose.value).forEach(buildings => {
      buildings.forEach(b => all.add(b))
    })
    return Array.from(all).sort()
  }

  const validBuildings = new Set()
  activePurposes.forEach(p => {
    const bds = uniqueBuildingsByPurpose.value[p] || []
    bds.forEach(b => validBuildings.add(b))
  })
  return Array.from(validBuildings).sort()
})

const availableFloors = computed(() => {
  const activeBuildings = filters.value.building.include
  if (!activeBuildings.length) return []
  const validFloors = new Set()
  activeBuildings.forEach(b => {
    const fls = uniqueFloorsByBuilding.value[b] || []
    fls.forEach(f => validFloors.add(f))
  })
  return Array.from(validFloors).sort()
})

const purposeOptions = computed(() => uniquePurposes.value.map(p => ({ label: p, value: p })))
const buildingOptions = computed(() => availableBuildings.value.map(b => ({ label: b, value: b })))
const floorOptions = computed(() => availableFloors.value.map(f => ({ label: `Lantai ${f}`, value: f })))

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
