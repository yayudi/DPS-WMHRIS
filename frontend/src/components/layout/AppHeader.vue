<!-- frontend\src\components\layout\AppHeader.vue -->
<script setup>
import { ref, onMounted, onUnmounted, computed } from 'vue'
import { RouterLink } from 'vue-router'
import ThemeSwitcher from '../ui/ThemeSwitcher.vue'
import NotificationQuickView from '../notifications/NotificationQuickView.vue'
import { useAuthStore } from '../../stores/auth.js'
import { usePwaInstall } from '@/composables/usePwaInstall.js'
import { useAppHotkeys, isCheatSheetOpen } from '@/composables/useAppHotkeys.js'
import HotkeyCheatSheet from '../ui/HotkeyCheatSheet.vue'
import { defineAsyncComponent } from 'vue'
import { useRoute } from 'vue-router'

const StickerGeneratorModal = defineAsyncComponent(() => import('@/components/utilities/StickerGeneratorModal.vue'))
const SalesSimulationModal = defineAsyncComponent(() => import('@/components/wms/shared/SalesSimulationModal.vue'))

const route = useRoute()

const formatSegment = segment => {
  if (!segment) return ''
  return segment
    .split('-')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

const breadcrumbs = computed(() => {
  const paths = route.path.split('/').filter(p => p)
  let currentPath = ''
  return paths.map((p, index) => {
    currentPath += `/${p}`
    return {
      path: currentPath,
      name: formatSegment(p),
      isLast: index === paths.length - 1
    }
  })
})
const dropdownContainer = ref(null)
const isDropdownOpen = ref(false)
const isStickerModalOpen = ref(false)
const isSimulationModalOpen = ref(false)
const emit = defineEmits(['logout'])
const auth = useAuthStore()
const { isInstallable, installPwa } = usePwaInstall()

useAppHotkeys(handleLogout)

const displayName = computed(() => {
  if (auth.user && auth.user.nickname) {
    const nickname = auth.user.nickname
    return nickname.charAt(0).toUpperCase() + nickname.slice(1)
  }
  return 'Akun Saya'
})

function handleLogout() {
  isDropdownOpen.value = false
  emit('logout')
}

function handleClickOutside(event) {
  const teleportedDropdown = event.target.closest('.z-\\[9999\\]')
  if (teleportedDropdown) return

  if (dropdownContainer.value && !dropdownContainer.value.contains(event.target)) {
    isDropdownOpen.value = false
  }
}

onMounted(() => {
  document.addEventListener('mousedown', handleClickOutside)
})

onUnmounted(() => {
  document.removeEventListener('mousedown', handleClickOutside)
})
</script>

<template>
  <header class="bg-background py-1 md:py-2 px-6 border-b border-secondary/20 shadow-md z-40 shrink-0 w-full">
    <nav class="w-full flex justify-between items-center">
      <div class="flex items-center gap-4">
        <nav class="hidden md:flex items-center text-sm font-medium text-text/60" aria-label="Breadcrumb">
          <ol class="inline-flex items-center">
            <li class="inline-flex items-center">
              <router-link to="/" class="hover:text-primary transition-colors flex items-center gap-2">
                <font-awesome-icon icon="fa-solid fa-home" class="text-lg" />
              </router-link>
            </li>
            <li v-for="crumb in breadcrumbs" :key="crumb.path" class="flex items-center">
              <font-awesome-icon icon="fa-solid fa-chevron-right" class="text-text/40 mx-2 text-[10px]" />
              <router-link v-if="!crumb.isLast" :to="crumb.path" class="hover:text-primary transition-colors">
                {{ crumb.name }}
              </router-link>
              <span v-else class="text-primary font-bold">{{ crumb.name }}</span>
            </li>
          </ol>
        </nav>
      </div>

      <div class="flex items-center gap-2 shrink-0" title="User Dropdown">
        <button
          v-if="auth.hasPermission('product_price.view')"
          @click="isSimulationModalOpen = true"
          class="w-12 text-text/80 hover:text-primary transition-colors rounded-lg hidden sm:block"
          title="Simulasi Harga & Berat"
        >
          <font-awesome-icon icon="fa-solid fa-calculator" class="text-xl" />
        </button>

        <button
          @click="isStickerModalOpen = true"
          class="w-12 text-text/80 hover:text-primary transition-colors rounded-lg hidden sm:block"
          title="Batch Sticker Generator"
        >
          <font-awesome-icon icon="fa-solid fa-print" class="text-xl" />
        </button>

        <button
          @click="isCheatSheetOpen = true"
          class="w-12 text-text/80 hover:text-primary transition-colors rounded-lg hidden sm:block"
          title="Keyboard Shortcuts (Alt + Q)"
        >
          <font-awesome-icon icon="fa-solid fa-keyboard" class="text-xl" />
        </button>
        <NotificationQuickView />
        <div class="relative" ref="dropdownContainer">
          <button
            @click="isDropdownOpen = !isDropdownOpen"
            class="flex items-center gap-2 px-3 text-text/80 hover:text-primary transition-colors"
          >
            <font-awesome-icon icon="fa-solid fa-user-circle" class="text-xl" />
            <span class="hidden sm:inline text-sm font-medium">{{ displayName }}</span>
            <font-awesome-icon
              icon="fa-solid fa-chevron-down"
              class="text-xs transition-transform duration-200"
              :class="isDropdownOpen && 'rotate-180'"
            />
          </button>

          <div
            v-if="isDropdownOpen"
            class="absolute right-0 mt-2 w-64 bg-background border border-secondary/30 rounded-lg shadow-xl py-2 z-40"
          >
            <RouterLink
              to="/account"
              @click="isDropdownOpen = false"
              class="w-full text-left px-4 py-2 text-sm text-text/90 hover:bg-secondary/20 flex items-center gap-3"
            >
              <font-awesome-icon icon="fa-solid fa-user-cog" class="w-4" />
              <span>Akun Saya</span>
            </RouterLink>

            <RouterLink
              to="/guide"
              @click="isDropdownOpen = false"
              class="w-full text-left px-4 py-2 text-sm text-text/90 hover:bg-secondary/20 flex items-center gap-3"
            >
              <font-awesome-icon icon="fa-solid fa-book" class="w-4" />
              <span>Fitur & Panduan</span>
            </RouterLink>

            <div class="px-4 py-2 border-t border-secondary/20 mt-2 flex flex-col gap-2">
              <!-- Install PWA Button (Visible only if available) -->
              <button
                v-if="isInstallable"
                @click="installPwa"
                class="w-full text-left px-2 py-1.5 text-sm font-semibold text-white bg-primary rounded-md hover:bg-primary/90 flex items-center gap-3"
              >
                <font-awesome-icon icon="fa-solid fa-download" class="w-4" />
                <span>Install Aplikasi</span>
              </button>
              <ThemeSwitcher />
            </div>

            <div class="border-t border-secondary/20 mt-2 pt-2">
              <button
                @click="handleLogout"
                class="w-full text-left px-4 py-2 text-sm text-accent hover:bg-accent/10 flex items-center gap-3"
              >
                <font-awesome-icon icon="fa-solid fa-sign-out-alt" class="w-4" />
                <span>Logout</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </nav>

    <!-- Hotkey Cheat Sheet Modal -->
    <HotkeyCheatSheet />

    <SalesSimulationModal :show="isSimulationModalOpen" @close="isSimulationModalOpen = false" />
    <StickerGeneratorModal :show="isStickerModalOpen" :initialProduct="null" @close="isStickerModalOpen = false" />
  </header>
</template>
