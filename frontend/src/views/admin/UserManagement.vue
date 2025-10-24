<script setup>
import { ref, onMounted } from 'vue'
import { useToast } from '@/composables/UseToast.js'
import { fetchAllUsers, fetchRoles, createUser, deleteUser } from '@/api/helpers/admin.js'
import UserLocationModal from '@/components/UserLocationModal.vue'
import UserEditModal from '@/components/UserEditModal.vue'
import Modal from '@/components/Modal.vue'

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
    <div class="flex justify-between items-center mb-6">
      <h2 class="text-2xl font-bold text-text">Manajemen Pengguna</h2>
      <button
        @click="isCreateModalOpen = true"
        class="bg-primary text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-primary/90 transition-colors flex items-center gap-2"
      >
        <font-awesome-icon icon="fa-solid fa-plus" />
        <span>Tambah Pengguna</span>
      </button>
    </div>

    <div v-if="loading" class="text-center p-8">Memuat data...</div>
    <div
      v-else
      class="bg-background shadow-md rounded-xl border border-secondary/20 overflow-x-auto"
    >
      <table class="w-full text-sm text-left text-text">
        <thead class="text-xs text-text/80 uppercase bg-secondary/20">
          <tr>
            <th class="px-6 py-3">Username</th>
            <th class="px-6 py-3">Nickname</th>
            <th class="px-6 py-3">Role</th>
            <th class="px-6 py-3 text-center">Aksi</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="user in users"
            :key="user.id"
            class="border-b border-secondary/20 hover:bg-primary/5"
          >
            <td class="px-6 py-4 font-medium">{{ user.username }}</td>
            <td class="px-6 py-4 text-text/80">{{ user.nickname || '-' }}</td>
            <td class="px-6 py-4">{{ user.role_name }}</td>
            <td class="px-6 py-4 text-center space-x-4">
              <button
                @click="openEditModal(user)"
                class="text-primary hover:underline text-xs font-semibold"
              >
                Edit
              </button>
              <button
                @click="openLocationModal(user)"
                class="text-secondary-dark hover:underline text-xs font-semibold"
              >
                Lokasi
              </button>
              <button
                @click="handleDeleteUser(user.id)"
                class="text-accent hover:underline text-xs font-semibold"
              >
                Hapus
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Semua Modal yang Digunakan di Halaman Ini -->
    <UserLocationModal
      :show="isLocationModalOpen"
      :user="selectedUser"
      @close="isLocationModalOpen = false"
      @updated="fetchData"
    />
    <UserEditModal
      :show="isEditModalOpen"
      :user="selectedUser"
      :roles="allRoles"
      @close="isEditModalOpen = false"
      @updated="fetchData"
    />

    <!-- Modal untuk Tambah Pengguna -->
    <Modal
      :show="isCreateModalOpen"
      @close="isCreateModalOpen = false"
      title="Tambah Pengguna Baru"
    >
      <form @submit.prevent="handleCreateUser" class="p-6 space-y-4">
        <div>
          <label for="username" class="block text-sm font-medium text-text/80 mb-1">Username</label>
          <input
            v-model="newUser.username"
            id="username"
            type="text"
            required
            class="w-full px-3 py-2 bg-background border border-secondary/50 rounded-lg"
          />
        </div>
        <div>
          <label for="nickname" class="block text-sm font-medium text-text/80 mb-1"
            >Nickname (Opsional)</label
          >
          <input
            v-model="newUser.nickname"
            id="nickname"
            type="text"
            class="w-full px-3 py-2 bg-background border border-secondary/50 rounded-lg"
          />
        </div>
        <div>
          <label for="password" class="block text-sm font-medium text-text/80 mb-1">Password</label>
          <input
            v-model="newUser.password"
            id="password"
            type="password"
            required
            class="w-full px-3 py-2 bg-background border border-secondary/50 rounded-lg"
          />
        </div>
        <div>
          <label for="role" class="block text-sm font-medium text-text/80 mb-1">Role</label>
          <select
            v-model="newUser.role_id"
            id="role"
            required
            class="w-full px-3 py-2 bg-background border border-secondary/50 rounded-lg"
          >
            <option :value="null" disabled>Pilih sebuah peran</option>
            <option v-for="role in allRoles" :key="role.id" :value="role.id">
              {{ role.name }}
            </option>
          </select>
        </div>
      </form>
      <template #footer>
        <button
          type="button"
          @click="isCreateModalOpen = false"
          class="bg-background border border-secondary/30 px-4 py-2 rounded-lg text-sm font-semibold hover:bg-secondary/20"
        >
          Batal
        </button>
        <button
          type="submit"
          @click="handleCreateUser"
          class="bg-primary text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-primary/90"
        >
          Simpan
        </button>
      </template>
    </Modal>
  </div>
</template>
