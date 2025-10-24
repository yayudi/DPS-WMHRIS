<script setup>
import { RouterView } from 'vue-router'
</script>

<template>
  <div class="flex">
    <!-- Sidebar Navigasi Admin -->
    <aside class="w-64 flex-shrink-0 bg-background border-r border-secondary/20 min-h-screen p-4">
      <h2 class="text-lg font-bold text-text mb-6 px-2">Panel Admin</h2>
      <nav class="flex flex-col space-y-2">
        <router-link
          to="/admin/users"
          class="flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-md transition-colors"
          active-class="bg-primary/10 text-primary"
          exact-active-class="bg-primary/10 text-primary"
        >
          <font-awesome-icon icon="fa-solid fa-users" />
          <span>Manajemen Pengguna</span>
        </router-link>

        <router-link
          to="/admin/roles"
          class="flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-md transition-colors"
          active-class="bg-primary/10 text-primary"
          exact-active-class="bg-primary/10 text-primary"
        >
          <font-awesome-icon icon="fa-solid fa-user-shield" />
          <span>Peran & Izin</span>
        </router-link>

        <!-- Garis pemisah -->
        <hr class="border-secondary/20 my-4" />

        <!-- Tautan Baru (Mock) -->
        <router-link
          to="/admin/products"
          class="flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-md transition-colors"
          active-class="bg-primary/10 text-primary"
          exact-active-class="bg-primary/10 text-primary"
        >
          <font-awesome-icon icon="fa-solid fa-box-archive" />
          <span>Manajemen Produk</span>
        </router-link>

        <router-link
          to="/admin/locations"
          class="flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-md transition-colors"
          active-class="bg-primary/10 text-primary"
          exact-active-class="bg-primary/10 text-primary"
        >
          <font-awesome-icon icon="fa-solid fa-map-location-dot" />
          <span>Manajemen Lokasi</span>
        </router-link>

        <!-- Garis pemisah -->
        <hr class="border-secondary/20 my-4" />

        <router-link
          to="/admin/reports"
          class="flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-md transition-colors"
          active-class="bg-primary/10 text-primary"
          exact-active-class="bg-primary/10 text-primary"
        >
          <font-awesome-icon icon="fa-solid fa-chart-line" />
          <span>Laporan</span>
        </router-link>

        <router-link
          to="/admin/logs"
          class="flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-md transition-colors"
          active-class="bg-primary/10 text-primary"
          exact-active-class="bg-primary/10 text-primary"
        >
          <font-awesome-icon icon="fa-solid fa-clipboard-list" />
          <span>Log Aktivitas</span>
        </router-link>
      </nav>
    </aside>

    <!-- Konten Halaman Utama (akan diisi oleh RouterView) -->
    <main class="flex-grow bg-secondary/10">
      <RouterView />
    </main>
  </div>
</template>

<style scoped>
/* Pastikan link yang tidak aktif memiliki warna hover yang bagus */
a:not(.bg-primary\/10) {
  @apply text-text/70 hover:bg-secondary/20 hover:text-text;
}
</style>
