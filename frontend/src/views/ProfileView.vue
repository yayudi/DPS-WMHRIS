<script setup>
import { ref, onMounted } from 'vue'
import api from '@/api/axios.js'
import { useToast } from '@/composables/useToast.js'
import { useAuthStore } from '@/stores/auth.js'

const { show } = useToast()
const auth = useAuthStore()

// State untuk form
const username = ref('') // Untuk ditampilkan (read-only)
const nickname = ref('') // Untuk diubah
const currentPassword = ref('')
const newPassword = ref('')
const confirmNewPassword = ref('')

const loading = ref(false)

// Fungsi untuk mengisi data form dari auth store
function populateForm() {
  if (auth.user) {
    username.value = auth.user.username
    // Gunakan nickname jika ada, jika tidak, fallback ke username
    nickname.value = auth.user.nickname || auth.user.username
  }
}

onMounted(async () => {
  await auth.fetchUser()
  populateForm()
})

async function handleUpdate() {
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
      nickname: nickname.value,
      newPassword: newPassword.value || null, // Kirim null jika kosong
    }

    const response = await api.put('/user/profile', payload)

    show('Data akun berhasil diperbarui!', 'success')

    auth.updateUserNickname(response.data.user.nickname)

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
        <!-- Bagian Informasi Akun -->
        <div>
          <label for="username" class="block text-sm font-medium text-text/80 mb-1"
            >Username (untuk Login)</label
          >
          <input
            id="username"
            :value="username"
            type="text"
            disabled
            class="w-full px-3 py-2 bg-secondary/20 border border-secondary/30 rounded-lg text-text/60 cursor-not-allowed"
          />
          <p class="text-xs text-text/60 mt-1">Username tidak dapat diubah.</p>
        </div>

        <div>
          <label for="nickname" class="block text-sm font-medium text-text/80 mb-1"
            >Nickname (Nama Tampilan)</label
          >
          <input
            id="nickname"
            v-model="nickname"
            type="text"
            class="w-full px-3 py-2 bg-background border border-secondary/50 rounded-lg focus:ring-2 focus:ring-primary/50"
          />
        </div>

        <!-- Bagian Ubah Password -->
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

        <!-- Bagian Verifikasi -->
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
