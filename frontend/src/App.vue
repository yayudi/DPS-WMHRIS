<!-- App.vue -->
<!-- <script setup>
import { ref, onMounted, nextTick, computed } from 'vue'
import { RouterView, useRouter, useRoute } from 'vue-router'
import { useAuthStore } from './stores/auth'
import AppHeader from '@/components/AppHeader.vue'
import MessageToast from '@/components/MessageToast.vue'
import { registerToast } from '@/composables/UseToast.js'

const router = useRouter()
const route = useRoute()
const toast = ref(null)
const auth = useAuthStore()
const isInitializing = ref(true)
const showHeader = computed(() => {
  // Log nama rute saat ini untuk debugging
  console.log('Nama rute saat ini:', route.name)
  // Ganti 'Login' dengan nama rute halaman login Anda jika berbeda
  return route.name !== 'Login'
})

onMounted(async () => {
  try {
    // TUNGGU sampai proses fetchUser selesai sepenuhnya
    await auth.fetchUser()
  } catch (error) {
    console.error('Gagal inisialisasi aplikasi:', error)
    // Jika fetchUser gagal (misal token expired), pastikan user diarahkan ke login
    if (!auth.isAuthenticated) {
      router.push('/login')
    }
  } finally {
    // Setelah semua selesai (berhasil atau gagal), baru hilangkan layar loading
    isInitializing.value = false
  }

  // Daftarkan toast setelah aplikasi siap
  registerToast(toast.value)
})

function handleLogout() {
  auth.clearToken()
  router.push('/login')
}
</script>

<template>
  <div class="bg-background text-text min-h-screen font-sans">
    <MessageToast ref="toast" />

    <div v-if="isInitializing" class="flex h-screen items-center justify-center">
      <font-awesome-icon icon="fa-solid fa-spinner" class="animate-spin text-primary text-3xl" />
    </div>

    <div v-else>
      <AppHeader v-if="showHeader" @logout="handleLogout" />
      <main class="container mx-auto">
        <RouterView />
      </main>
    </div>
  </div>
</template> -->

<script setup>
import { computed } from 'vue'
import { RouterView, useRouter, useRoute } from 'vue-router'
import { useAuthStore } from './stores/auth'
import AppHeader from '@/components/AppHeader.vue'
import MessageToast from '@/components/MessageToast.vue'
// registerToast tidak lagi diperlukan di sini jika sudah di main.js
import { registerToast } from '@/composables/UseToast.js'

const router = useRouter()
const route = useRoute()
const auth = useAuthStore()

const showHeader = computed(() => route.name !== 'Login')

function handleLogout() {
  auth.clearToken()
  router.push('/login')
}
</script>

<template>
  <div class="bg-background text-text min-h-screen font-sans">
    <MessageToast />

    <AppHeader v-if="showHeader" @logout="handleLogout" />
    <main class="container mx-auto">
      <RouterView />
    </main>
  </div>
</template>
