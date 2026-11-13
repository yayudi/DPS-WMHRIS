<script setup>
import { swalConfirm, swalAlert } from '@/core/presentation/composables/useSweetAlert'
import { ref, watch } from 'vue'
import { mediaApi } from '@/modules/master_data/infrastructure/media.api'
import BaseModal from '@/core/presentation/components/ui/BaseModal.vue'
import { useToast } from '@/core/presentation/composables/useToast'
import { useI18n } from '@/core/presentation/composables/useI18n'

const props = defineProps({
  show: Boolean,
  selectedMediaIds: Array
})

const emit = defineEmits(['close', 'updated'])
const { t } = useI18n()
const tagsInput = ref('')
const isSubmitting = ref(false)
const { toast } = useToast()

watch(
  () => props.show,
  newVal => {
    if (newVal) {
      tagsInput.value = ''
    }
  }
)

const submitTags = async () => {
  if (isSubmitting.value) return
  const rawTags = tagsInput.value
    .split(',')
    .map(t => t.trim())
    .filter(Boolean)
  if (rawTags.length === 0) {
    await swalAlert(t('core.media.tag_input_required'))
    return
  }

  if (
    !(await swalConfirm(
      t('core.media.tag_confirm_apply', {
        tagCount: rawTags.length,
        mediaCount: props.selectedMediaIds?.length || 0
      })
    ))
  )
    return

  isSubmitting.value = true
  try {
    let successCount = 0
    // Sequential loop to save DB connection pool
    for (const id of props.selectedMediaIds) {
      await mediaApi.updateMediaTags(id, rawTags)
      successCount++
    }
    toast(t('core.media.tag_update_success', { count: successCount }), 'success')
    emit('updated')
    close()
  } catch (error) {
    console.error(error)
    emit('updated')
    close()
  } finally {
    isSubmitting.value = false
  }
}

const close = () => {
  if (isSubmitting.value) return
  emit('close')
}
</script>

<template>
  <BaseModal :show="show" @close="close" maxWidth="max-w-md">
    <template #title>
      <div class="-mt-1">
        <h3 class="text-lg font-bold text-text">{{ t('core.media.tag_bulk_title') }}</h3>
        <p class="text-xs text-text/60 mt-1 font-normal">
          {{ t('core.media.tag_bulk_subtitle', { count: selectedMediaIds?.length || 0 }) }}
        </p>
      </div>
    </template>

    <div>
      <label class="block text-sm font-semibold text-text/80 mb-2">{{ t('core.media.tag_input_label') }}</label>
      <textarea
        v-model="tagsInput"
        rows="3"
        :placeholder="t('core.media.tag_input_placeholder')"
        class="textarea textarea-bordered w-full bg-background text-text border-secondary focus:border-primary"
      ></textarea>
    </div>

    <!-- Footer -->
    <template #footer>
      <div class="flex justify-end gap-3">
        <button
          @click="close"
          class="px-4 py-2 font-semibold text-text hover:bg-secondary/20 rounded-lg transition-colors"
          :disabled="isSubmitting"
        >
          {{ t('common.btn.cancel') }}
        </button>
        <button
          @click="submitTags"
          class="px-5 py-2 font-bold text-background bg-primary hover:bg-accent rounded-lg transition-colors flex items-center gap-2"
          :disabled="isSubmitting"
        >
          <font-awesome-icon v-if="isSubmitting" icon="fa-solid fa-spinner" spin />
          {{ t('core.media.tag_apply_btn') }}
        </button>
      </div>
    </template>
  </BaseModal>
</template>
