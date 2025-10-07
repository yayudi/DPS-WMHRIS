<script setup>
import { ref, onMounted } from 'vue'
import api from '@/api/axios.js'
import { useToast } from '@/composables/UseToast.js'
import { useAuthStore } from '@/stores/auth.js'

const { show } = useToast()
const auth = useAuthStore()

// State untuk form
const currentUsername = ref('')
const newUsername = ref('')
const currentPassword = ref('')
const newPassword = ref('')
const confirmNewPassword = ref('')

const loading = ref(false)

// Mengambil data user saat ini
onMounted(async () => {
  if (auth.user) {
    currentUsername.value = auth.user.username
    newUsername.value = auth.user.username
  } else {
    // Jika data user belum ada di store, panggil API
    await auth.fetchUser()
    currentUsername.value = auth.user.username
    newUsername.value = auth.user.username
  }
})

async function handleUpdate() {
  // Validasi sederhana
  if (newPassword.value && newPassword.value !== confirmNewPassword.value) {
    show('Password baru dan konfirmasi tidak cocok.', 'warning')
    return
  }
  if (!currentPassword.value) {
    show('Password saat ini wajib diisi.', 'warning')
    return
  }

  loading.value = true
  try {
    const payload = {
      currentPassword: currentPassword.value,
      newUsername: newUsername.value,
      newPassword: newPassword.value,
    }

    const response = await api.put('/user/profile', payload)

    show('Data akun berhasil diperbarui!', 'success')

    // Jika backend mengirim token baru (karena username berubah), update
    if (response.data.token) {
      auth.setToken(response.data.token)
    }

    // Perbarui data user di store
    await auth.fetchUser()
    currentUsername.value = auth.user.username

    // Kosongkan field password
    currentPassword.value = ''
    newPassword.value = ''
    confirmNewPassword.value = ''
  } catch (error) {
    const message = error.response?.data?.message || 'Gagal memperbarui data.'
    show(message, 'error')
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="p-6">
    <h2 class="text-2xl font-bold text-text mb-6">Pengaturan Akun</h2>

    <div
      class="max-w-2xl mx-auto bg-background p-8 rounded-xl shadow-md border border-secondary/20"
    >
      <form @submit.prevent="handleUpdate" class="space-y-6">
        <div>
          <label for="username" class="block text-sm font-medium text-text/80 mb-1">Username</label>
          <input
            id="username"
            v-model="newUsername"
            type="text"
            class="w-full px-3 py-2 bg-background border border-secondary/50 rounded-lg focus:ring-2 focus:ring-primary/50"
          />
        </div>

        <div class="border-t border-secondary/20 pt-6 space-y-4">
          <h3 class="font-semibold text-lg text-text">Ubah Password</h3>
          <div>
            <label for="newPassword" class="block text-sm font-medium text-text/80 mb-1"
              >Password Baru (opsional)</label
            >
            <input
              id="newPassword"
              v-model="newPassword"
              type="password"
              placeholder="Kosongkan jika tidak ingin diubah"
              class="w-full px-3 py-2 bg-background border border-secondary/50 rounded-lg focus:ring-2 focus:ring-primary/50"
            />
          </div>
          <div>
            <label for="confirmNewPassword" class="block text-sm font-medium text-text/80 mb-1"
              >Konfirmasi Password Baru</label
            >
            <input
              id="confirmNewPassword"
              v-model="confirmNewPassword"
              type="password"
              class="w-full px-3 py-2 bg-background border border-secondary/50 rounded-lg focus:ring-2 focus:ring-primary/50"
            />
          </div>
        </div>

        <div class="border-t border-secondary/20 pt-6 space-y-4">
          <h3 class="font-semibold text-lg text-text">Verifikasi Perubahan</h3>
          <p class="text-sm text-text/70">
            Masukkan password Anda saat ini untuk menyimpan perubahan.
          </p>
          <div>
            <label for="currentPassword" class="block text-sm font-medium text-text/80 mb-1"
              >Password Saat Ini</label
            >
            <input
              id="currentPassword"
              v-model="currentPassword"
              type="password"
              required
              class="w-full px-3 py-2 bg-background border border-secondary/50 rounded-lg focus:ring-2 focus:ring-primary/50"
            />
          </div>
        </div>

        <div class="pt-2">
          <button
            type="submit"
            :disabled="loading"
            class="w-full bg-primary text-white py-2 px-4 rounded-lg hover:bg-primary/90 transition disabled:opacity-50"
          >
            {{ loading ? 'Menyimpan...' : 'Simpan Perubahan' }}
          </button>
        </div>
      </form>
    </div>
  </div>
</template>
