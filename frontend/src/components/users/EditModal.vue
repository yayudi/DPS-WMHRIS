\src\components\UserEditModal.vue -->
<script setup>
import { ref, watch, computed } from 'vue'
import { useMagicKeys } from '@vueuse/core'
import { useToast } from '@/composables/useToast'
import { userApi } from '@/modules/settings/infrastructure/user.api'
import BaseModal from '@/components/ui/BaseModal.vue'
import BaseSelect from '@/components/ui/BaseSelect.vue'

const props = defineProps({
  show: Boolean,
  user: Object,
  roles: Array,
  shifts: Array,
})

const emit = defineEmits(['close', 'updated'])
const { toast } = useToast()
const editableUser = ref({})
const isLoading = ref(false)

const shiftOptions = computed(() => {
  return [
    { id: null, label: 'Default (Regular Office)' },
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
    await userApi.updateUser(props.user.id, editableUser.value)
    toast('Data pengguna berhasil diperbarui.', 'success')
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
  <BaseModal :show="props.show" @close="emit('close')" :title="`Edit Pengguna: ${user?.username}`">
    <div v-if="user" class="p-6 space-y-4">
      <div>
        <label class="block text-sm font-medium text-text/80 mb-1">Username</label>
        <input v-model="editableUser.username" type="text" required class="w-full input-field" />
      </div>
      <div>
        <label class="block text-sm font-medium text-text/80 mb-1">Nickname</label>
        <input v-model="editableUser.nickname" type="text" class="w-full input-field" />
      </div>
      <div>
        <label class="block text-sm font-medium text-text/80 mb-1">Password Baru (Opsional)</label>
        <input v-model="editableUser.newPassword" type="password" placeholder="Isi hanya jika ingin mengubah password"
          class="w-full input-field" />
      </div>
      <div>
        <label class="block text-sm font-medium text-text/80 mb-1">Role</label>
        <BaseSelect v-model="editableUser.role_id" :options="roles" track-by="id" label="name" emit-value
          placeholder="Pilih Role" />
      </div>
      <div>
        <label class="block text-sm font-medium text-text/80 mb-1">Shift</label>
        <BaseSelect v-model="editableUser.shift_id" :options="shiftOptions" track-by="id" emit-value
          placeholder="Pilih Shift" />
      </div>
    </div>
    <template #footer>
      <div class="flex gap-4 justify-center pb-6 px-4">
        <button @click="emit('close')" class="btn-secondary flex items-center gap-2">
          <font-awesome-icon icon="fa-solid fa-times" />
          Batal
        </button>
        <button @click="handleSave" :disabled="isLoading" class="btn-primary flex items-center gap-2">
          <font-awesome-icon v-if="isLoading" icon="fa-solid fa-spinner" spin />
          <font-awesome-icon v-else icon="fa-solid fa-save" />
          <span>{{ isLoading ? 'Menyimpan...' : 'Simpan Perubahan' }}</span>
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
