<script setup>
import { ref, onMounted, onUnmounted, computed, watch } from 'vue'
import { RouterLink } from 'vue-router'
import ThemeSwitcher from './ThemeSwitcher.vue'
import { useAuthStore } from '../stores/auth.js'

const isDropdownOpen = ref(false)
const isMobileMenuOpen = ref(false) // State baru untuk menu mobile
const emit = defineEmits(['logout'])
const auth = useAuthStore()

// Refs untuk click-outside
const dropdownContainer = ref(null)
const mobileMenuPanel = ref(null)
const hamburgerButton = ref(null)

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

// Menutup satu menu jika menu lain dibuka
watch(isDropdownOpen, (isOpen) => {
  if (isOpen) isMobileMenuOpen.value = false
})
watch(isMobileMenuOpen, (isOpen) => {
  if (isOpen) isDropdownOpen.value = false
})

function handleClickOutside(event) {
  // Cek dropdown user
  if (dropdownContainer.value && !dropdownContainer.value.contains(event.target)) {
    isDropdownOpen.value = false
  }
  // Cek menu mobile
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
  <!-- Header dibuat 'relative' agar menu mobile bisa 'absolute' thd-nya -->
  <header
    class="bg-background/80 backdrop-blur-sm sticky top-0 z-40 border-b border-secondary/20 relative"
  >
    <nav class="container mx-auto px-4 sm:px-6 py-3 flex justify-between items-center">
      <!-- Sisi Kiri: Logo & Nav Desktop -->
      <div class="flex items-center gap-6">
        <RouterLink
          to="/"
          class="font-bold text-lg text-primary hover:opacity-80 transition-opacity flex-shrink-0"
          @click="isMobileMenuOpen = false"
        >
          Dunia Pratama Sejahtera
        </RouterLink>

        <!-- Navigasi Desktop: Sembunyi di mobile, tampil di desktop -->
        <div class="hidden md:flex items-center gap-6 text-sm font-medium">
          <RouterLink
            to="/absensi"
            class="border-b-2 text-text/80 hover:text-primary transition-colors"
            active-class="!text-primary text-lg font-bold border-primary"
            >Absensi</RouterLink
          >
          <RouterLink
            to="/wms"
            class="border-b-2 text-text/80 hover:text-primary transition-colors"
            active-class="!text-primary text-lg font-bold border-primary"
            >WMS</RouterLink
          >
          <RouterLink
            to="/admin/users"
            v-if="auth.user?.permissions?.includes('manage-users')"
            class="border-b-2 text-text/80 hover:text-primary transition-colors"
            active-class="!text-primary text-lg font-bold border-primary"
            >Panel Admin</RouterLink
          >
        </div>
      </div>

      <!-- Sisi Kanan: Dropdown User & Tombol Hamburger -->
      <div class="flex items-center gap-2">
        <!-- Dropdown User -->
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

          <!-- Panel Dropdown User -->
          <div
            v-if="isDropdownOpen"
            class="absolute right-0 mt-2 w-64 bg-background border border-secondary/30 rounded-lg shadow-lg py-2 z-50"
          >
            <RouterLink
              to="/account"
              @click="isDropdownOpen = false"
              class="w-full text-left px-4 py-2 text-sm text-text/90 hover:bg-secondary/20 flex items-center gap-3"
            >
              <font-awesome-icon icon="fa-solid fa-user-cog" class="w-4" />
              <span>Akun Saya</span>
            </RouterLink>

            <a
              href="#"
              class="w-full text-left px-4 py-2 text-sm text-text/90 hover:bg-secondary/20 flex items-center gap-3"
            >
              <font-awesome-icon icon="fa-solid fa-language" class="w-4" />
              <span>Bahasa</span>
            </a>

            <div class="px-4 py-2 border-t border-secondary/20 mt-2">
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

        <!-- Tombol Hamburger: Tampil di mobile, sembunyi di desktop -->
        <button
          @click="isMobileMenuOpen = !isMobileMenuOpen"
          ref="hamburgerButton"
          class="md:hidden p-2 text-text/80 hover:text-primary"
          aria-label="Buka menu"
        >
          <font-awesome-icon icon="fa-solid fa-bars" class="text-xl w-5" />
        </button>
      </div>
    </nav>

    <!-- Panel Menu Mobile: Tampil di mobile, sembunyi di desktop -->
    <div
      v-if="isMobileMenuOpen"
      ref="mobileMenuPanel"
      class="md:hidden absolute w-full bg-background/95 backdrop-blur-md border-b border-secondary/20 shadow-lg z-30"
    >
      <nav class="container mx-auto px-4 sm:px-6 py-4 space-y-2">
        <RouterLink
          to="/absensi"
          @click="isMobileMenuOpen = false"
          class="block px-3 py-2 rounded-md text-base font-medium text-text/80 hover:bg-secondary/20 hover:text-primary"
          active-class="!text-primary font-bold bg-secondary/10"
          >Absensi</RouterLink
        >
        <RouterLink
          to="/wms"
          @click="isMobileMenuOpen = false"
          class="block px-3 py-2 rounded-md text-base font-medium text-text/80 hover:bg-secondary/20 hover:text-primary"
          active-class="!text-primary font-bold bg-secondary/10"
          >WMS</RouterLink
        >
        <RouterLink
          to="/admin/users"
          @click="isMobileMenuOpen = false"
          v-if="auth.user?.permissions?.includes('manage-users')"
          class="block px-3 py-2 rounded-md text-base font-medium text-text/80 hover:bg-secondary/20 hover:text-primary"
          active-class="!text-primary font-bold bg-secondary/10"
          >Panel Admin</RouterLink
        >
      </nav>
    </div>
  </header>
</template>
