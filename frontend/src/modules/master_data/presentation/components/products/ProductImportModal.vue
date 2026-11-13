<template>
  <GenericImportModal
    :isOpen="isOpen"
    :title="t('master_data.product.import_title')"
    templateUrl="/products/template"
    templateFilename="Template_Produk.xlsx"
    uploadUrl="/products/batch/product-update"
    :jobType="['BATCH_EDIT_PRODUCT', 'BATCH_EDIT_PRODUCT_DRY_RUN']"
    :additionalData="{ dryRun: isDryRun }"
    :instructions="[
      t('master_data.product.import_instruction_1'),
      t('master_data.product.import_instruction_2'),
      t('master_data.product.import_instruction_3'),
      t('master_data.product.import_instruction_4')
    ]"
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
          {{ t('master_data.product.dry_run_title') }}
        </label>
        <span
          class="text-xs bg-background px-2 py-1 rounded text-text/60 border border-secondary/20 shadow-sm"
        >
          {{ t('master_data.product.dry_run_desc') }}
        </span>
      </div>
    </template>
  </GenericImportModal>
</template>

<script setup>
import { ref } from 'vue'
import GenericImportModal from '@/core/presentation/components/shared/GenericImportModal.vue'
import { useI18n } from '@/core/presentation/composables/useI18n'

const { t } = useI18n()

defineProps({
  isOpen: Boolean
})

defineEmits(['close', 'success'])

const isDryRun = ref(false)
</script>

