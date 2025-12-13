<!-- frontend\src\layouts\WMSActionsLayout.vue -->
<script setup>
import { RouterView } from 'vue-router'

const actionRoutes = [
  {
    name: 'Batch Movement',
    path: '/wms/actions/batch-movement',
    icon: 'fa-solid fa-truck-ramp-box',
  },
  { name: 'Picking List', path: '/wms/actions/picking-list', icon: 'fa-solid fa-clipboard-list' },
  { name: 'Batch Log', path: '/wms/actions/batch-log', icon: 'fa-solid fa-file-alt' },
]
</script>

<template>
  <div class="p-6">
    <!-- Header Utama Layout -->
    <div class="flex justify-between items-center mb-4">
      <h2 class="text-2xl font-bold text-text flex items-center gap-3">
        <font-awesome-icon icon="fa-solid fa-boxes-stacked" />
        <span>Manajemen Stok</span>
      </h2>
      <router-link to="/wms" class="text-sm text-primary hover:underline flex items-center gap-2">
        <font-awesome-icon icon="fa-solid fa-arrow-left" />
        <span>Kembali ke Dasbor WMS</span>
      </router-link>
    </div>

    <!-- Navigasi Sekunder (Tabs) -->
    <nav>
      <div class="border-b border-secondary/20 flex items-center gap-4">
        <router-link
          v-for="route in actionRoutes"
          :key="route.path"
          :to="route.path"
          class="px-4 py-3 text-sm font-semibold border-b-2 transition-colors"
          active-class="border-primary text-primary"
          exact-active-class="border-primary text-primary"
        >
          <font-awesome-icon :icon="route.icon" class="mr-2" />
          {{ route.name }}
        </router-link>
      </div>
    </nav>

    <!-- Area Konten Dinamis (diisi oleh child route) -->
    <main>
      <RouterView />
    </main>
  </div>
</template>

<style lang="postcss" scoped>
/* Styling untuk link yang tidak aktif */
a:not(.border-primary) {
  @apply text-text/60 border-transparent hover:border-secondary/50 hover:text-text;
}
</style>
