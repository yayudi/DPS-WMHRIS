<template>
  <GenericImportModal
    :isOpen="isOpen"
    title="Import Produk Massal"
    templateUrl="/products/template"
    templateFilename="Template_Produk.xlsx"
    uploadUrl="/products/batch/product-update"
    :additionalData="{ dryRun: isDryRun }"
    :instructions="['Gunakan file CSV atau Excel (.xlsx)', 'Kolom wajib: sku, name', 'Kolom opsional: price, weight, is_package, is_active', '*Jika SKU sudah ada, data di-update. Jika belum, dibuat baru.']"
    @close="$emit('close')"
    @success="$emit('success')"
  >
    <template #extra-fields>
      <div class="flex items-center gap-3 bg-secondary/5 p-3 rounded-lg border border-secondary/10">
        <input
          type="checkbox"
          id="dryRunToggle"
          v-model="isDryRun"
          class="checkbox checkbox-primary checkbox-sm rounded"
        />
        <label for="dryRunToggle" class="text-sm font-medium cursor-pointer flex-1">
          Simulasi (Dry Run)
        </label>
        <span
          class="text-xs bg-background px-2 py-1 rounded text-text/60 border border-secondary/20 shadow-sm"
        >
          Cek data tanpa ubah DB
        </span>
      </div>
    </template>
  </GenericImportModal>
</template>

<script setup>
import { ref } from 'vue'
import GenericImportModal from '@/core/presentation/components/shared/GenericImportModal.vue'

defineProps({
  isOpen: Boolean
})

defineEmits(['close', 'success'])

const isDryRun = ref(false)
</script>

