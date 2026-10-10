<script setup lang="ts">
import { swalConfirm } from '@/composables/useSweetAlert'
import { ref, onMounted, computed, watch } from 'vue'
import { useMagicKeys } from '@vueuse/core'
import BaseModal from '@/components/ui/BaseModal.vue'
import { useMobile } from '@/composables/useMobile'
import { useRoles } from '../../application/useRoles'
import type { Role, Permission, CreateRolePayload, UpdateRolePayload } from '../../domain/role.entity'

// --- STATE ---
const { isMobile } = useMobile()
const {
  roles: allRoles,
  permissions: allPermissions,
  isLoading: isLoadingRoles,
  fetchRoles,
  fetchPermissions,
  fetchRolePermissions,
  createRole,
  updateRole,
  deleteRole,
  updateRolePermissions
} = useRoles()

const selectedRole = ref<Role | null>(null)
const selectedPermissionIds = ref<number[]>([])
const originalPermissionIds = ref<number[]>([])
const isLoadingPermissions = ref(false)
const isSaving = ref(false)
const isRoleModalOpen = ref(false)
const isEditingRole = ref(false)
const roleForm = ref<UpdateRolePayload & { id: number | null }>({ id: null, name: '', description: '' })

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
  }, {} as Record<string, Permission[]>)
})

/**
 * Mengecek apakah ada perubahan pada izin (permissions).
 */
const isDirty = computed(() => {
  if (isLoadingPermissions.value || !selectedRole.value) return false
  const currentIds = new Set(selectedPermissionIds.value)
  const originalIds = new Set(originalPermissionIds.value)
  return currentIds.size !== originalIds.size || [...currentIds].some(id => !originalIds.has(id))
})

// --- METHODS ---

/**
 * Memuat semua data awal.
 */
async function loadInitialData() {
  await Promise.all([fetchRoles(), fetchPermissions()])
  if (allRoles.value.length > 0) {
    // Pilih peran pertama secara otomatis
    selectRole(allRoles.value[0])
  }
}

onMounted(loadInitialData)

/**
 * Memilih peran dan memuat izin (permissions) yang terkait.
 */
async function selectRole(role: Role) {
  if (isSaving.value || (isDirty.value && !(await swalConfirm('Ada perubahan belum disimpan. Yakin pindah?')))) {
    return
  }
  selectedRole.value = role
  isLoadingPermissions.value = true
  try {
    const permissionIds = await fetchRolePermissions(role.id)
    selectedPermissionIds.value = permissionIds
    originalPermissionIds.value = [...permissionIds] // Simpan state asli
  } catch {
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
    const success = await updateRolePermissions(selectedRole.value.id, selectedPermissionIds.value)
    if (success) {
      originalPermissionIds.value = [...selectedPermissionIds.value] // Set state asli baru
    }
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
function openEditRoleModal(role: Role) {
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
    if (isEditingRole.value && roleForm.value.id) {
      // Update
      const success = await updateRole(roleForm.value.id, {
        name: roleForm.value.name,
        description: roleForm.value.description
      })
      if (success && selectedRole.value?.id === roleForm.value.id) {
        // reload selection
        selectedRole.value = allRoles.value.find(r => r.id === roleForm.value.id) || null
      }
    } else {
      // Create
      await createRole({
        name: roleForm.value.name as string,
        description: roleForm.value.description
      })
    }
    isRoleModalOpen.value = false
    roleForm.value = { id: null, name: '', description: '' } // Reset form
  } finally {
    isSaving.value = false
  }
}

/**
 * Menghapus peran (setelah konfirmasi).
 */
async function handleDeleteRole(role: Role) {
  if (!(await swalConfirm(`Apakah Anda yakin ingin menghapus peran "${role.name}"? Ini tidak bisa dibatalkan.`))) {
    return
  }
  isSaving.value = true
  try {
    const success = await deleteRole(role.id)
    if (success && selectedRole.value?.id === role.id) {
      selectedRole.value = allRoles.value[0] || null
    }
  } finally {
    isSaving.value = false
  }
}

/**
 * Memilih semua izin dalam satu grup.
 */
function toggleGroup(groupName: string, value: boolean) {
  const groupPermissionIds = groupedPermissions.value[groupName].map(p => p.id)
  const currentPermissionSet = new Set(selectedPermissionIds.value)

  if (value) {
    // Select all in group
    groupPermissionIds.forEach(id => currentPermissionSet.add(id))
  } else {
    // Deselect all in group
    groupPermissionIds.forEach(id => currentPermissionSet.delete(id))
  }
  selectedPermissionIds.value = [...currentPermissionSet]
}

// --- LOCAL HOTKEYS ---
const { Alt_N, Alt_S } = useMagicKeys()

watch(Alt_N, pressed => {
  if (pressed && !isRoleModalOpen.value) {
    openCreateRoleModal()
  }
})

watch(Alt_S, pressed => {
  if (pressed) {
    if (isRoleModalOpen.value && roleForm.value.name && roleForm.value.description && !isSaving.value) {
      handleSaveRole()
    } else if (!isRoleModalOpen.value && selectedRole.value && isDirty.value && !isSaving.value) {
      handleSavePermissions()
    }
  }
})
</script>

<template>
  <div class="grid grid-cols-1 md:grid-cols-4 gap-6">
    <!-- Kolom Kiri: Daftar Peran -->
    <div class="md:col-span-1">
      <div class="flex justify-between items-center mb-2">
        <h3 class="font-semibold text-text">Daftar Peran</h3>
        <button
          @click="openCreateRoleModal"
          class="px-2 py-1 bg-primary text-secondary text-xs font-bold rounded-md hover:bg-primary/80 flex items-center gap-1"
        >
          <font-awesome-icon icon="fa-solid fa-plus" />
          <span>Baru</span>
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
                ? 'bg-primary/10 text-primary font-semibold ring-1 ring-primary'
                : 'text-text/80 hover:bg-secondary/20'
            ]"
          >
            <span class="flex-1 truncate pr-2">{{ role.name }}</span>
            <div
              :class="[
                'flex-shrink-0 space-x-2',
                isMobile || selectedRole?.id === role.id
                  ? 'opacity-100'
                  : 'opacity-0 group-hover:opacity-100 transition-opacity'
              ]"
            >
              <button
                @click.stop="openEditRoleModal(role)"
                class="text-xs font-semibold"
                :class="
                  selectedRole?.id === role.id
                    ? 'text-accent/70 hover:text-accent'
                    : 'text-primary/70 hover:text-primary'
                "
              >
                <font-awesome-icon icon="fa-solid fa-edit" />
              </button>
              <button
                @click.stop="handleDeleteRole(role)"
                class="text-xs font-semibold"
                :class="
                  selectedRole?.id === role.id ? 'text-danger/70 hover:text-danger' : 'text-danger/70 hover:text-danger'
                "
              >
                <font-awesome-icon icon="fa-solid fa-trash" />
              </button>
            </div>
          </button>
        </li>
      </ul>
    </div>

    <!-- Kolom Kanan: Daftar Izin -->
    <div class="md:col-span-3 bg-secondary/5 rounded-xl shadow-md border border-secondary/20 p-6">
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
            class="px-4 py-2 bg-primary text-secondary text-sm font-semibold rounded-lg disabled:opacity-50 transition-all w-full sm:w-auto flex items-center justify-center gap-2"
            :class="isDirty ? 'ring-2 ring-primary/50 ring-offset-2' : ''"
          >
            <font-awesome-icon v-if="isSaving" icon="fa-solid fa-spinner" spin />
            <font-awesome-icon v-else icon="fa-solid fa-save" />
            <span>{{ isSaving ? 'Menyimpan...' : 'Simpan Perubahan' }}</span>
          </button>
        </div>

        <div v-if="isLoadingPermissions" class="text-center py-16">Memuat izin...</div>
        <div v-else class="space-y-6 custom-scrollbar max-h-[60vh] overflow-y-auto">
          <!-- v-for untuk Grup Izin -->
          <div
            v-for="(permissionsInGroup, groupName) in groupedPermissions"
            :key="groupName"
            class="border border-secondary/20 rounded-lg"
          >
            <div
              class="bg-secondary/10 px-4 py-2 flex flex-col sm:flex-row justify-between items-start sm:items-center border-b border-secondary/20 gap-3"
            >
              <h4 class="font-bold text-text/90">{{ groupName }}</h4>
              <div class="flex gap-4 text-xs font-semibold">
                <button
                  @click="toggleGroup(String(groupName), true)"
                  class="text-primary hover:underline flex items-center gap-1"
                >
                  <font-awesome-icon icon="fa-solid fa-check-double" />
                  <span>Pilih Semua</span>
                </button>
                <button
                  @click="toggleGroup(String(groupName), false)"
                  class="text-danger hover:underline flex items-center gap-1"
                >
                  <font-awesome-icon icon="fa-solid fa-times" />
                  <span>Batal Semua</span>
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

  <!-- Modal untuk Tambah/Edit Peran -->
  <Teleport to="body">
    <BaseModal
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
        <div class="flex gap-4 justify-center pb-6 px-4">
          <button type="button" @click="isRoleModalOpen = false" class="btn-secondary flex items-center gap-2">
            <font-awesome-icon icon="fa-solid fa-times" />
            <span>Batal</span>
          </button>
          <button
            type="submit"
            @click="handleSaveRole"
            class="btn-primary flex items-center gap-2"
            :disabled="isSaving || !roleForm.name || !roleForm.description"
          >
            <font-awesome-icon v-if="isSaving" icon="fa-solid fa-spinner" spin />
            <font-awesome-icon v-else icon="fa-solid fa-save" />
            <span>{{ isSaving ? 'Menyimpan...' : 'Simpan' }}</span>
          </button>
        </div>
      </template>
    </BaseModal>
  </Teleport>
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
