<!-- App.vue -->
<script setup>
import { computed, ref, onMounted } from 'vue'
import { RouterView, useRouter, useRoute } from 'vue-router'
import { useAuthStore } from './stores/auth'
import AppHeader from '@/components/layout/AppHeader.vue'
import MessageToast from '@/components/ui/MessageToast.vue'
import { registerToast } from '@/composables/useToast.js'
import { useTheme } from '@/composables/useTheme'

const router = useRouter()
const route = useRoute()
const auth = useAuthStore()
const { initTheme } = useTheme()

const toastComponentRef = ref(null)
const showHeader = computed(() => route.name !== 'Login')

onMounted(() => {
  initTheme()
  if (toastComponentRef.value) {
    registerToast(toastComponentRef.value)
  }
})

function handleLogout() {
  auth.clearToken()
  router.push('/login')
}
</script>

<template>
  <div class="bg-background text-text min-h-screen font-sans">
    <MessageToast ref="toastComponentRef" />

    <AppHeader v-if="showHeader" @logout="handleLogout" />
    <main class="container mx-auto">
      <RouterView />
    </main>
  </div>
</template>
