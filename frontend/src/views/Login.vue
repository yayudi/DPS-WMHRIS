<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import api from '@/api/axios.js'
import { useToast } from '@/composables/UseToast.js'
import { useAuthStore } from '@/stores/auth.js'

// --- Variabel untuk Form Login ---
const username = ref('')
const password = ref('')
const error = ref('')
const loading = ref(false)

const auth = useAuthStore()
const router = useRouter()
const { show } = useToast()

// --- Variabel untuk Tes Koneksi ---
const testResult = ref(null)
const isTestLoading = ref(false)

// --- Fungsi untuk Login ---
async function login() {
  loading.value = true
  error.value = ''
  try {
    const res = await api.post('/auth/login', {
      username: username.value,
      password: password.value,
    })

    if (res.data.success && res.data.token) {
      auth.setToken(res.data.token)
      show('Login berhasil 🚀', 'success')
      router.push('/')
    }
  } catch (err) {
    const message = err.response?.data?.message || 'Username atau password salah.'
    error.value = message
    show(`${message} ❌`, 'error')
  } finally {
    loading.value = false
  }
}

// --- Fungsi untuk Tes Koneksi ---
async function runTest() {
  isTestLoading.value = true
  testResult.value = 'Menghubungi backend...'
  try {
    const response = await api.get('/test')
    testResult.value = JSON.stringify(response.data, null, 2)
  } catch (error) {
    console.error('Error saat tes koneksi:', error)
    testResult.value =
      'Gagal terhubung ke backend.\n\nPastikan:\n1. Server backend berjalan.\n2. URL API di file .env sudah benar.'
  } finally {
    isTestLoading.value = false
  }
}
</script>

<template>
  <div class="flex h-screen flex-col items-center justify-center bg-secondary/20 p-4">
    <div class="w-full max-w-sm bg-background p-6 rounded-xl shadow-lg border border-secondary/20">
      <div class="text-center mb-6">
        <font-awesome-icon icon="fa-solid fa-user-lock" class="text-primary text-4xl mb-3" />
        <h2 class="text-2xl font-bold text-text">Selamat Datang</h2>
        <p class="text-sm text-text/70">Silakan login untuk melanjutkan</p>
      </div>

      <form @submit.prevent="login" class="space-y-4">
        <input
          v-model="username"
          type="text"
          placeholder="Username"
          class="w-full px-3 py-2 bg-background border border-secondary/50 text-text rounded-lg focus:ring-2 focus:ring-primary/50 focus:border-primary transition"
          required
        />
        <input
          v-model="password"
          type="password"
          placeholder="Password"
          class="w-full px-3 py-2 bg-background border border-secondary/50 text-text rounded-lg focus:ring-2 focus:ring-primary/50 focus:border-primary transition"
          required
        />
        <button
          type="submit"
          :disabled="loading"
          class="w-full bg-primary text-white py-2 rounded-lg hover:bg-primary/90 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 font-semibold"
        >
          <font-awesome-icon v-if="loading" icon="fa-solid fa-spinner" class="animate-spin" />
          <span>{{ loading ? 'Loading...' : 'Login' }}</span>
        </button>
      </form>

      <p v-if="error" class="text-accent mt-4 text-center text-sm">{{ error }}</p>
    </div>

    <div
      class="w-full max-w-sm bg-background p-6 rounded-xl shadow-lg border border-secondary/20 mt-8"
    >
      <h3 class="text-lg font-semibold text-text mb-4 text-center">Uji Koneksi Backend</h3>
      <p class="text-text/80 mb-4 text-center text-sm">
        Klik tombol ini untuk memastikan frontend bisa berkomunikasi dengan backend.
      </p>

      <button
        @click="runTest"
        :disabled="isTestLoading"
        class="w-full bg-secondary text-white py-2 px-4 rounded-lg hover:bg-secondary/90 transition font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {{ isTestLoading ? 'Mengetes...' : 'Jalankan Tes Koneksi' }}
      </button>

      <div v-if="testResult" class="mt-4">
        <h4 class="font-semibold text-text mb-2">Hasil:</h4>
        <pre class="bg-secondary/20 p-4 rounded-lg text-sm text-text whitespace-pre-wrap">{{
          testResult
        }}</pre>
      </div>
    </div>
  </div>
</template>
