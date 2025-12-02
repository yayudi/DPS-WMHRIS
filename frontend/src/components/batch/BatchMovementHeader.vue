<!-- frontend\src\components\batch\BatchMovementHeader.vue -->
<script setup>
import Multiselect from 'vue-multiselect'
import Tabs from '@/components/Tabs.vue'

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
  { label: 'Return', value: 'RETURN' },
]
</script>

<template>
  <div>
    <!-- Tabs navigation -->
    <Tabs :tabs="tabs" v-model:model-value="activeTab" />

    <!-- Header Kontekstual Berdasarkan Tab -->
    <div
      v-if="activeTab !== 'DETAILED_TRANSFER' && activeTab !== 'RETURN'"
      class="grid grid-cols-1 md:grid-cols-2 gap-6 border-b border-secondary/20 pb-6 pt-6"
    >
      <!-- TRANSFER (BATCH) -->
      <template v-if="activeTab === 'TRANSFER'">
        <div>
          <label class="block text-sm font-medium text-text/90 mb-2">Pindahkan Dari</label>
          <Multiselect
            v-model="fromLocation"
            :options="myLocations"
            placeholder="Pilih lokasi asal"
            label="code"
            track-by="id"
            :disabled="isLoading"
          ></Multiselect>
        </div>
        <div>
          <label class="block text-sm font-medium text-text/90 mb-2">Ke Lokasi</label>
          <Multiselect
            v-model="toLocation"
            :options="allLocations"
            placeholder="Pilih lokasi tujuan"
            label="code"
            track-by="id"
            :disabled="isLoading"
          ></Multiselect>
        </div>
      </template>

      <!-- INBOUND ONLY (Sale Return removed from here) -->
      <template v-if="activeTab === 'INBOUND'">
        <div>
          <label class="block text-sm font-medium text-text/90 mb-2">Masukkan Ke Lokasi</label>
          <Multiselect
            v-model="toLocation"
            :options="allLocations"
            placeholder="Pilih lokasi tujuan"
            label="code"
            track-by="id"
            :disabled="isLoading"
          ></Multiselect>
        </div>
      </template>

      <!-- Catatan -->
      <div class="flex-grow" v-if="activeTab !== 'TRANSFER'">
        <label class="block text-sm font-medium text-text/90 mb-2">Catatan / Alasan</label>
        <input
          v-model="notes"
          type="text"
          placeholder="e.g., Stok opname, Barang rusak, PO-123"
          class="w-full p-2 border border-secondary/50 rounded-lg bg-background"
        />
      </div>

      <!-- Catatan untuk Transfer -->
      <div class="flex-grow" v-if="activeTab === 'TRANSFER'">
        <label class="block text-sm font-medium text-text/90 mb-2">Catatan / Alasan</label>
        <input
          v-model="notes"
          type="text"
          placeholder="e.g., Pindah stok antar gudang"
          class="w-full p-2 border border-secondary/50 rounded-lg bg-background"
        />
      </div>
    </div>
  </div>
</template>
