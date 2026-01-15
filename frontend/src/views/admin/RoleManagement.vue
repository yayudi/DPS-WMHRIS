<script setup>
import { ref, onMounted, computed, watch, nextTick } from 'vue'
// ✅ FIX: Impor 'useToast'
import { useToast } from '@/composables/useToast.js'
import {
  fetchAllRoles,
  fetchAllPermissions,
  fetchRolePermissions,
  updateRolePermissions,
  createRole,
  updateRole,
  deleteRole,
} from '@/api/helpers/roles.js' // Pastikan ini mengarah ke file helper yang benar
import Modal from '@/components/ui/Modal.vue'

// --- STATE ---
const { show } = useToast()
const allRoles = ref([])
const allPermissions = ref([])
const selectedRole = ref(null)
const selectedPermissionIds = ref([])
const originalPermissionIds = ref([]) // Untuk 'dirty state'
const isLoadingRoles = ref(true)
const isLoadingPermissions = ref(false)
const isSaving = ref(false)

// State untuk Modal (CRUD Peran)
const isRoleModalOpen = ref(false)
const isEditingRole = ref(false)
const roleForm = ref({ id: null, name: '', description: '' })
const roleToDelete = ref(null)

// --- COMPUTED ---

/**
 * Mengelompokkan izin (permissions) berdasarkan properti 'group'.
 */
const groupedPermissions = computed(() => {
  return allPermissions.value.reduce((acc, permission) => {
    const group = permission.group || 'Lainnya'
    if (!acc[group]) {
      acc[group] = []
    }
    acc[group].push(permission)
    return acc
  }, {})
})

/**
 * Mengecek apakah ada perubahan pada izin (permissions).
 */
const isDirty = computed(() => {
  if (isLoadingPermissions.value || !selectedRole.value) return false
  const currentIds = new Set(selectedPermissionIds.value)
  const originalIds = new Set(originalPermissionIds.value)
  return currentIds.size !== originalIds.size || [...currentIds].some((id) => !originalIds.has(id))
})

// --- METHODS ---

/**
 * Memuat semua data awal.
 */
async function loadInitialData() {
  isLoadingRoles.value = true
  try {
    const [roles, permissions] = await Promise.all([fetchAllRoles(), fetchAllPermissions()])
    allRoles.value = roles
    allPermissions.value = permissions
    if (roles.length > 0) {
      // Pilih peran pertama secara otomatis
      selectRole(roles[0])
    }
  } catch (error) {
    show('Gagal memuat data peran & izin.', 'error')
  } finally {
    isLoadingRoles.value = false
  }
}

onMounted(loadInitialData)

/**
 * Memilih peran dan memuat izin (permissions) yang terkait.
 */
async function selectRole(role) {
  if (
    isSaving.value ||
    (isDirty.value && !confirm('Ada perubahan belum disimpan. Yakin pindah?'))
  ) {
    return
  }
  selectedRole.value = role
  isLoadingPermissions.value = true
  try {
    const permissionIds = await fetchRolePermissions(role.id)
    selectedPermissionIds.value = permissionIds
    originalPermissionIds.value = [...permissionIds] // Simpan state asli
  } catch (error) {
    show(`Gagal memuat izin untuk peran ${role.name}.`, 'error')
    selectedPermissionIds.value = []
    originalPermissionIds.value = []
  } finally {
    isLoadingPermissions.value = false
  }
}

/**
 * Menyimpan perubahan izin (permissions) untuk peran yang dipilih.
 */
async function handleSavePermissions() {
  if (!selectedRole.value || !isDirty.value) return
  isSaving.value = true
  try {
    await updateRolePermissions(selectedRole.value.id, selectedPermissionIds.value)
    originalPermissionIds.value = [...selectedPermissionIds.value] // Set state asli baru
    show(`Izin untuk peran ${selectedRole.name} berhasil diperbarui.`, 'success')
  } catch (error) {
    show(error.message || 'Gagal menyimpan perubahan izin.', 'error')
  } finally {
    isSaving.value = false
  }
}

/**
 * Membuka modal untuk membuat peran baru.
 */
function openCreateRoleModal() {
  isEditingRole.value = false
  roleForm.value = { id: null, name: '', description: '' }
  isRoleModalOpen.value = true
}

/**
 * Membuka modal untuk mengedit peran yang ada.
 */
function openEditRoleModal(role) {
  isEditingRole.value = true
  roleForm.value = { ...role }
  isRoleModalOpen.value = true
}

/**
 * Menyimpan peran (baik baru maupun editan).
 */
async function handleSaveRole() {
  isSaving.value = true
  try {
    if (isEditingRole.value) {
      // Update
      const updatedRole = await updateRole(roleForm.value.id, roleForm.value)
      // Update data di 'allRoles'
      const index = allRoles.value.findIndex((r) => r.id === updatedRole.data.id)
      if (index !== -1) {
        allRoles.value[index] = updatedRole.data
      }
      // Update 'selectedRole' jika itu yang diedit
      if (selectedRole.value?.id === updatedRole.data.id) {
        selectedRole.value = updatedRole.data
      }
      show('Peran berhasil diperbarui.', 'success')
    } else {
      // Create
      const newRole = await createRole(roleForm.value)
      allRoles.value.push(newRole.data)
      show('Peran berhasil dibuat.', 'success')
    }
    isRoleModalOpen.value = false
    roleForm.value = { id: null, name: '', description: '' } // Reset form
  } catch (error) {
    show(error.message || 'Gagal menyimpan peran.', 'error')
  } finally {
    isSaving.value = false
  }
}

/**
 * Menghapus peran (setelah konfirmasi).
 */
async function handleDeleteRole(role) {
  if (
    !confirm(`Apakah Anda yakin ingin menghapus peran "${role.name}"? Ini tidak bisa dibatalkan.`)
  ) {
    return
  }
  isSaving.value = true
  try {
    await deleteRole(role.id)
    allRoles.value = allRoles.value.filter((r) => r.id !== role.id)
    // Jika peran yang dihapus adalah yang sedang dipilih
    if (selectedRole.value?.id === role.id) {
      selectedRole.value = allRoles.value[0] || null
    }
    show('Peran berhasil dihapus.', 'success')
  } catch (error) {
    show(error.message || 'Gagal menghapus peran.', 'error')
  } finally {
    isSaving.value = false
  }
}

/**
 * Memilih semua izin dalam satu grup.
 */
function toggleGroup(groupName, value) {
  const groupPermissionIds = groupedPermissions.value[groupName].map((p) => p.id)
  const currentPermissionSet = new Set(selectedPermissionIds.value)

  if (value) {
    // Select all in group
    groupPermissionIds.forEach((id) => currentPermissionSet.add(id))
  } else {
    // Deselect all in group
    groupPermissionIds.forEach((id) => currentPermissionSet.delete(id))
  }
  selectedPermissionIds.value = [...currentPermissionSet]
}
</script>

<template>
  <div class="p-6">
    <h2 class="text-2xl font-bold text-text mb-6">Manajemen Peran & Izin</h2>

    <div class="grid grid-cols-1 md:grid-cols-4 gap-6">
      <!-- Kolom Kiri: Daftar Peran -->
      <div class="md:col-span-1">
        <div class="flex justify-between items-center mb-2">
          <h3 class="font-semibold text-text">Daftar Peran</h3>
          <button
            @click="openCreateRoleModal"
            class="px-2 py-1 bg-primary text-white text-xs font-bold rounded-md hover:bg-primary/80"
          >
            <font-awesome-icon icon="fa-solid fa-plus" />
            Baru
          </button>
        </div>
        <div v-if="isLoadingRoles" class="text-center text-text/60">Memuat peran...</div>
        <ul v-else class="space-y-1">
          <li v-for="role in allRoles" :key="role.id" class="group">
            <button
              @click="selectRole(role)"
              :class="[
                'w-full text-left px-3 py-2 rounded-md transition-colors text-sm flex justify-between items-center',
                selectedRole?.id === role.id
                  ? 'bg-primary text-white font-semibold'
                  : 'text-text/80 hover:bg-secondary/20',
              ]"
            >
              <span class="flex-1 truncate pr-2">{{ role.name }}</span>
              <div
                :class="[
                  'flex-shrink-0 space-x-2',
                  selectedRole?.id === role.id
                    ? 'opacity-100'
                    : 'opacity-0 group-hover:opacity-100 transition-opacity',
                ]"
              >
                <button
                  @click.stop="openEditRoleModal(role)"
                  class="text-xs font-semibold"
                  :class="
                    selectedRole?.id === role.id ? 'text-white/70 hover:text-white' : 'text-primary'
                  "
                >
                  Edit
                </button>
                <button
                  @click.stop="handleDeleteRole(role)"
                  class="text-xs font-semibold"
                  :class="
                    selectedRole?.id === role.id
                      ? 'text-accent/70 hover:text-accent'
                      : 'text-accent'
                  "
                >
                  Hapus
                </button>
              </div>
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
            <div
              class="flex flex-col sm:flex-row justify-between sm:items-center gap-4 mb-4 pb-4 border-b border-secondary/20"
            >
              <div>
                <h3 class="text-lg font-bold text-text">
                  Izin untuk: <span class="text-primary">{{ selectedRole.name }}</span>
                </h3>
                <p class="text-sm text-text/60">{{ selectedRole.description }}</p>
              </div>
              <button
                @click="handleSavePermissions"
                :disabled="isSaving || !isDirty"
                class="px-4 py-2 bg-primary text-white text-sm font-semibold rounded-lg disabled:opacity-50 transition-all w-full sm:w-auto"
                :class="isDirty ? 'ring-2 ring-primary/50 ring-offset-2' : ''"
              >
                <font-awesome-icon icon="fa-solid fa-save" class="mr-2" />
                {{ isSaving ? 'Menyimpan...' : 'Simpan Perubahan' }}
              </button>
            </div>

            <div v-if="isLoadingPermissions" class="text-center py-16">Memuat izin...</div>
            <div v-else class="space-y-6 max-h-[60vh] overflow-y-auto">
              <!-- v-for untuk Grup Izin -->
              <div
                v-for="(permissionsInGroup, groupName) in groupedPermissions"
                :key="groupName"
                class="border border-secondary/20 rounded-lg"
              >
                <div
                  class="bg-secondary/10 px-4 py-2 flex flex-col sm:flex-row justify-between items-start sm:items-center border-b border-secondary/20 gap-2"
                >
                <h4 class="font-bold text-text/90">{{ groupName }}</h4>
                <div class="flex gap-4 text-xs font-semibold">
                  <button
                    @click="toggleGroup(groupName, true)"
                    class="text-primary hover:underline"
                  >
                    Pilih Semua
                  </button>
                  <button
                    @click="toggleGroup(groupName, false)"
                    class="text-accent hover:underline"
                  >
                    Batal Semua
                  </button>
                </div>
              </div>
              <div class="p-4 space-y-3">
                <!-- v-for untuk setiap Izin dalam Grup -->
                <div
                  v-for="permission in permissionsInGroup"
                  :key="permission.id"
                  class="flex items-start p-2 rounded-md hover:bg-secondary/10"
                >
                  <input
                    type="checkbox"
                    :id="`perm-${permission.id}`"
                    :value="permission.id"
                    v-model="selectedPermissionIds"
                    class="h-4 w-4 mt-1 rounded border-secondary/30 text-primary focus:ring-primary cursor-pointer"
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
    </div>
  </div>

  <!-- Modal untuk Tambah/Edit Peran -->
  <Modal
    :show="isRoleModalOpen"
    @close="isRoleModalOpen = false"
    :title="isEditingRole ? 'Edit Peran' : 'Buat Peran Baru'"
  >
    <form @submit.prevent="handleSaveRole" class="p-6 space-y-4">
      <div>
        <label for="roleName" class="block text-sm font-medium text-text/80 mb-1">Nama Peran</label>
        <input
          id="roleName"
          v-model="roleForm.name"
          type="text"
          required
          class="w-full input-field"
          placeholder="e.g., supervisor_gudang"
        />
        <p class="text-xs text-text/60 mt-1">Gunakan huruf kecil dan underscore.</p>
      </div>
      <div>
        <label for="roleDesc" class="block text-sm font-medium text-text/80 mb-1">Deskripsi</label>
        <input
          id="roleDesc"
          v-model="roleForm.description"
          type="text"
          required
          class="w-full input-field"
          placeholder="e.g., Supervisor Gudang"
        />
        <p class="text-xs text-text/60 mt-1">Deskripsi yang mudah dibaca.</p>
      </div>
    </form>
    <template #footer>
      <button type="button" @click="isRoleModalOpen = false" class="btn-secondary">Batal</button>
      <button
        type="submit"
        @click="handleSaveRole"
        class="btn-primary"
        :disabled="isSaving || !roleForm.name || !roleForm.description"
      >
        {{ isSaving ? 'Menyimpan...' : 'Simpan' }}
      </button>
    </template>
  </Modal>
</template>

<style lang="postcss" scoped>
.input-field {
  @apply w-full px-3 py-2 bg-background border border-secondary/50 rounded-lg focus:ring-primary focus:border-primary;
}
.btn-primary {
  @apply bg-primary text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-primary/90 disabled:opacity-50;
}
.btn-secondary {
  @apply bg-background border border-secondary/30 px-4 py-2 rounded-lg text-sm font-semibold hover:bg-secondary/20;
}
</style>
