<template>
  <GenericImportModal
    :isOpen="show"
    :title="t('master_data.media.bulk_link_title')"
    templateUrl="/media/bulk-link-template"
    templateFilename="Template_Tautkan_Media.xlsx"
    uploadUrl="/media/bulk-link-excel"
    jobType="IMPORT_MEDIA_BULK_LINK"
    :instructions="[
      t('master_data.media.bulk_link_instr_1'),
      t('master_data.media.bulk_link_instr_2'),
      t('master_data.media.bulk_link_instr_3')
    ]"
    @close="$emit('close')"
    @success="$emit('uploaded')"
  />
</template>

<script setup>
import GenericImportModal from '@/core/presentation/components/shared/GenericImportModal.vue'
import { useI18n } from '@/core/presentation/composables/useI18n'

const { t } = useI18n()

defineProps({
  show: Boolean
})

defineEmits(['close', 'uploaded'])
</script>
