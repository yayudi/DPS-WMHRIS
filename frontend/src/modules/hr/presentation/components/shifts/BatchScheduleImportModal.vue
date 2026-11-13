<template>
  <GenericImportModal
    :isOpen="isOpen"
    :title="t('hris.shift.import_schedule_title')"
    templateUrl="/schedules/template"
    templateFilename="Template_Jadwal_Shift.xlsx"
    uploadUrl="/schedules/import"
    jobType="IMPORT_SCHEDULES"
    :instructions="instructions"
    @close="$emit('close')"
    @success="$emit('success')"
  />
</template>

<script setup>
import { computed } from 'vue'
import GenericImportModal from '@/core/presentation/components/shared/GenericImportModal.vue'
import { useI18n } from '@/core/presentation/composables/useI18n'

const { t } = useI18n()

defineProps({
  isOpen: Boolean
})

defineEmits(['close', 'success'])

const instructions = computed(() => [
  t('hris.shift.import_inst_1'),
  t('hris.shift.import_inst_2'),
  t('hris.shift.import_inst_3')
])
</script>

