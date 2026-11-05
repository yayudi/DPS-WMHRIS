<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { useToast } from '@/core/presentation/composables/useToast'
import { useI18n } from '@/core/presentation/composables/useI18n'
import { useAuthStore } from '@/modules/auth/application/auth.store'
import { authApi } from '@/modules/auth/infrastructure/auth.api'
import { loginSchema } from '@/modules/auth/domain/auth.validator'
import LanguageSwitcher from '@/core/presentation/components/ui/LanguageSwitcher.vue'

// --- Variabel untuk Form Login ---
const usernameInput = ref<HTMLInputElement | null>(null)
const username = ref('')
const password = ref('')
const error = ref('')
const loading = ref(false)

const auth = useAuthStore()
const route = useRoute()
const { toast } = useToast()
const { t } = useI18n()

// --- Variabel untuk Tes Koneksi ---
const testResult = ref(null)
const isTestLoading = ref(true)

// --- Fungsi untuk Login ---
async function login() {
  loading.value = true
  error.value = ''

  const payload = {
    username: username.value,
    password: password.value
  }

  // Validate using Zod
  const result = loginSchema.safeParse(payload)
  if (!result.success) {
    const errorMessages = result.error.errors.map(e => e.message).join(' | ')
    toast(errorMessages, 'warning')
    error.value = errorMessages
    loading.value = false
    return
  }

  try {
    const res = await authApi.login(payload)

    if (res.success) {
      if (res.user) {
        auth.setUser(res.user)
      }
      auth.setToken() // trigger PWA check
      toast('Login berhasil', 'success')
      // Force hard navigation untuk memastikan PWA update terbaru diambil dari server
      window.location.href = '/'
    }
  } catch (err: any) {
    console.error(err)
    const message = err?.response?.data?.message || err?.message || 'Username atau password salah.'
    error.value = message
  } finally {
    loading.value = false
  }
}

// --- Fungsi untuk Tes Koneksi ---
async function runTest() {
  isTestLoading.value = true
  try {
    const response = await authApi.testConnection()
    testResult.value = response.success
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
    toast(t('auth.login.session_expired'), 'info')
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
    <!-- Quick Language Switcher on Login Page -->
    <div class="absolute top-4 right-4 z-20">
      <LanguageSwitcher />
    </div>

    <div class="w-full max-w-sm p-6 rounded-xl shadow-2xl relative z-10 bg-background border-2 border-primary/20">
      <!-- Indikator Tes Koneksi Server -->
      <div
        v-if="testResult === false"
        class="absolute -top-12 left-0 right-0 bg-danger text-secondary text-xs font-bold py-2 px-4 rounded-lg text-center shadow-md animate-fade-in flex justify-between items-center"
      >
        <span>
          <font-awesome-icon icon="fa-solid fa-triangle-exclamation" class="mr-1" />
          {{ t('auth.login.server_offline') }}
        </span>
        <button @click="runTest" class="underline hover:text-text/80">{{ t('common.btn.retry') }}</button>
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
        <h2 class="text-2xl font-bold text-text">{{ t('auth.login.title') }}</h2>
        <p class="text-sm text-text/70">{{ t('auth.login.subtitle') }}</p>
      </div>

      <form @submit.prevent="login" class="space-y-4">
        <input
          ref="usernameInput"
          v-model="username"
          type="text"
          :placeholder="t('auth.login.username')"
          class="w-full px-3 py-2 bg-secondary/20 border-2 border-secondary/50 text-text rounded-lg focus:ring-2 focus:ring-primary focus:border-primary transition"
          required
        />
        <input
          v-model="password"
          type="password"
          :placeholder="t('auth.login.password')"
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
          <span>{{ loading ? t('common.status.loading') : testResult === false ? t('auth.login.server_offline') : t('auth.login.btn_submit') }}</span>
        </button>
      </form>

      <p v-if="error" class="text-accent mt-4 text-center text-sm">{{ error }}</p>
    </div>
  </div>
</template>
