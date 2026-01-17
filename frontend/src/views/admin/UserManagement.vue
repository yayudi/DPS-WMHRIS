<script setup>
import { ref, onMounted } from 'vue'
import { useToast } from '@/composables/useToast.js'
import { fetchAllUsers, fetchRoles, createUser, deleteUser } from '@/api/helpers/admin.js'
import UserLocationModal from '@/components/users/locationModal.vue'
import UserEditModal from '@/components/users/EditModal.vue'
import Modal from '@/components/ui/Modal.vue'
import TableSkeleton from '@/components/ui/TableSkeleton.vue'

const users = ref([])
const allRoles = ref([])
const loading = ref(true)
const selectedUser = ref(null)

// State untuk semua modal
const isCreateModalOpen = ref(false)
const isLocationModalOpen = ref(false)
const isEditModalOpen = ref(false)

const newUser = ref({ username: '', password: '', role_id: null, nickname: '' })
const { show } = useToast()

async function fetchData() {
  loading.value = true
  try {
    // Gunakan helper API untuk mengambil data
    const [usersData, rolesData] = await Promise.all([fetchAllUsers(), fetchRoles()])
    users.value = usersData
    allRoles.value = rolesData
  } catch (error) {
    show('Gagal memuat data pengguna.', 'error')
  } finally {
    loading.value = false
  }
}

async function handleCreateUser() {
  if (!newUser.value.username || !newUser.value.password || !newUser.value.role_id) {
    show('Username, password, dan role wajib diisi.', 'warning')
    return
  }
  try {
    const response = await createUser(newUser.value)
    show(response.message || 'Pengguna berhasil dibuat.', 'success')
    isCreateModalOpen.value = false
    newUser.value = { username: '', password: '', role_id: null, nickname: '' } // Reset form
    fetchData() // Muat ulang data
  } catch (error) {
    show(error.response?.data?.message || 'Gagal membuat pengguna.', 'error')
  }
}

async function handleDeleteUser(userId) {
  if (confirm('Apakah Anda yakin ingin menghapus pengguna ini? Aksi ini tidak dapat dibatalkan.')) {
    try {
      // Ganti dengan helper API jika sudah dibuat
      await deleteUser(userId)
      show('Pengguna berhasil dihapus.', 'success')
      fetchData() // Muat ulang data
    } catch (error) {
      show(error.response?.data?.message || 'Gagal menghapus pengguna.', 'error')
    }
  }
}

function openLocationModal(user) {
  selectedUser.value = user
  isLocationModalOpen.value = true
}

function openEditModal(user) {
  selectedUser.value = user
  isEditModalOpen.value = true
}

onMounted(fetchData)
</script>

<template>
  <div class="p-6">
    <div class="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
      <h2 class="text-2xl font-bold text-text flex items-center gap-3">
        <font-awesome-icon icon="fa-solid fa-users" />
        <span>Manajemen Pengguna</span>
      </h2>
      <button @click="isCreateModalOpen = true"
        class="bg-primary text-secondary text-sm font-semibold px-4 py-2 rounded-lg hover:bg-primary/90 transition-colors flex items-center gap-2 w-full md:w-auto justify-center">
        <font-awesome-icon icon="fa-solid fa-plus" />
        <span>Tambah Pengguna</span>
      </button>
    </div>

    <div
      class="bg-background shadow-md rounded-xl border border-secondary/20 overflow-x-auto overflow-y-auto relative custom-scrollbar h-[calc(100vh-200px)]">
      <table class="w-full min-w-[600px] text-sm text-left text-text border-collapse">
        <thead class="sticky top-0 z-30 bg-background/95 backdrop-blur-md shadow-sm ring-1 ring-secondary/5">
          <tr class="text-xs text-text/80 uppercase">
            <th
              class="px-6 py-3 sticky left-0 z-30 bg-background/95 backdrop-blur-md border-b border-secondary/10 shadow-[4px_0_8px_-4px_rgba(0,0,0,0.05)]">
              Username</th>
            <th class="px-6 py-3 border-b border-secondary/10">Nickname</th>
            <th class="px-6 py-3 border-b border-secondary/10">Role</th>
            <th
              class="px-6 py-3 text-center sticky right-0 z-30 bg-background/95 backdrop-blur-md border-b border-secondary/10 shadow-[-4px_0_8px_-4px_rgba(0,0,0,0.05)]">
              Aksi</th>
          </tr>
        </thead>
        <TransitionGroup tag="tbody" name="list" class="divide-y divide-secondary/5 relative">
          <!-- Loading State -->
          <template v-if="loading">
            <TableSkeleton v-for="n in 5" :key="`skeleton-${n}`" />
          </template>

          <tr v-else-if="users.length === 0" key="empty">
            <td colspan="4" class="py-12 text-center text-text/50 italic">
              Tidak ada data pengguna.
            </td>
          </tr>

          <tr v-else v-for="user in users" :key="user.id"
            class="border-b border-secondary/20 hover:bg-secondary/5 transition-colors group relative">
            <td
              class="px-6 py-4 font-medium sticky left-0 z-20 bg-background group-hover:bg-secondary/5 transition-colors shadow-[4px_0_8px_-4px_rgba(0,0,0,0.05)]">
              {{ user.username }}</td>
            <td class="px-6 py-4 text-text/80">{{ user.nickname || '-' }}</td>
            <td class="px-6 py-4">
              <span class="px-2 py-1 rounded text-xs font-semibold bg-primary/10 text-primary border border-primary/20">
                {{ user.role_name }}
              </span>
            </td>
            <td
              class="px-6 py-4 text-center space-x-2 sticky right-0 z-20 bg-background group-hover:bg-secondary/5 transition-colors shadow-[-4px_0_8px_-4px_rgba(0,0,0,0.05)]">
              <button @click="openEditModal(user)"
                class="text-primary hover:text-primary/80 text-xs font-semibold inline-flex items-center gap-1 transition-transform hover:scale-105">
                <font-awesome-icon icon="fa-solid fa-edit" />
                <span>Edit</span>
              </button>
              <button @click="openLocationModal(user)"
                class="text-accent hover:text-accent/80 text-xs font-semibold inline-flex items-center gap-1 transition-transform hover:scale-105">
                <font-awesome-icon icon="fa-solid fa-map-marker-alt" />
                <span>Lokasi</span>
              </button>
              <button @click="handleDeleteUser(user.id)"
                class="text-danger hover:text-danger/80 text-xs font-semibold inline-flex items-center gap-1 transition-transform hover:scale-105">
                <font-awesome-icon icon="fa-solid fa-trash" />
                <span>Hapus</span>
              </button>
            </td>
          </tr>
        </TransitionGroup>
      </table>
    </div>

    <!-- Semua Modal yang Digunakan di Halaman Ini -->
    <UserLocationModal :show="isLocationModalOpen" :user="selectedUser" @close="isLocationModalOpen = false"
      @updated="fetchData" />
    <UserEditModal :show="isEditModalOpen" :user="selectedUser" :roles="allRoles" @close="isEditModalOpen = false"
      @updated="fetchData" />

    <!-- Modal untuk Tambah Pengguna -->
    <Modal :show="isCreateModalOpen" @close="isCreateModalOpen = false" title="Tambah Pengguna Baru">
      <form @submit.prevent="handleCreateUser" class="p-6 space-y-4">
        <div>
          <label for="username" class="block text-sm font-medium text-text/80 mb-1">Username</label>
          <input v-model="newUser.username" id="username" type="text" required
            class="w-full px-3 py-2 bg-background border border-secondary/50 rounded-lg" />
        </div>
        <div>
          <label for="nickname" class="block text-sm font-medium text-text/80 mb-1">Nickname (Opsional)</label>
          <input v-model="newUser.nickname" id="nickname" type="text"
            class="w-full px-3 py-2 bg-background border border-secondary/50 rounded-lg" />
        </div>
        <div>
          <label for="password" class="block text-sm font-medium text-text/80 mb-1">Password</label>
          <input v-model="newUser.password" id="password" type="password" required
            class="w-full px-3 py-2 bg-background border border-secondary/50 rounded-lg" />
        </div>
        <div>
          <label for="role" class="block text-sm font-medium text-text/80 mb-1">Role</label>
          <select v-model="newUser.role_id" id="role" required
            class="w-full px-3 py-2 bg-background border border-secondary/50 rounded-lg">
            <option :value="null" disabled>Pilih sebuah peran</option>
            <option v-for="role in allRoles" :key="role.id" :value="role.id">
              {{ role.name }}
            </option>
          </select>
        </div>
      </form>
      <template #footer>
        <button type="button" @click="isCreateModalOpen = false"
          class="bg-background border border-secondary/30 px-4 py-2 rounded-lg text-sm font-semibold hover:bg-secondary/20 flex items-center gap-2">
          <font-awesome-icon icon="fa-solid fa-times" />
          <span>Batal</span>
        </button>
        <button type="submit" @click="handleCreateUser"
          class="bg-primary text-secondary px-4 py-2 rounded-lg text-sm font-semibold hover:bg-primary/90 flex items-center gap-2">
          <font-awesome-icon icon="fa-solid fa-save" />
          <span>Simpan</span>
        </button>
      </template>
    </Modal>
  </div>
</template>

<style scoped>
.custom-scrollbar::-webkit-scrollbar {
  width: 6px;
  height: 6px;
}

.custom-scrollbar::-webkit-scrollbar-track {
  background: transparent;
}

.custom-scrollbar::-webkit-scrollbar-thumb {
  background-color: hsl(var(--color-secondary) / 0.3);
  border-radius: 4px;
}

.custom-scrollbar::-webkit-scrollbar-thumb:hover {
  background-color: hsl(var(--color-secondary) / 0.5);
}

/* List Transitions */
.list-enter-active,
.list-leave-active {
  transition: all 0.3s ease;
}

.list-enter-from,
.list-leave-to {
  opacity: 0;
  transform: translateX(-10px);
}

.list-leave-active {
  position: absolute;
  width: 100%;
}
</style>
