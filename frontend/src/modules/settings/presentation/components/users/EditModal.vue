<script setup>
import { ref, watch, computed } from 'vue'
import { useMagicKeys } from '@vueuse/core'
import { useToast } from '@/core/presentation/composables/useToast'
import { useI18n } from '@/core/infrastructure/localization'
import { userApi } from '@/modules/settings/infrastructure/user.api'
import BaseModal from '@/core/presentation/components/ui/BaseModal.vue'
import BaseSelect from '@/core/presentation/components/ui/BaseSelect.vue'

const props = defineProps({
  show: Boolean,
  user: Object,
  roles: Array,
  shifts: Array,
})

const emit = defineEmits(['close', 'updated'])
const { toast } = useToast()
const { t } = useI18n()
const editableUser = ref({})
const isLoading = ref(false)

const shiftOptions = computed(() => {
  return [
    { id: null, label: t('settings.user.shift_default') },
    ...(props.shifts || []).map(s => ({
      id: s.id,
      label: `${s.name} (${s.start_time?.slice(0, 5)} - ${s.end_time?.slice(0, 5)})`
    }))
  ]
})

// Salin data user ke state lokal saat modal dibuka
watch(
  () => props.user,
  (newUser) => {
    if (newUser) {
      editableUser.value = {
        username: newUser.username,
        nickname: newUser.nickname || '',
        role_id: newUser.role_id,
        shift_id: newUser.shift_id,
        newPassword: '', // Selalu kosongkan field password
      }
    }
  },
  { immediate: true },
)

async function handleSave() {
  isLoading.value = true
  try {
    const res = await userApi.updateUser(props.user.id, editableUser.value)
    toast(res?.message || t('common.status.success'), 'success')
    emit('updated')
    emit('close')
  } catch (error) {
    console.error(error) // Auto-added to prevent unused var
  } finally {
    isLoading.value = false
  }
}

// --- LOCAL HOTKEYS ---
const { Alt_S } = useMagicKeys()

watch(Alt_S, (pressed) => {
  if (pressed && props.show && !isLoading.value) {
    handleSave()
  }
})
</script>

<template>
  <BaseModal :show="props.show" @close="emit('close')" :title="t('settings.user.edit_title_user', { username: user?.username || '' })">
    <div v-if="user" class="p-6 space-y-4">
      <div>
        <label class="block text-sm font-medium text-text/80 mb-1">{{ t('common.auth.username') }}</label>
        <input v-model="editableUser.username" type="text" required class="w-full input-field" />
      </div>
      <div>
        <label class="block text-sm font-medium text-text/80 mb-1">{{ t('settings.user.nickname') }}</label>
        <input v-model="editableUser.nickname" type="text" class="w-full input-field" />
      </div>
      <div>
        <label class="block text-sm font-medium text-text/80 mb-1">{{ t('settings.user.new_password_optional') }}</label>
        <input v-model="editableUser.newPassword" type="password" :placeholder="t('settings.user.new_password_hint')"
          class="w-full input-field" />
      </div>
      <div>
        <label class="block text-sm font-medium text-text/80 mb-1">{{ t('settings.user.role') }}</label>
        <BaseSelect v-model="editableUser.role_id" :options="roles" track-by="id" label="name" emit-value
          :placeholder="t('settings.user.select_role')" />
      </div>
      <div>
        <label class="block text-sm font-medium text-text/80 mb-1">{{ t('settings.user.shift') }}</label>
        <BaseSelect v-model="editableUser.shift_id" :options="shiftOptions" track-by="id" emit-value
          :placeholder="t('settings.user.select_shift')" />
      </div>
    </div>
    <template #footer>
      <div class="flex gap-4 justify-center pb-6 px-4">
        <button @click="emit('close')" class="btn-secondary flex items-center gap-2">
          <font-awesome-icon icon="fa-solid fa-times" />
          {{ t('common.btn.cancel') }}
        </button>
        <button @click="handleSave" :disabled="isLoading" class="btn-primary flex items-center gap-2">
          <font-awesome-icon v-if="isLoading" icon="fa-solid fa-spinner" spin />
          <font-awesome-icon v-else icon="fa-solid fa-save" />
          <span>{{ isLoading ? t('common.status.saving') : t('common.btn.save_changes') }}</span>
        </button>
      </div>
    </template>

  </BaseModal>
</template>

<style lang="postcss" scoped>
.input-field {
  @apply w-full px-3 py-2 bg-background border border-secondary/50 rounded-lg focus:ring-primary focus:border-primary;
}

.btn-primary {
  @apply bg-primary text-secondary px-4 py-2 rounded-lg text-sm font-semibold hover:bg-primary/90 disabled:opacity-50;
}

.btn-secondary {
  @apply bg-background border border-secondary/30 px-4 py-2 rounded-lg text-sm font-semibold hover:bg-secondary/20;
}
</style>
