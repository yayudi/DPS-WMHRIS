<script setup>
import { watch } from 'vue'
import { useToast } from '@/composables/useToast'
import BaseSelect from '@/components/ui/BaseSelect.vue'
import BaseTabs from '@/components/ui/BaseTabs.vue'

const { toast } = useToast()

// Props untuk data dropdown
defineProps({
  myLocations: { type: Array, default: () => [] },
  allLocations: { type: Array, default: () => [] },
  isLoading: { type: Boolean, default: false }
})

// Gunakan defineModel untuk two-way binding (v-model) dari induk
const activeTab = defineModel('activeTab')
const fromLocation = defineModel('fromLocation')
const toLocation = defineModel('toLocation')
const notes = defineModel('notes')

const tabs = [
  { label: 'Single Location', value: 'TRANSFER' },
  { label: 'Multi Location', value: 'DETAILED_TRANSFER' },
  { label: 'Inbound', value: 'INBOUND' }
]

watch([fromLocation, toLocation], ([newFrom, newTo]) => {
  if (newFrom && newTo && newFrom.id === newTo.id) {
    toast('Lokasi Asal dan Tujuan tidak boleh sama.', 'warning')
    toLocation.value = null
  }
})
</script>

<template>
  <div>
    <!-- Tabs navigation -->
    <BaseTabs :tabs="tabs" v-model:model-value="activeTab" />
    <div
      v-if="activeTab !== 'DETAILED_TRANSFER'"
      class="my-4 bg-secondary/50 rounded-xl border border-secondary/20 p-4 shadow-sm flex flex-col gap-4 relative z-30"
    >
      <div class="grid grid-cols-1 md:grid-cols-12 gap-6 w-full">
        <!-- TRANSFER (BATCH) -->
        <template v-if="activeTab === 'TRANSFER'">
          <div class="md:col-span-3">
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
          <div class="md:col-span-3">
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
          <div class="md:col-span-6">
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
    </div>
  </div>
</template>
