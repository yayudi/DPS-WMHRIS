<!-- frontend\src\views\auth\LoginView.vue -->
<script setup>
import { ref, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import api from '@/api/axios.js'
import { useToast } from '@/composables/useToast.js'
import { useAuthStore } from '@/stores/auth.js'

// --- Variabel untuk Form Login ---
const usernameInput = ref(null)
const username = ref('')
const password = ref('')
const error = ref('')
const loading = ref(false)

const auth = useAuthStore()

const route = useRoute()
const { toast } = useToast()

// --- Variabel untuk Tes Koneksi ---
const testResult = ref(null) // null: testing, true: success, false: failed
const isTestLoading = ref(true)

// --- Fungsi untuk Login ---
async function login() {
  loading.value = true
  error.value = ''
  try {
    const res = await api.post('/auth/login', {
      username: username.value,
      password: password.value
    })

    if (res.data.success) {
      if (res.data.user) {
        auth.setUser(res.data.user)
      }
      if (res.data.token) {
        auth.setToken(res.data.token)
      } else {
        auth.setToken() // trigger PWA check
      }
      toast('Login berhasil', 'success')
      // Force hard navigation untuk memastikan PWA update terbaru diambil dari server
      window.location.href = '/'
    }
  } catch (err) {
    console.error(err)
    const message = err.response?.data?.message || 'Username atau password salah.'
    error.value = message
  } finally {
    loading.value = false
  }
}

// --- Fungsi untuk Tes Koneksi ---
async function runTest() {
  isTestLoading.value = true
  try {
    const response = await api.get('/test')
    testResult.value = response.data.success
    console.log('Success:', testResult.value)
  } catch {
    testResult.value = false
    console.log('Failed:', testResult.value)
  } finally {
    isTestLoading.value = false
    console.log('Loading:', isTestLoading.value)
  }
}

onMounted(() => {
  if (route.query.expired) {
    toast('Sesi Anda telah berakhir, silakan login kembali.', 'info')
  }

  runTest()

  // Auto focus username input
  if (usernameInput.value) {
    usernameInput.value.focus()
  }
})
</script>

<template>
  <div class="min-h-screen flex items-center justify-center p-4 animate-fade-in relative">
    <div class="w-full max-w-sm p-6 rounded-xl shadow-2xl relative z-10 bg-background border-2 border-primary/20">
      <!-- Indikator Tes Koneksi Server -->
      <div
        v-if="testResult === false"
        class="absolute -top-12 left-0 right-0 bg-danger text-secondary text-xs font-bold py-2 px-4 rounded-lg text-center shadow-md animate-fade-in flex justify-between items-center"
      >
        <span>
          <font-awesome-icon icon="fa-solid fa-triangle-exclamation" class="mr-1" />
          Server Offline / Terputus
        </span>
        <button @click="runTest" class="underline hover:text-text/80">Coba Lagi</button>
      </div>

      <div class="text-center mb-6">
        <!-- Icon Loading saat Test -->
        <font-awesome-icon
          v-if="isTestLoading"
          icon="fa-solid fa-spinner"
          class="text-4xl mb-3 text-text/40 animate-spin"
        />
        <!-- Icon Hasil Test -->
        <font-awesome-icon
          v-else
          icon="fa-solid fa-user-lock"
          class="text-4xl mb-3 transition-colors duration-300"
          :class="{ 'text-primary': testResult === true, 'text-danger': testResult === false }"
        />
        <h2 class="text-2xl font-bold text-text">Selamat Datang</h2>
        <p class="text-sm text-text/70">Silakan login untuk melanjutkan</p>
      </div>

      <form @submit.prevent="login" class="space-y-4">
        <input
          ref="usernameInput"
          v-model="username"
          type="text"
          placeholder="Username"
          class="w-full px-3 py-2 bg-secondary/20 border-2 border-secondary/50 text-text rounded-lg focus:ring-2 focus:ring-primary focus:border-primary transition"
          required
        />
        <input
          v-model="password"
          type="password"
          placeholder="Password"
          class="w-full px-3 py-2 bg-secondary/20 border-2 border-secondary/50 text-text rounded-lg focus:ring-2 focus:ring-primary focus:border-primary transition"
          required
        />
        <!-- Tombol Login -->
        <button
          type="submit"
          :disabled="loading || isTestLoading || testResult === false"
          class="w-full bg-primary text-secondary py-3 rounded-lg font-bold hover:bg-primary/90 transition-all flex justify-center items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed mt-2 shadow-lg shadow-primary/20"
        >
          <font-awesome-icon v-if="loading" icon="fa-solid fa-spinner" class="animate-spin" />
          <span>{{ loading ? 'Memproses...' : testResult === false ? 'Server Offline' : 'Masuk' }}</span>
        </button>
      </form>

      <p v-if="error" class="text-accent mt-4 text-center text-sm">{{ error }}</p>
    </div>
  </div>
</template>
