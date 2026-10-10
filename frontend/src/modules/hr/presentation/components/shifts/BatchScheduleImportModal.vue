<template>
  <GenericImportModal
    :isOpen="isOpen"
    title="Import Jadwal Shift"
    templateUrl="/schedules/template"
    templateFilename="Template_Jadwal_Shift.xlsx"
    uploadUrl="/schedules/import"
    :instructions="['Gunakan Template Excel yang disediakan.', 'Kolom Wajib: Username, Date (YYYY-MM-DD), Shift Name.', 'Pastikan nama shift sesuai dengan Master Shift.']"
    @close="$emit('close')"
    @success="$emit('success')"
  />
</template>

<script setup>
import GenericImportModal from '@/core/presentation/components/shared/GenericImportModal.vue'

defineProps({
  isOpen: Boolean
})

defineEmits(['close', 'success'])
</script>

