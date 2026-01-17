<!-- frontend\src\components\UserEditModal.vue -->
<script setup>
import { ref, watch } from 'vue'
import { useToast } from '@/composables/useToast.js'
import { updateUser } from '@/api/helpers/admin.js'
import Modal from '@/components/ui/Modal.vue'

const props = defineProps({
  show: Boolean,
  user: Object,
  roles: Array,
})

const emit = defineEmits(['close', 'updated'])
const { show } = useToast()

const editableUser = ref({})
const isLoading = ref(false)

// Salin data user ke state lokal saat modal dibuka
watch(
  () => props.user,
  (newUser) => {
    if (newUser) {
      editableUser.value = {
        username: newUser.username,
        nickname: newUser.nickname || '',
        role_id: newUser.role_id,
        newPassword: '', // Selalu kosongkan field password
      }
    }
  },
  { immediate: true },
)

async function handleSave() {
  isLoading.value = true
  try {
    await updateUser(props.user.id, editableUser.value)
    show('Data pengguna berhasil diperbarui.', 'success')
    emit('updated')
    emit('close')
  } catch (error) {
    show(error.response?.data?.message || 'Gagal menyimpan perubahan.', 'error')
  } finally {
    isLoading.value = false
  }
}
</script>

<template>
  <Modal :show="props.show" @close="emit('close')" :title="`Edit Pengguna: ${user?.username}`">
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
        <select v-model="editableUser.role_id" required class="w-full input-field">
          <option v-for="role in roles" :key="role.id" :value="role.id">{{ role.name }}</option>
        </select>
      </div>
    </div>
    <template #footer>
      <button @click="emit('close')" class="btn-secondary flex items-center gap-2">
        <font-awesome-icon icon="fa-solid fa-times" />
        Batal
      </button>
      <button @click="handleSave" :disabled="isLoading" class="btn-primary flex items-center gap-2">
        <font-awesome-icon v-if="isLoading" icon="fa-solid fa-spinner" spin />
        <font-awesome-icon v-else icon="fa-solid fa-save" />
        <span>{{ isLoading ? 'Menyimpan...' : 'Simpan Perubahan' }}</span>
      </button>
    </template>

  </Modal>
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
