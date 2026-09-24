<!-- frontend/src/views/media/BulkEditTagsModal.vue -->
<script setup>
import { swalConfirm, swalAlert } from '@/composables/useSweetAlert'
import { ref, watch } from 'vue'
import apiClient from '@/api/axios'
import BaseModal from '@/components/ui/BaseModal.vue'
import { useToast } from '@/composables/useToast.js'

const props = defineProps({
  show: Boolean,
  selectedMediaIds: Array
})

const emit = defineEmits(['close', 'updated'])
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
    await swalAlert('Masukkan setidaknya 1 tag.')
    return
  }

  if (
    !(await swalConfirm(
      `Terapkan ${rawTags.length} tag ini ke ${props.selectedMediaIds?.length || 0} gambar terpilih?`
    ))
  )
    return

  isSubmitting.value = true
  try {
    let successCount = 0
    // Sequential loop to save DB connection pool
    for (const id of props.selectedMediaIds) {
      const res = await apiClient.put(`/media/${id}/tags`, { tags: rawTags })
      if (res.data.success) successCount++
    }
    toast(`Berhasil memperbarui tag untuk ${successCount} gambar.`, 'success')
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
        <h3 class="text-lg font-bold text-text">Label Masal (Tagging)</h3>
        <p class="text-xs text-text/60 mt-1 font-normal">
          Timpa tag pada {{ selectedMediaIds?.length || 0 }} gambar terpilih.
        </p>
      </div>
    </template>

    <div>
      <label class="block text-sm font-semibold text-text/80 mb-2">Masukkan Label (Pisahkan dgn koma)</label>
      <textarea
        v-model="tagsInput"
        rows="3"
        placeholder="contoh: promo2026, banner depan, poster"
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
          Batal
        </button>
        <button
          @click="submitTags"
          class="px-5 py-2 font-bold text-background bg-primary hover:bg-accent rounded-lg transition-colors flex items-center gap-2"
          :disabled="isSubmitting"
        >
          <font-awesome-icon v-if="isSubmitting" icon="fa-solid fa-spinner" spin />
          Terapkan Tag
        </button>
      </div>
    </template>
  </BaseModal>
</template>
