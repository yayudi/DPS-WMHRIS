<template>
  <GenericImportModal
    :isOpen="show"
    title="Tautkan Massal Produk (Excel)"
    templateUrl="/media/bulk-link-template"
    templateFilename="Template_Tautkan_Media.xlsx"
    uploadUrl="/media/bulk-link-excel"
    jobType="IMPORT_MEDIA_BULK_LINK"
    :instructions="[
      'Gunakan file Excel (.xlsx, .xls)',
      'Isi kolom SKU dan Image_URL sesuai template',
      'Pastikan URL/Link gambar valid (dari Galeri Media atau URL web eksternal berawalan http/https)'
    ]"
    @close="$emit('close')"
    @success="$emit('uploaded')"
  />
</template>

<script setup>
import GenericImportModal from '@/components/shared/GenericImportModal.vue'

defineProps({
  show: Boolean
})

defineEmits(['close', 'uploaded'])
</script>
