<!-- frontend\src\App.vue -->
<script setup>
import { computed, onMounted, ref } from 'vue'
import { RouterView, useRouter, useRoute } from 'vue-router'
import { useAuthStore } from './stores/auth'
import AppHeader from '@/components/layout/AppHeader.vue'
import GlobalSidebar from '@/components/layout/GlobalSidebar.vue'
import { useTheme } from '@/composables/useTheme'
import PwaUpdatePrompt from '@/components/ui/PwaUpdatePrompt.vue'
import PwaInstallBanner from '@/components/ui/PwaInstallBanner.vue'
import JobManager from '@/components/shared/JobManager.vue'
import { useMobile } from '@/composables/useMobile.js'

const router = useRouter()
const route = useRoute()
const auth = useAuthStore()
const { initTheme } = useTheme()
const { isMobile } = useMobile()

const showHeader = computed(() => route.name && route.name !== 'Login' && auth.isAuthenticated)
const showLayout = computed(() => showHeader.value && !route.meta.hideLayout)
const isSidebarCollapsed = ref(false)

onMounted(() => {
  initTheme()
})

function handleLogout() {
  auth.clearToken()
  router.push('/login')
}
</script>

<template>
  <div class="bg-background text-text h-screen font-sans flex overflow-hidden w-full">
    <PwaUpdatePrompt />
    <PwaInstallBanner />

    <template v-if="showLayout">
      <GlobalSidebar :is-collapsed="isSidebarCollapsed" @toggle="isSidebarCollapsed = !isSidebarCollapsed" />

      <div class="flex-1 flex flex-col min-w-0 h-screen overflow-hidden">
        <AppHeader @toggle-sidebar="isSidebarCollapsed = !isSidebarCollapsed" />
        <JobManager />

        <main class="flex-1 overflow-y-auto bg-secondary/5 relative flex flex-col" :class="isMobile ? 'p-2' : 'p-6'">
          <div class="mx-auto w-full flex-1 flex flex-col min-h-0">
            <RouterView />
          </div>
        </main>
      </div>
    </template>

    <template v-else>
      <div class="flex-1 h-screen overflow-y-auto custom-scrollbar">
        <AppHeader v-if="showHeader" @logout="handleLogout" />
        <JobManager v-if="showHeader" />
        <RouterView />
      </div>
    </template>
  </div>
</template>
