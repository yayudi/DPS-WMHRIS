<script setup>
import { ref, onMounted, watch } from 'vue'
import { useToast } from '@/composables/UseToast.js'
import {
  fetchAllRoles,
  fetchAllPermissions,
  fetchRolePermissions,
  updateRolePermissions,
} from '@/api/helpers/roles.js'

const { show } = useToast()

// State
const allRoles = ref([])
const allPermissions = ref([])
const selectedRole = ref(null)
const selectedPermissionIds = ref([])
const isLoading = ref(true)
const isSaving = ref(false)

// Muat data awal saat komponen dimuat
onMounted(async () => {
  isLoading.value = true
  try {
    const [roles, permissions] = await Promise.all([fetchAllRoles(), fetchAllPermissions()])
    allRoles.value = roles
    allPermissions.value = permissions
    // Pilih peran pertama secara default jika ada
    if (roles.length > 0) {
      selectedRole.value = roles[0]
    }
  } catch (error) {
    show('Gagal memuat data peran & izin.', 'error')
  } finally {
    isLoading.value = false
  }
})

// Watcher untuk mengambil izin saat peran yang dipilih berubah
watch(selectedRole, async (newRole) => {
  if (newRole) {
    isLoading.value = true
    try {
      selectedPermissionIds.value = await fetchRolePermissions(newRole.id)
    } catch (error) {
      show(`Gagal memuat izin untuk peran ${newRole.name}.`, 'error')
    } finally {
      isLoading.value = false
    }
  }
})

// Fungsi untuk menyimpan perubahan
async function handleSavePermissions() {
  if (!selectedRole.value) return

  isSaving.value = true
  try {
    await updateRolePermissions(selectedRole.value.id, selectedPermissionIds.value)
    show(`Izin untuk peran ${selectedRole.value.name} berhasil diperbarui.`, 'success')
  } catch (error) {
    show('Gagal menyimpan perubahan.', 'error')
  } finally {
    isSaving.value = false
  }
}
</script>

<template>
  <div class="p-6">
    <h2 class="text-2xl font-bold text-text mb-6">Manajemen Peran & Izin</h2>

    <div class="grid grid-cols-1 md:grid-cols-4 gap-6">
      <!-- Kolom Kiri: Daftar Peran -->
      <div class="md:col-span-1">
        <h3 class="font-semibold text-text mb-2">Pilih Peran</h3>
        <div v-if="isLoading && allRoles.length === 0">Memuat peran...</div>
        <ul v-else class="space-y-1">
          <li v-for="role in allRoles" :key="role.id">
            <button
              @click="selectedRole = role"
              :class="[
                'w-full text-left px-3 py-2 rounded-md transition-colors text-sm',
                selectedRole?.id === role.id
                  ? 'bg-primary text-white font-semibold'
                  : 'hover:bg-secondary/20',
              ]"
            >
              {{ role.name }}
            </button>
          </li>
        </ul>
      </div>

      <!-- Kolom Kanan: Daftar Izin -->
      <div class="md:col-span-3 bg-background rounded-xl shadow-md border border-secondary/20 p-6">
        <div v-if="!selectedRole" class="text-center text-text/60 py-16">
          Pilih sebuah peran di sebelah kiri untuk melihat dan mengedit izinnya.
        </div>
        <div v-else>
          <div class="flex justify-between items-center mb-4">
            <h3 class="text-lg font-bold text-text">
              Izin untuk: <span class="text-primary">{{ selectedRole.name }}</span>
            </h3>
            <button
              @click="handleSavePermissions"
              :disabled="isSaving"
              class="px-4 py-2 bg-primary text-white text-sm font-semibold rounded-lg disabled:opacity-50"
            >
              {{ isSaving ? 'Menyimpan...' : 'Simpan Perubahan' }}
            </button>
          </div>

          <div v-if="isLoading" class="text-center py-16">Memuat izin...</div>
          <div v-else class="space-y-3 max-h-[60vh] overflow-y-auto">
            <div
              v-for="permission in allPermissions"
              :key="permission.id"
              class="flex items-start p-3 rounded-md hover:bg-secondary/10"
            >
              <input
                type="checkbox"
                :id="`perm-${permission.id}`"
                :value="permission.id"
                v-model="selectedPermissionIds"
                class="h-4 w-4 mt-1 rounded border-gray-300 text-primary focus:ring-primary"
              />
              <div class="ml-3">
                <label
                  :for="`perm-${permission.id}`"
                  class="font-mono text-sm font-semibold text-text cursor-pointer"
                  >{{ permission.name }}</label
                >
                <p class="text-xs text-text/70">{{ permission.description }}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
