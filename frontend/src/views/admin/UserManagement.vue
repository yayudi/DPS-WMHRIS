<script setup>
import { ref, onMounted } from 'vue'
import api from '@/api/axios.js'
import { useToast } from '@/composables/UseToast.js'

const users = ref([])
const allRoles = ref([])
const loading = ref(true)
const { show } = useToast()

async function fetchData() {
  loading.value = true
  try {
    // Ambil data user dan data role secara bersamaan
    const [usersResponse, rolesResponse] = await Promise.all([
      api.get('/admin/users'),
      api.get('/admin/users/roles'),
    ])
    users.value = usersResponse.data.users
    allRoles.value = rolesResponse.data.roles
  } catch (error) {
    show('Gagal memuat data.', 'error')
  } finally {
    loading.value = false
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
    <h2 class="text-2xl font-bold text-text mb-6">Manajemen Pengguna</h2>
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
  </div>
</template>
