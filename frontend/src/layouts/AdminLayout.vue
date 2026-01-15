<script setup>
import { ref } from 'vue'
import { RouterView, useRoute } from 'vue-router'

const isSidebarOpen = ref(false)
const route = useRoute()
</script>

<template>
  <div class="flex min-h-screen bg-secondary/10">
    <!-- Mobile Backdrop -->
    <div
      v-if="isSidebarOpen"
      @click="isSidebarOpen = false"
      class="fixed inset-0 bg-black/50 z-40 md:hidden backdrop-blur-sm"
    ></div>

    <!-- Sidebar -->
    <aside
      class="fixed md:sticky top-0 h-screen z-50 w-64 bg-background border-r border-secondary/20 transform transition-transform duration-300 ease-in-out flex flex-col shadow-lg md:shadow-none"
      :class="isSidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'"
    >
      <!-- Logo / Header -->
      <div class="p-6 border-b border-secondary/20 flex justify-between items-center bg-secondary/5">
        <h2 class="text-xl font-bold text-text flex items-center gap-3">
          <font-awesome-icon icon="fa-solid fa-screwdriver-wrench" class="text-primary" />
          <span>Panel Admin</span>
        </h2>
        <!-- Close button for mobile -->
        <button
          @click="isSidebarOpen = false"
          class="md:hidden text-text/60 hover:text-danger p-1 rounded-md transition-colors"
        >
          <font-awesome-icon icon="fa-solid fa-xmark" size="lg" />
        </button>
      </div>

      <!-- Navigation -->
      <nav class="flex-1 overflow-y-auto py-6 px-4 space-y-1">
        <div class="mb-2 text-xs font-bold text-text/40 uppercase tracking-wider px-3">
          Manajemen
        </div>

        <router-link
          to="/admin/users"
          class="nav-item"
          active-class="active"
          @click="isSidebarOpen = false"
        >
          <font-awesome-icon icon="fa-solid fa-users" class="w-5" />
          <span>Pengguna</span>
        </router-link>

        <router-link
          to="/admin/roles"
          class="nav-item"
          active-class="active"
          @click="isSidebarOpen = false"
        >
          <font-awesome-icon icon="fa-solid fa-user-shield" class="w-5" />
          <span>Peran & Izin</span>
        </router-link>

        <div class="mt-8 mb-2 text-xs font-bold text-text/40 uppercase tracking-wider px-3">
          Inventaris
        </div>

        <router-link
          to="/admin/products"
          class="nav-item"
          active-class="active"
          @click="isSidebarOpen = false"
        >
          <font-awesome-icon icon="fa-solid fa-box-archive" class="w-5" />
          <span>Produk</span>
        </router-link>

        <router-link
          to="/admin/packages"
          class="nav-item"
          active-class="active"
          @click="isSidebarOpen = false"
        >
          <font-awesome-icon icon="fa-solid fa-boxes-stacked" class="w-5" />
          <span>Paket</span>
        </router-link>

        <router-link
          to="/admin/locations"
          class="nav-item"
          active-class="active"
          @click="isSidebarOpen = false"
        >
          <font-awesome-icon icon="fa-solid fa-map-location-dot" class="w-5" />
          <span>Lokasi</span>
        </router-link>

        <div class="mt-8 mb-2 text-xs font-bold text-text/40 uppercase tracking-wider px-3">
          Sistem
        </div>

        <router-link
          to="/admin/reports"
          class="nav-item"
          active-class="active"
          @click="isSidebarOpen = false"
        >
          <font-awesome-icon icon="fa-solid fa-chart-line" class="w-5" />
          <span>Laporan</span>
        </router-link>

        <router-link
          to="/admin/logs"
          class="nav-item"
          active-class="active"
          @click="isSidebarOpen = false"
        >
          <font-awesome-icon icon="fa-solid fa-clipboard-list" class="w-5" />
          <span>Log Aktivitas</span>
        </router-link>
      </nav>

      <!-- Footer / User Info -->
      <div class="p-4 border-t border-secondary/20 bg-secondary/5">
        <div class="flex items-center gap-3">
           <div class="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold text-xs">
              A
           </div>
           <div class="text-sm">
              <p class="font-semibold text-text">Administrator</p>
              <p class="text-xs text-text/60">admin@dps.com</p>
           </div>
        </div>
      </div>
    </aside>

    <!-- Main Content Wrapper -->
    <div class="flex-1 flex flex-col min-w-0 transition-all duration-300">
      <!-- Mobile Header -->
      <header
        class="md:hidden h-16 bg-background/80 backdrop-blur-md border-b border-secondary/20 flex items-center justify-between px-4 sticky top-0 z-30 shadow-sm"
      >
        <button
          @click="isSidebarOpen = !isSidebarOpen"
          class="p-2 -ml-2 text-text/70 hover:text-primary rounded-lg hover:bg-secondary/10 transition-colors"
        >
          <font-awesome-icon icon="fa-solid fa-bars" size="lg" />
        </button>
        <span class="font-bold text-text truncate">Admin Panel</span>
        <div class="w-8"></div> <!-- Spacer for balance -->
      </header>

      <!-- Page Content -->
      <main class="flex-1 p-4 md:p-8 overflow-x-hidden w-full">
        <div class="max-w-7xl mx-auto">
             <RouterView />
        </div>
      </main>
    </div>
  </div>
</template>

<style lang="postcss" scoped>
.nav-item {
  @apply flex items-center gap-3 px-3 py-2.5 text-sm font-medium rounded-lg text-text/70 hover:bg-secondary/20 hover:text-primary transition-all duration-200;
}

.nav-item.active {
  @apply bg-primary/10 text-primary font-semibold shadow-sm ring-1 ring-primary/20;
}
</style>
