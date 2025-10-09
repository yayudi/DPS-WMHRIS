<script setup>
import { ref, onMounted } from 'vue'
import api from '@/api/axios.js'
import { useToast } from '@/composables/UseToast.js'
import { fetchRoles, createUser } from '@/api/helpers/admin.js'

const users = ref([])
const allRoles = ref([])
const loading = ref(true)
const isCreateModalOpen = ref(false)
const newUser = ref({
  username: '',
  password: '',
  role_id: null,
})
const { show } = useToast()

async function fetchData() {
  loading.value = true
  try {
    // Ambil data user dan data role secara bersamaan
    const [usersResponse, rolesResponse] = await Promise.all([
      api.get('/admin/users'),
      api.get('/admin/users/roles'),
    ])

    // --- INVESTIGASI: Cek respons mentah dari server ---
    console.log("Respons dari '/admin/users':", usersResponse.data)
    console.log('Respons dari fetchRoles():', rolesResponse.data)
    // ----------------------------------------------------

    if (usersResponse.data && usersResponse.data.users) {
      users.value = usersResponse.data.users
    } else {
      // Fallback jika struktur berbeda
      users.value = usersResponse.data.data || []
    }
    if (rolesResponse.data && rolesResponse.data.data) {
      allRoles.value = rolesResponse.data.data
    } else {
      // Fallback jika backend mengirim { success: true, roles: [...] }
      allRoles.value = rolesResponse.data.roles || []
    }
  } catch (error) {
    console.error('Gagal saat fetchData:', error)
    show('Gagal memuat data.', 'error')
  } finally {
    loading.value = false
  }
}

async function handleCreateUser() {
  if (!newUser.value.username || !newUser.value.password || !newUser.value.role_id) {
    show('Semua field harus diisi.', 'warning')
    return
  }
  try {
    const response = await createUser(newUser.value)
    show(response.message, 'success')
    isCreateModalOpen.value = false
    newUser.value = { username: '', password: '', role_id: null } // Reset form
    fetchData() // Muat ulang semua data untuk menampilkan user baru
  } catch (error) {
    show(error.response?.data?.message || 'Gagal membuat pengguna.', 'error')
  }
}

async function updateUserRole(userId, newRoleId) {
  try {
    // Kirim role_id, bukan nama role
    await api.put(`/admin/users/${userId}`, { role_id: newRoleId })
    show('Role berhasil diupdate.', 'success')
    // Tidak perlu fetch ulang, cukup update data lokal (lebih cepat)
    const user = users.value.find((u) => u.id === userId)
    if (user) {
      const newRole = allRoles.value.find((r) => r.id === parseInt(newRoleId))
      user.role_id = newRoleId
      user.role_name = newRole.name
    }
  } catch (error) {
    show('Gagal mengupdate role.', 'error')
    fetchData()
  }
}

async function deleteUser(userId) {
  if (confirm('Apakah Anda yakin ingin menghapus user ini?')) {
    try {
      await api.delete(`/admin/users/${userId}`)
      show('User berhasil dihapus.', 'success')
      users.value = users.value.filter((u) => u.id !== userId)
    } catch (error) {
      const message = error.response?.data?.message || 'Gagal menghapus user.'
      show(message, 'error')
    }
  }
}

onMounted(fetchData)
</script>

<template>
  <div class="p-6">
    <!-- ✅ 3. Tombol Tambah Pengguna dikembalikan -->
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

    <div v-if="loading">Loading...</div>
    <div
      v-else
      class="bg-background shadow-md rounded-xl border border-secondary/20 overflow-x-auto"
    >
      <table class="w-full text-sm text-left text-text">
        <thead class="text-xs text-text/80 uppercase bg-secondary/20">
          <tr>
            <th class="px-6 py-3">Username</th>
            <th class="px-6 py-3">Role</th>
            <th class="px-6 py-3">Aksi</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="user in users" :key="user.id" class="border-b border-secondary/20">
            <td class="px-6 py-4 font-medium">{{ user.username }}</td>
            <td class="px-6 py-4">
              <select
                :value="user.role_id"
                @change="updateUserRole(user.id, $event.target.value)"
                class="bg-background border border-secondary/50 rounded-lg p-1"
              >
                <option v-for="role in allRoles" :key="role.id" :value="role.id">
                  {{ role.name }}
                </option>
              </select>
            </td>
            <td class="px-6 py-4">
              <button @click="deleteUser(user.id)" class="text-accent hover:underline">
                Hapus
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Modal untuk Tambah Pengguna dikembalikan -->
    <teleport to="body">
      <div
        v-if="isCreateModalOpen"
        @click.self="isCreateModalOpen = false"
        class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50"
      >
        <div class="bg-background rounded-lg shadow-xl w-full max-w-md">
          <form @submit.prevent="handleCreateUser">
            <div class="p-6 border-b">
              <h3 class="font-bold text-lg">Tambah Pengguna Baru</h3>
            </div>
            <div class="p-6 space-y-4">
              <div>
                <label for="username" class="block text-sm font-medium text-text/80 mb-1"
                  >Username</label
                >
                <input
                  v-model="newUser.username"
                  id="username"
                  type="text"
                  required
                  class="w-full px-3 py-2 bg-background border border-secondary/50 rounded-lg focus:ring-primary focus:border-primary"
                />
              </div>
              <div>
                <label for="password" class="block text-sm font-medium text-text/80 mb-1"
                  >Password</label
                >
                <input
                  v-model="newUser.password"
                  id="password"
                  type="password"
                  required
                  class="w-full px-3 py-2 bg-background border border-secondary/50 rounded-lg focus:ring-primary focus:border-primary"
                />
              </div>
              <div>
                <label for="role" class="block text-sm font-medium text-text/80 mb-1">Role</label>
                <select
                  v-model="newUser.role_id"
                  id="role"
                  required
                  class="w-full px-3 py-2 bg-background border border-secondary/50 rounded-lg focus:ring-primary focus:border-primary"
                >
                  <option :value="null" disabled>Pilih sebuah peran</option>
                  <option v-for="role in allRoles" :key="role.id" :value="role.id">
                    {{ role.name }}
                  </option>
                </select>
              </div>
            </div>
            <div class="p-4 bg-secondary/10 flex justify-end gap-3 rounded-b-lg">
              <button
                type="button"
                @click="isCreateModalOpen = false"
                class="bg-background border border-secondary/30 px-4 py-2 rounded-lg text-sm font-semibold hover:bg-secondary/20"
              >
                Batal
              </button>
              <button
                type="submit"
                class="bg-primary text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-primary/90"
              >
                Simpan
              </button>
            </div>
          </form>
        </div>
      </div>
    </teleport>
  </div>
</template>
