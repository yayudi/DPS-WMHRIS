<script setup lang="ts">
import { onMounted } from 'vue'
import { useReplenishment } from '../../application/useReplenishment'
import QuickTransferModal from '../components/replenishment/QuickTransferModal.vue'
import BasePagination from '@/core/presentation/components/ui/BasePagination.vue'

const {
  filteredFulfillments,
  paginatedFulfillments,
  pagination,
  setPage,
  setPageSize,
  allLocations,
  loading,
  releasingId,
  transferring,
  selectedBuilding,
  availableBuildings,
  searchQuery,
  sortBy,
  soundEnabled,
  isTransferModalOpen,
  activeTransferContext,
  stats,
  loadOnHoldFulfillments,
  loadLocations,
  openQuickTransfer,
  closeQuickTransfer,
  submitQuickTransfer,
  releaseFulfillment,
  calculateSla
} = useReplenishment()

onMounted(async () => {
  await Promise.all([loadOnHoldFulfillments(), loadLocations()])
})

function formatDateTime(dtStr: string): string {
  if (!dtStr) return '-'
  try {
    const d = new Date(dtStr)
    return d.toLocaleString('id-ID', {
      dateStyle: 'medium',
      timeStyle: 'short'
    })
  } catch {
    return dtStr
  }
}

function getSuggestedBuildings(deficits: any[]): string[] {
  if (!deficits) return []
  const set = new Set<string>()
  for (const d of deficits) {
    for (const s of d.suggested_sources || []) {
      if (s.building) set.add(s.building)
    }
  }
  return Array.from(set)
}
</script>

<template>
  <div class="p-4 md:p-6 space-y-6 max-w-7xl mx-auto">
    <!-- Page Header -->
    <div class="flex flex-col md:flex-row md:items-center justify-between gap-4">
      <div>
        <h1 class="text-2xl font-bold text-text flex items-center gap-2">
          <font-awesome-icon icon="fa-solid fa-boxes-packing" class="text-primary" />
          Antrean Manual Replenishment
        </h1>
        <p class="text-sm text-text/70 mt-1">
          Daftar pesanan tertahan yang membutuhkan pemindahan stok manual dari lantai STORAGE ke lantai DISPLAY sebelum dapat
          di-pick.
        </p>
      </div>
      <div class="flex items-center gap-2 self-start md:self-auto">
        <button
          type="button"
          :class="
            soundEnabled
              ? 'bg-primary/20 text-primary border-primary/40'
              : 'bg-secondary/30 text-text/70 border-secondary/40'
          "
          class="px-3.5 py-2 border rounded-xl text-xs font-semibold flex items-center gap-2 transition"
          :title="soundEnabled ? 'Alert suara aktif' : 'Alert suara nonaktif'"
          @click="soundEnabled = !soundEnabled"
        >
          <font-awesome-icon :icon="soundEnabled ? 'fa-solid fa-volume-high' : 'fa-solid fa-volume-xmark'" />
          <span>{{ soundEnabled ? 'Suara Aktif' : 'Suara Senyap' }}</span>
        </button>

        <button
          type="button"
          :disabled="loading"
          class="px-4 py-2 bg-secondary/30 hover:bg-secondary/50 text-text rounded-xl text-xs font-semibold flex items-center gap-2 transition disabled:opacity-50"
          @click="loadOnHoldFulfillments"
        >
          <font-awesome-icon icon="fa-solid fa-rotate" :class="{ 'animate-spin': loading }" />
          <span>Segarkan Data</span>
        </button>
      </div>
    </div>

    <!-- Stats Overview Cards -->
    <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
      <div class="p-4 bg-surface rounded-2xl border border-secondary/30 shadow-xs">
        <div class="text-xs text-text/70 font-medium">Total Pesanan Hold</div>
        <div class="text-2xl font-extrabold text-text mt-1">{{ stats.total }}</div>
        <div class="text-[11px] text-text/60 mt-1">Menunggu penanganan lantai</div>
      </div>

      <div class="p-4 bg-surface rounded-2xl border border-danger/30 shadow-xs">
        <div class="text-xs text-danger font-semibold flex items-center gap-1.5">
          <span class="w-2 h-2 rounded-full bg-danger animate-pulse"></span>
          Batas Kirim Mendesak (&lt; 2 Jam)
        </div>
        <div class="text-2xl font-extrabold text-danger mt-1">{{ stats.criticalCount }}</div>
        <div class="text-[11px] text-danger/80 mt-1">Prioritas utama proses</div>
      </div>

      <div class="p-4 bg-surface rounded-2xl border border-warning/30 shadow-xs">
        <div class="text-xs text-warning font-semibold">Siap Di-Replenish</div>
        <div class="text-2xl font-extrabold text-warning mt-1">{{ stats.holdCount }}</div>
        <div class="text-[11px] text-text/60 mt-1">Stok STORAGE tersedia</div>
      </div>

      <div class="p-4 bg-surface rounded-2xl border border-primary/30 shadow-xs">
        <div class="text-xs text-primary font-semibold">Total Defisit Unit</div>
        <div class="text-2xl font-extrabold text-primary mt-1">{{ stats.totalDeficitUnits }} pcs</div>
        <div class="text-[11px] text-text/60 mt-1">Harus dipindahkan ke DISPLAY</div>
      </div>
    </div>

    <!-- Filter & Search Toolbar -->
    <div
      class="flex flex-col md:flex-row items-center justify-between gap-3 p-3 bg-surface rounded-xl border border-secondary/30"
    >
      <div class="flex flex-wrap items-center gap-3 w-full md:w-auto">
        <div class="flex items-center gap-2">
          <span class="text-xs font-medium text-text/70">Gedung:</span>
          <select
            v-model="selectedBuilding"
            class="px-3 py-1.5 bg-background border border-secondary/40 text-text rounded-lg text-xs font-medium focus:outline-none focus:border-primary"
            @change="loadOnHoldFulfillments"
          >
            <option value="ALL">Semua Gedung</option>
            <option v-for="bld in availableBuildings" :key="bld" :value="bld">Gedung {{ bld }}</option>
          </select>
        </div>

        <div class="flex items-center gap-2">
          <span class="text-xs font-medium text-text/70">Urutkan:</span>
          <select
            v-model="sortBy"
            class="px-3 py-1.5 bg-background border border-secondary/40 text-text rounded-lg text-xs font-medium focus:outline-none focus:border-primary"
          >
            <option value="SLA_URGENT">Batas Waktu Terdekat (Mendesak)</option>
            <option value="NEWEST">Pesanan Terbaru</option>
            <option value="OLDEST">Pesanan Terlama</option>
          </select>
        </div>
      </div>

      <div class="w-full md:w-72">
        <input
          v-model="searchQuery"
          type="text"
          placeholder="Cari no order, SKU, nama produk..."
          class="w-full px-3 py-1.5 bg-background border border-secondary/40 text-text rounded-lg text-xs placeholder:text-text/40 focus:outline-none focus:border-primary"
        />
      </div>
    </div>

    <!-- Fulfillment Cards List -->
    <div v-if="loading && filteredFulfillments.length === 0" class="py-16 text-center">
      <div class="inline-block animate-spin text-3xl text-primary mb-2">⟳</div>
      <div class="text-sm text-text/70">Memuat data antrean replenishment...</div>
    </div>

    <div
      v-else-if="filteredFulfillments.length === 0"
      class="py-16 px-4 bg-surface rounded-2xl border border-secondary/20 text-center space-y-2"
    >
      <div class="text-4xl text-success">✓</div>
      <div class="text-base font-bold text-text">Tidak Ada Pesanan Tertahan</div>
      <p class="text-xs text-text/70 max-w-md mx-auto">
        Seluruh pesanan fulfillment memiliki stok lantai DISPLAY yang cukup atau antrean telah selesai diproses.
      </p>
    </div>

    <div v-else class="space-y-4">
      <div
        v-for="fulfillment in paginatedFulfillments"
        :key="fulfillment.transaction_id"
        class="bg-surface rounded-2xl border transition overflow-hidden"
        :class="{
          'border-danger/60 shadow-xs shadow-danger/10': calculateSla(fulfillment.created_at).level === 'CRITICAL',
          'border-warning/50 shadow-xs shadow-warning/5': calculateSla(fulfillment.created_at).level === 'WARNING',
          'border-secondary/30 hover:border-secondary/60': calculateSla(fulfillment.created_at).level === 'NORMAL'
        }"
      >
        <!-- Card Header -->
        <div class="p-4 bg-secondary/10 border-b border-secondary/20 flex flex-wrap items-center justify-between gap-3">
          <div class="flex items-center gap-3">
            <span
              class="font-mono font-bold text-sm text-text px-2.5 py-1 bg-surface rounded-lg border border-secondary/40"
            >
              {{ fulfillment.reference_id }}
            </span>
            <span class="text-xs px-2 py-0.5 rounded-md bg-secondary/30 font-medium text-text/80">
              {{ fulfillment.reference_type }}
            </span>
            <span
              v-if="fulfillment.assigned_building"
              class="text-xs px-2 py-0.5 rounded-md bg-primary/10 border border-primary/20 text-primary font-semibold"
            >
              {{ fulfillment.assigned_building }}
            </span>
            <span
              v-else-if="getSuggestedBuildings(fulfillment.deficits).length > 0"
              class="text-xs px-2 py-0.5 rounded-md bg-primary/10 border border-primary/20 text-primary font-semibold"
            >
              {{ getSuggestedBuildings(fulfillment.deficits).join(', ') }}
            </span>

            <!-- Batas Waktu Urgency Badge -->
            <span
              v-if="calculateSla(fulfillment.created_at).level === 'CRITICAL'"
              class="text-xs px-2.5 py-0.5 rounded-full bg-danger/15 border border-danger/30 text-danger font-bold flex items-center gap-1.5 animate-pulse"
            >
              <font-awesome-icon icon="fa-solid fa-triangle-exclamation" />
              <span>Batas Kirim: {{ calculateSla(fulfillment.created_at).formattedText }} (Mendesak)</span>
            </span>
            <span
              v-else-if="calculateSla(fulfillment.created_at).level === 'WARNING'"
              class="text-xs px-2.5 py-0.5 rounded-full bg-warning/15 border border-warning/30 text-warning font-semibold flex items-center gap-1.5"
            >
              <font-awesome-icon icon="fa-solid fa-clock" />
              <span>Batas Kirim: {{ calculateSla(fulfillment.created_at).formattedText }}</span>
            </span>
            <span v-else class="text-xs px-2 py-0.5 rounded-md bg-secondary/20 text-text/70 border border-secondary/30">
              <span>Batas Kirim: {{ calculateSla(fulfillment.created_at).formattedText }}</span>
            </span>
          </div>

          <div class="flex items-center gap-3">
            <span
              v-if="fulfillment.status === 'HOLD_REPLENISHMENT'"
              class="text-xs px-2.5 py-1 rounded-full bg-warning/15 border border-warning/30 text-warning font-semibold flex items-center gap-1.5"
            >
              <span class="w-1.5 h-1.5 rounded-full bg-warning"></span>
              Menunggu Replenishment Lantai
            </span>
            <span
              v-else-if="fulfillment.status === 'OUT_OF_STOCK'"
              class="text-xs px-2.5 py-1 rounded-full bg-danger/15 border border-danger/30 text-danger font-semibold flex items-center gap-1.5"
            >
              <span class="w-1.5 h-1.5 rounded-full bg-danger"></span>
              Stok Total Kurang
            </span>
            <span v-else class="text-xs px-2 py-0.5 rounded bg-secondary/30 text-text/70">
              {{ fulfillment.status }}
            </span>

            <span class="text-xs text-text/60">
              {{ formatDateTime(fulfillment.created_at) }}
            </span>
          </div>
        </div>

        <!-- Deficit Breakdown Table -->
        <div class="p-4 overflow-x-auto">
          <table class="w-full text-left text-xs">
            <thead>
              <tr class="text-text/60 border-b border-secondary/20 pb-2">
                <th class="py-2 font-semibold">Produk / SKU</th>
                <th class="py-2 text-center font-semibold">Target Order</th>
                <th class="py-2 text-center font-semibold">Stok Display</th>
                <th class="py-2 text-center font-semibold text-danger">Defisit (Kurang)</th>
                <th class="py-2 font-semibold">Rekomendasi Lantai STORAGE Sumber</th>
                <th class="py-2 text-right font-semibold">Aksi Cepat</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-secondary/10">
              <tr v-if="!fulfillment.deficits || fulfillment.deficits.length === 0">
                <td colspan="6" class="py-4 text-center text-text/60 italic">
                  Tidak ada rincian defisit terdata untuk pesanan ini.
                </td>
              </tr>
              <tr v-for="deficit in fulfillment.deficits" :key="deficit.product_id" class="hover:bg-secondary/5">
                <!-- Product / SKU -->
                <td class="py-3 pr-3">
                  <div class="font-mono font-bold text-primary">{{ deficit.sku || 'SKU-' + deficit.product_id }}</div>
                  <div class="text-text font-medium text-xs mt-0.5">{{ deficit.product_name }}</div>
                </td>

                <!-- Target Qty -->
                <td class="py-3 px-2 text-center font-semibold text-text">{{ deficit.target_quantity }} pcs</td>

                <!-- Display Qty -->
                <td class="py-3 px-2 text-center text-text/80 font-medium">
                  {{ deficit.display_available_quantity }} pcs
                </td>

                <!-- Deficit Qty -->
                <td class="py-3 px-2 text-center font-bold text-danger">-{{ deficit.deficit_quantity }} pcs</td>

                <!-- Suggested Sources -->
                <td class="py-3 px-2">
                  <div
                    v-if="deficit.suggested_sources && deficit.suggested_sources.length > 0"
                    class="flex flex-wrap gap-1.5"
                  >
                    <button
                      v-for="source in deficit.suggested_sources"
                      :key="source.location_id"
                      type="button"
                      class="px-2 py-1 rounded bg-secondary/20 hover:bg-secondary/40 border border-secondary/30 flex items-center gap-1.5 transition text-[11px]"
                      title="Klik untuk langsung transfer dari lantai ini"
                      @click="openQuickTransfer(fulfillment, deficit, source)"
                    >
                      <span class="font-mono font-bold text-text">{{ source.location_code }}</span>
                      <span class="text-success font-semibold">({{ source.available_quantity }} pcs)</span>
                    </button>
                  </div>
                  <span v-else class="text-[11px] text-danger/80 italic"> Tidak ada stok STORAGE di gedung ini </span>
                </td>

                <!-- Action button -->
                <td class="py-3 pl-3 text-right">
                  <button
                    type="button"
                    class="px-3 py-1.5 bg-primary/10 hover:bg-primary/20 text-primary border border-primary/30 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 transition"
                    @click="openQuickTransfer(fulfillment, deficit)"
                  >
                    <font-awesome-icon icon="fa-solid fa-truck-ramp-box" />
                    <span>Pindah Lantai</span>
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- Card Footer Actions -->
        <div
          class="p-3 px-4 bg-secondary/5 border-t border-secondary/20 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3"
        >
          <div class="text-[11px] text-text/70 flex items-center gap-1.5">
            <font-awesome-icon icon="fa-solid fa-circle-info" class="text-primary/70" />
            <span>
              Pindahkan fisik barang ke lantai sumber fulfillment<strong v-if="fulfillment.assigned_building">
                (Gedung {{ fulfillment.assigned_building }})</strong
              >, lalu tekan tombol rilis di bawah.
            </span>
          </div>

          <div class="flex items-center gap-2 self-end sm:self-auto">
            <button
              type="button"
              :disabled="releasingId === fulfillment.transaction_id"
              class="px-4 py-2 bg-success hover:bg-success/90 text-white rounded-xl text-xs font-bold inline-flex items-center gap-2 shadow-sm transition disabled:opacity-50"
              @click="releaseFulfillment(fulfillment)"
            >
              <span v-if="releasingId === fulfillment.transaction_id" class="animate-spin">⟳</span>
              <font-awesome-icon v-else icon="fa-solid fa-check" />
              <span>Verifikasi & Release Order</span>
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Pagination -->
    <div v-if="filteredFulfillments.length > 0" class="pt-2">
      <BasePagination
        :pagination="pagination"
        :limit-options="[5, 10, 20, 50]"
        @change-page="setPage"
        @update:limit="setPageSize"
      />
    </div>

    <!-- Quick Transfer Modal -->
    <QuickTransferModal
      :show="isTransferModalOpen"
      :context="activeTransferContext"
      :locations="allLocations"
      :loading="transferring"
      @close="closeQuickTransfer"
      @confirm="submitQuickTransfer"
    />
  </div>
</template>
