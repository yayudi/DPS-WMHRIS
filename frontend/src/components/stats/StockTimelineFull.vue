<script setup>
import { ref, onMounted, computed } from 'vue'
import { useMasterDataStore } from '@/stores/masterData'
import { useProductSearch } from '@/modules/wms/application/useProductSearch'
import BaseSelect from '@/components/ui/BaseSelect.vue'
import BaseFilterPanel from '@/components/ui/BaseFilterPanel.vue'
import StockTimelineSlider from './StockTimelineSlider.vue'

const { query, results, isSearching, selectedProduct, selectProduct, clear } = useProductSearch({
  debounceMs: 400,
  maxResults: 10
})

const masterData = useMasterDataStore()

const selectedBuildings = ref([])

const reportFilters = ref({
  allBuildings: []
})

const availableBuildings = computed(() => reportFilters.value.allBuildings)

const activeProductId = computed(() => selectedProduct.value?.id || null)

onMounted(async () => {
  try {
    const response = await masterData.getReportFilters()
    if (response) {
      reportFilters.value.allBuildings = response.allBuildings || []
    }
  } catch (error) {
    console.error('Gagal memuat filter:', error)
  }
})

const handleSelect = product => {
  selectProduct(product)
}

const handleClear = () => {
  clear()
  selectedBuildings.value = []
}
</script>

<template>
  <div class="flex flex-col gap-6">
    <!-- Filter Section -->
    <BaseFilterPanel title="Filter Investigasi">
      <template #filters>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-5 w-full">
          <!-- Product Search -->
          <div class="relative">
            <label class="block text-xs font-bold text-text/60 uppercase mb-1.5">Cari Produk (Wajib)</label>
            <div class="relative">
              <input
                type="text"
                v-model="query"
                placeholder="Ketik SKU atau Nama Produk..."
                class="w-full pl-9 pr-8 py-2.5 bg-background border border-secondary/30 rounded-lg text-sm text-text focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all shadow-sm font-medium placeholder-text/40"
              />
              <div class="absolute left-3 top-3 text-text/40 text-xs">
                <font-awesome-icon v-if="isSearching" icon="fa-solid fa-circle-notch" spin class="text-primary" />
                <font-awesome-icon v-else icon="fa-solid fa-search" />
              </div>
              <button
                v-if="query"
                @click="handleClear"
                class="absolute right-3 top-3 text-text/30 hover:text-danger transition-colors"
              >
                <font-awesome-icon icon="fa-solid fa-times" />
              </button>
            </div>

            <!-- Dropdown Search Results -->
            <div
              v-if="results.length > 0"
              @mousedown.prevent
              class="absolute z-[9999] w-full mt-1 bg-background border border-secondary/20 shadow-xl rounded-lg max-h-60 overflow-y-auto"
            >
              <div
                v-for="product in results"
                :key="product.id"
                @click="handleSelect(product)"
                class="w-full text-left px-4 py-3 hover:bg-primary/10 border-b border-secondary/10 last:border-0 cursor-pointer transition-colors group"
              >
                <div class="font-bold text-sm text-text group-hover:text-primary">{{ product.sku }}</div>
                <div class="text-xs text-text/60 truncate">{{ product.name }}</div>
              </div>
            </div>
          </div>

          <!-- Building Filter -->
          <div>
            <label class="block text-xs font-bold text-text/60 uppercase mb-1.5">Pilih Gudang (Opsional)</label>
            <BaseSelect
              v-model="selectedBuildings"
              :options="availableBuildings"
              :multiple="true"
              :searchable="false"
              placeholder="Semua Gudang (Global)"
            />
          </div>
        </div>
      </template>
    </BaseFilterPanel>

    <!-- Slider Section -->
    <div v-if="activeProductId" class="min-h-[500px]">
      <StockTimelineSlider :productId="String(activeProductId)" :buildings="selectedBuildings" />
    </div>

    <div
      v-else
      class="bg-background border border-secondary/20 rounded-xl p-16 flex flex-col items-center justify-center text-center shadow-sm min-h-[500px]"
    >
      <div
        class="w-20 h-20 bg-secondary/5 rounded-full flex items-center justify-center mb-6 border border-secondary/10"
      >
        <font-awesome-icon icon="fa-solid fa-magnifying-glass" class="text-4xl text-text/30" />
      </div>
      <h4 class="font-bold text-text text-xl mb-2">Pilih Produk Untuk Diinvestigasi</h4>
      <p class="text-text/50 text-sm max-w-md">
        Silakan cari dan pilih salah satu produk menggunakan kotak pencarian di atas untuk memuat riwayat mutasi stok
        (mesin waktu).
      </p>
    </div>
  </div>
</template>
