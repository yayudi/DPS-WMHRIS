<!-- AppHeader.vue -->
<script setup>
import { ref, onMounted, onUnmounted, computed } from 'vue'
import { RouterLink } from 'vue-router'
import ThemeSwitcher from './ThemeSwitcher.vue'
import { useAuthStore } from '../stores/auth.js'

const isDropdownOpen = ref(false)
const emit = defineEmits(['logout'])
const dropdownContainer = ref(null)
const auth = useAuthStore()

const displayName = computed(() => {
  // Cek apakah data user dan username ada di store
  if (auth.user && auth.user.username) {
    // Ambil username, ubah huruf pertama menjadi kapital
    const username = auth.user.username
    return username.charAt(0).toUpperCase() + username.slice(1)
  }
  // Teks fallback jika pengguna belum login atau data belum dimuat
  return 'Akun Saya'
})

function handleLogout() {
  isDropdownOpen.value = false
  emit('logout')
}

function handleClickOutside(event) {
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
  <header class="bg-background/80 backdrop-blur-sm sticky top-0 z-40 border-b border-secondary/20">
    <nav class="container mx-auto px-4 sm:px-6 py-3 flex justify-between items-center">
      <!-- Sisi Kiri: Logo & Menu Utama -->
      <div class="flex items-center gap-6">
        <!-- Logo -->
        <RouterLink
          to="/"
          class="font-bold text-lg text-primary hover:opacity-80 transition-opacity"
        >
          Dunia Pratama Sejahtera
        </RouterLink>

        <!-- Menu Utama -->
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
            >User Management</RouterLink
          >
        </div>
      </div>

      <!-- Sisi Kanan: Dropdown Pengguna -->
      <div class="relative" ref="dropdownContainer">
        <!-- Tombol Pemicu Dropdown -->
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

        <!-- Panel Dropdown -->
        <div
          v-if="isDropdownOpen"
          class="absolute right-0 mt-2 w-64 bg-background border border-secondary/30 rounded-lg shadow-lg py-2 z-50"
        >
          <RouterLink
            to="/account"
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

          <!-- Theme Switcher -->
          <div class="px-4 py-2 border-t border-secondary/20 mt-2">
            <ThemeSwitcher />
          </div>

          <!-- Tombol Logout -->
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
    </nav>
  </header>
</template>
