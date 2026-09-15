<!-- frontend\src\components\layout\AppHeader.vue -->
<script setup>
import { ref, onMounted, onUnmounted, computed, watch } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import ThemeSwitcher from '../ui/ThemeSwitcher.vue'
import NotificationQuickView from '../notifications/NotificationQuickView.vue'
import { useAuthStore } from '../../stores/auth.js'
import { usePwaInstall } from '@/composables/usePwaInstall.js'
import { useAppHotkeys } from '@/composables/useAppHotkeys.js'
import HotkeyCheatSheet from '../ui/HotkeyCheatSheet.vue'
import { useMobile } from '@/composables/useMobile.js'

const { isMobile } = useMobile()
const dropdownContainer = ref(null)
const mobileMenuPanel = ref(null)
const hamburgerButton = ref(null)
const isDropdownOpen = ref(false)
const isMobileMenuOpen = ref(false)
const emit = defineEmits(['logout'])
const auth = useAuthStore()
const route = useRoute()
const { isInstallable, installPwa } = usePwaInstall()

const isAdminActive = computed(() => route.path.startsWith('/admin'))

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
  isMobileMenuOpen.value = false
  emit('logout')
}

watch(isDropdownOpen, isOpen => {
  if (isOpen) isMobileMenuOpen.value = false
})
watch(isMobileMenuOpen, isOpen => {
  if (isOpen) isDropdownOpen.value = false
})

watch(isMobile, mobile => {
  if (!mobile) isMobileMenuOpen.value = false
})

function handleClickOutside(event) {
  const teleportedDropdown = event.target.closest('.z-\\[9999\\]')
  if (teleportedDropdown) return

  if (dropdownContainer.value && !dropdownContainer.value.contains(event.target)) {
    isDropdownOpen.value = false
  }
  if (
    mobileMenuPanel.value &&
    !mobileMenuPanel.value.contains(event.target) &&
    hamburgerButton.value &&
    !hamburgerButton.value.contains(event.target)
  ) {
    isMobileMenuOpen.value = false
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
  <header class="bg-background py-1 md:py-2 px-6 fixed top-0 z-[500] border-b border-secondary/20 shadow-md min-w-full">
    <nav
      class="container mx-auto flex justify-between items-center"
      title="Navigation Menu"
      aria-current="page"
      aria-controls="desktop-menu"
      aria-expanded="false"
      aria-haspopup="true"
      aria-labelledby="desktop-menu"
      role="menu"
    >
      <div class="flex items-center gap-6">
        <RouterLink
          to="/"
          class="font-bold text-lg text-primary hover:opacity-80 transition-opacity flex-shrink-0"
          @click="isMobileMenuOpen = false"
          title="Logo"
          aria-label="Logo"
          role="button"
          tabindex="0"
        >
          {{ isMobile ? 'DPS' : 'Dunia Pratama Sejahtera' }}
        </RouterLink>

        <div class="hidden lg:flex items-center gap-6 text-sm font-medium">
          <RouterLink
            to="/wms"
            class="text-text/80 hover:text-primary transition-colors flex items-center gap-2"
            active-class="!text-primary text-lg font-bold border-primary"
          >
            <font-awesome-icon icon="fa-solid fa-warehouse" />
            <span>WMS</span>
          </RouterLink>
          <RouterLink
            to="/media"
            v-if="auth.hasPermission('product.image.view')"
            class="text-text/80 hover:text-primary transition-colors flex items-center gap-2"
            active-class="!text-primary text-lg font-bold border-primary"
          >
            <font-awesome-icon icon="fa-solid fa-images" />
            <span>Media</span>
          </RouterLink>
          <RouterLink
            to="/absensi"
            class="text-text/80 hover:text-primary transition-colors flex items-center gap-2"
            active-class="!text-primary text-lg font-bold border-primary"
          >
            <font-awesome-icon icon="fa-solid fa-clock" />
            <span>Absensi</span>
          </RouterLink>
          <RouterLink
            to="/stats"
            v-if="auth.hasPermission('report.view')"
            class="text-text/80 hover:text-primary transition-colors flex items-center gap-2"
            active-class="!text-primary text-lg font-bold border-primary"
          >
            <font-awesome-icon icon="fa-solid fa-chart-line" />
            <span>Stats & Reports</span>
          </RouterLink>
          <RouterLink
            to="/admin/users"
            v-if="auth.hasPermission('user.manage')"
            class="text-text/80 hover:text-primary transition-colors flex items-center gap-2"
            :class="isAdminActive && '!text-primary text-lg font-bold border-primary'"
          >
            <font-awesome-icon icon="fa-solid fa-user-shield" />
            <span>Panel Admin</span>
          </RouterLink>
        </div>
      </div>

      <div class="flex items-center gap-2" title="User Dropdown">
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

        <button
          @click="isMobileMenuOpen = !isMobileMenuOpen"
          title="Hamburger Menu"
          ref="hamburgerButton"
          class="lg:hidden p-2 text-text/80 hover:text-primary"
          aria-label="Buka menu"
        >
          <font-awesome-icon icon="fa-solid fa-bars" class="text-xl w-5" />
        </button>
      </div>
    </nav>

    <div
      v-if="isMobileMenuOpen"
      ref="mobileMenuPanel"
      title="Mobile Menu"
      id="mobile-menu"
      aria-expanded="true"
      aria-haspopup="true"
      aria-labelledby="mobile-menu"
      role="menu"
      class="lg:hidden absolute bg-background border-b border-secondary/20 rounded-lg shadow-xl w-48 sm:w-64 right-4 mt-2"
    >
      <nav class="container space-y-1 z-[100] text-right p-2">
        <RouterLink
          to="/wms"
          @click="isMobileMenuOpen = false"
          class="block px-6 py-3 rounded-md text-base font-medium text-text/80 hover:bg-secondary/20 hover:text-primary"
          active-class="!text-primary font-bold bg-secondary/10"
          >WMS</RouterLink
        >

        <RouterLink
          to="/absensi"
          @click="isMobileMenuOpen = false"
          class="block px-6 py-3 rounded-md text-base font-medium text-text/80 hover:bg-secondary/20 hover:text-primary"
          active-class="!text-primary font-bold bg-secondary/10"
          >Absensi</RouterLink
        >

        <RouterLink
          to="/media"
          @click="isMobileMenuOpen = false"
          v-if="auth.hasPermission('product.image.view')"
          class="block px-6 py-3 rounded-md text-base font-medium text-text/80 hover:bg-secondary/20 hover:text-primary"
          active-class="!text-primary font-bold bg-secondary/10"
          >Media</RouterLink
        >

        <RouterLink
          to="/stats"
          @click="isMobileMenuOpen = false"
          v-if="auth.hasPermission('report.view')"
          class="block px-6 py-3 rounded-md text-base font-medium text-text/80 hover:bg-secondary/20 hover:text-primary"
          active-class="!text-primary font-bold bg-secondary/10"
          >Stats & Reports</RouterLink
        >

        <RouterLink
          to="/admin/users"
          @click="isMobileMenuOpen = false"
          v-if="auth.hasPermission('user.manage')"
          class="block px-6 py-3 rounded-md text-base font-medium text-text/80 hover:bg-secondary/20 hover:text-primary"
          :class="isAdminActive && '!text-primary font-bold bg-secondary/10'"
          >Panel Admin</RouterLink
        >

        <!-- Install PWA Mobile Item -->
        <button
          v-if="isInstallable"
          @click="(installPwa(), (isMobileMenuOpen = false))"
          class="block w-full text-left px-6 py-3 mt-2 rounded-md text-base font-bold text-white bg-primary hover:bg-primary/90"
        >
          <font-awesome-icon icon="fa-solid fa-download" class="mr-2" />
          Install Aplikasi WMS
        </button>
      </nav>
    </div>

    <!-- Hotkey Cheat Sheet Modal -->
    <HotkeyCheatSheet />
  </header>
</template>
