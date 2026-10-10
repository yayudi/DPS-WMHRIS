<script setup>
import BaseSelect from '@/components/ui/BaseSelect.vue'
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
  <div
    class="bg-background/80 rounded-xl border border-secondary/20 p-4 lg:p-6 shadow-sm flex flex-col gap-4 relative z-30">
    <div class="flex items-center gap-3 mb-2">
      <h3 class="text-lg font-bold text-text/80 tracking-tight">Form Penyesuaian</h3>
    </div>
    <div class="grid grid-cols-1 md:grid-cols-2 gap-6 w-full">
      <!-- ADJUSTMENT -->
      <div>
        <label class="block text-sm font-medium text-text/90 mb-2">Lokasi Penyesuaian (Lokasi Anda)</label>
        <BaseSelect v-model="adjustmentLocation" :options="myLocations" placeholder="Pilih lokasi" label="code"
          track-by="id" :disabled="isLoading" />
      </div>

      <!-- Catatan -->
      <div class="flex-grow">
        <label class="block text-sm font-medium text-text mb-2">Catatan / Alasan (Wajib)</label>
        <input v-model="notes" type="text" placeholder="e.g., Stok opname, Barang rusak, PO-123"
          class="w-full p-2 border border-secondary/50 rounded-lg bg-background" />
      </div>
    </div>
  </div>
</template>
