<script setup>
import BaseSelect from '@/components/ui/BaseSelect.vue'
import Tabs from '@/components/ui/Tabs.vue'
import FilterContainer from '@/components/ui/FilterContainer.vue'

// Props untuk data dropdown
defineProps({
  myLocations: { type: Array, default: () => [] },
  allLocations: { type: Array, default: () => [] },
  isLoading: { type: Boolean, default: false },
})

// Gunakan defineModel untuk two-way binding (v-model) dari induk
const activeTab = defineModel('activeTab')
const fromLocation = defineModel('fromLocation')
const toLocation = defineModel('toLocation')
const notes = defineModel('notes')

const tabs = [
  { label: 'Batch Transfer', value: 'TRANSFER' },
  { label: 'Detailed Transfer', value: 'DETAILED_TRANSFER' },
  { label: 'Inbound', value: 'INBOUND' },
]
</script>

<template>
  <div>
    <!-- Tabs navigation -->
    <Tabs :tabs="tabs" v-model:model-value="activeTab" />

    <!-- Header Kontekstual Berdasarkan Tab -->
    <!-- Wrapped in FilterContainer for mobile collapsibility -->
    <FilterContainer
      v-if="activeTab !== 'DETAILED_TRANSFER'"
      title="Form Perpindahan"
      class="mt-4"
    >
      <div class="grid grid-cols-1 md:grid-cols-12 gap-6">
        <!-- TRANSFER (BATCH) -->
        <template v-if="activeTab === 'TRANSFER'">
          <div class="md:col-span-4">
            <label class="block text-sm font-medium text-text/90 mb-2">Pindahkan Dari</label>
            <BaseSelect
              v-model="fromLocation"
              :options="myLocations"
              placeholder="Pilih lokasi asal"
              label="code"
              track-by="id"
              :disabled="isLoading"
            />
          </div>
          <div class="md:col-span-4">
            <label class="block text-sm font-medium text-text/90 mb-2">Ke Lokasi</label>
            <BaseSelect
              v-model="toLocation"
              :options="allLocations"
              placeholder="Pilih lokasi tujuan"
              label="code"
              track-by="id"
              :disabled="isLoading"
            />
          </div>
          <div class="md:col-span-4">
            <label class="block text-sm font-medium text-text/90 mb-2">Catatan / Alasan</label>
            <input
              v-model="notes"
              type="text"
              placeholder="e.g., Pindah stok antar gudang"
              class="w-full h-[42px] px-3 py-2 border border-secondary/50 rounded-lg bg-background focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/50 transition-all shadow-sm text-sm"
            />
          </div>
        </template>

        <!-- INBOUND ONLY -->
        <template v-if="activeTab === 'INBOUND'">
          <div class="md:col-span-6">
            <label class="block text-sm font-medium text-text/90 mb-2">Masukkan Ke Lokasi</label>
            <BaseSelect
              v-model="toLocation"
              :options="allLocations"
              placeholder="Pilih lokasi tujuan"
              label="code"
              track-by="id"
              :disabled="isLoading"
            />
          </div>
          <div class="md:col-span-6">
            <label class="block text-sm font-medium text-text/90 mb-2">Catatan / Alasan</label>
            <input
              v-model="notes"
              type="text"
              placeholder="e.g., Stok opname, Barang rusak, PO-123"
              class="w-full h-[42px] px-3 py-2 border border-secondary/50 rounded-lg bg-background focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/50 transition-all shadow-sm text-sm"
            />
          </div>
        </template>
      </div>
    </FilterContainer>
  </div>
</template>
