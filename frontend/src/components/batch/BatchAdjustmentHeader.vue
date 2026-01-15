<script setup>
import BaseSelect from '@/components/ui/BaseSelect.vue'
import FilterContainer from '@/components/ui/FilterContainer.vue'

// Props untuk data dropdown
defineProps({
  myLocations: { type: Array, default: () => [] },
  isLoading: { type: Boolean, default: false },
})

// Gunakan defineModel untuk two-way binding (v-model) dari induk
const adjustmentLocation = defineModel('adjustmentLocation')
const notes = defineModel('notes')
</script>

<template>
  <!-- Header Kontekstual Hanya Untuk Adjustment -->
  <FilterContainer title="Form Penyesuaian">
    <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
      <!-- ADJUSTMENT -->
      <div>
        <label class="block text-sm font-medium text-text/90 mb-2"
          >Lokasi Penyesuaian (Lokasi Anda)</label
        >
        <BaseSelect
          v-model="adjustmentLocation"
          :options="myLocations"
          placeholder="Pilih lokasi"
          label="code"
          track-by="id"
          :disabled="isLoading"
        />
      </div>

      <!-- Catatan -->
      <div class="flex-grow">
        <label class="block text-sm font-medium text-text mb-2">Catatan / Alasan (Wajib)</label>
        <input
          v-model="notes"
          type="text"
          placeholder="e.g., Stok opname, Barang rusak, PO-123"
          class="w-full p-2 border border-secondary/50 rounded-lg bg-background"
        />
      </div>
    </div>
  </FilterContainer>
</template>
