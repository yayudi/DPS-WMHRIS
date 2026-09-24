<script setup>
import { ref, computed } from 'vue'
import { RouterView, useRoute } from 'vue-router'

const route = useRoute()
const isSidebarOpen = ref(false)
const isDesktopSidebarCollapsed = ref(false)

const domain = computed(() => {
  const pathParts = route.path.split('/')
  return pathParts[1] || ''
})

const sidebarConfig = computed(() => {
  if (domain.value === 'hr') {
    return {
      title: 'Human Resources',
      icon: 'fa-users',
      sections: [
        {
          label: 'Kehadiran',
          items: [
            { to: '/hr/attendance', icon: 'fa-clock', label: 'Absensi' },
            { to: '/hr/shifts', icon: 'fa-calendar', label: 'Master Shift' },
            { to: '/hr/schedules', icon: 'fa-calendar-alt', label: 'Kalender Shift' }
          ]
        }
      ]
    }
  }
  if (domain.value === 'master-data') {
    return {
      title: 'Master Data',
      icon: 'fa-database',
      sections: [
        {
          label: 'Inventaris',
          items: [
            { to: '/master-data/products', icon: 'fa-box-archive', label: 'Produk' },
            { to: '/master-data/packages', icon: 'fa-boxes-stacked', label: 'Paket' },
            { to: '/master-data/categories', icon: 'fa-tags', label: 'Kategori' },
            { to: '/master-data/media', icon: 'fa-images', label: 'Media Produk' }
          ]
        },
        {
          label: 'Operasional',
          items: [
            { to: '/master-data/locations', icon: 'fa-map-location-dot', label: 'Lokasi' },
            { to: '/master-data/sales-channels', icon: 'fa-store', label: 'Saluran Penjualan' }
          ]
        }
      ]
    }
  }
  if (domain.value === 'settings') {
    return {
      title: 'System Settings',
      icon: 'fa-cog',
      sections: [
        {
          label: 'Manajemen',
          items: [
            { to: '/settings/users', icon: 'fa-users', label: 'Pengguna' },
            { to: '/settings/roles', icon: 'fa-user-shield', label: 'Peran & Izin' }
          ]
        },
        {
          label: 'Sistem',
          items: [
            { to: '/settings/logs', icon: 'fa-clipboard-list', label: 'Log Aktivitas' }
          ]
        }
      ]
    }
  }
  if (domain.value === 'analytics') {
    return {
      title: 'Analytics',
      icon: 'fa-chart-pie',
      sections: [
        {
          label: 'Overview & Dashboard',
          items: [
            { to: '/analytics/dashboard', icon: 'fa-chart-pie', label: 'Dashboard Utama' },
            { to: '/analytics/inventory-value', icon: 'fa-dollar-sign', label: 'Laporan Nilai Inventaris' }
          ]
        },
        {
          label: 'Laporan Utama',
          items: [
            { to: '/analytics/stock-movement', icon: 'fa-boxes-stacked', label: 'Pergerakan Stok' },
            { to: '/analytics/stock-timeline', icon: 'fa-clock-rotate-left', label: 'Timeline Stok' },
            { to: '/analytics/time-performance', icon: 'fa-chart-line', label: 'Performa Waktu' },
            { to: '/analytics/package-analysis', icon: 'fa-boxes-packing', label: 'Analisa Produk Paket' },
            { to: '/analytics/channel-performance', icon: 'fa-store', label: 'Penjualan & Performa Toko' }
          ]
        },
        {
          label: 'Audit & Lainnya',
          items: [
            { to: '/analytics/export-stock', icon: 'fa-file-excel', label: 'Ekspor Laporan Stok' },
            { to: '/analytics/stock-distribution', icon: 'fa-map-location-dot', label: 'Sebaran Stok' },
            { to: '/analytics/location-capacity', icon: 'fa-weight-hanging', label: 'Statistik Kapasitas' },
            { to: '/analytics/reports', icon: 'fa-file-alt', label: 'Laporan Khusus' }
          ]
        }
      ]
    }
  }
  return { title: 'Menu', icon: 'fa-bars', sections: [] }
})
</script>

<template>
  <div class="flex font-sans text-text">
    <!-- Mobile Backdrop -->
    <div
      v-if="isSidebarOpen"
      @click="isSidebarOpen = false"
      class="fixed inset-0 bg-black/50 z-20 md:hidden backdrop-blur-sm"
    ></div>

    <!-- Sidebar -->
    <aside
      class="fixed md:sticky top-12 bottom-0 left-0 md:h-[calc(100vh-3rem)] z-50 bg-background border-r border-secondary/20 transform transition-all duration-300 ease-in-out flex flex-col shadow-lg md:shadow-none overflow-y-auto"
      :class="[
        isSidebarOpen ? 'translate-x-0 w-64' : '-translate-x-full md:translate-x-0',
        isDesktopSidebarCollapsed ? 'md:w-20' : 'md:w-64'
      ]"
    >
      <!-- Logo / Header -->
      <div
        class="p-6 border-b border-secondary/20 flex items-center bg-secondary/5 h-[72px]"
        :class="isDesktopSidebarCollapsed ? 'justify-center' : 'justify-between'"
      >
        <h2
          class="text-xl font-bold text-text flex items-center gap-3 transition-opacity duration-200"
          :class="isDesktopSidebarCollapsed ? 'hidden' : 'block'"
        >
          <font-awesome-icon :icon="`fa-solid ${sidebarConfig.icon}`" class="text-primary" />
          <span class="truncate">{{ sidebarConfig.title }}</span>
        </h2>
        <!-- Close button for mobile -->
        <button
          @click="isSidebarOpen = false"
          class="md:hidden text-text/60 hover:text-danger p-1 rounded-md transition-colors"
        >
          <font-awesome-icon icon="fa-solid fa-xmark" size="lg" />
        </button>
        <!-- Toggle button for desktop -->
        <button
          @click="isDesktopSidebarCollapsed = !isDesktopSidebarCollapsed"
          class="hidden md:flex text-text/60 hover:text-primary p-2 rounded-lg transition-colors hover:bg-secondary/10"
          :class="isDesktopSidebarCollapsed ? 'mx-auto' : ''"
          title="Toggle Sidebar"
        >
          <font-awesome-icon
            :icon="isDesktopSidebarCollapsed ? 'fa-solid fa-angles-right' : 'fa-solid fa-angles-left'"
            size="lg"
          />
        </button>
      </div>

      <!-- Navigation -->
      <nav class="flex-1 overflow-y-auto space-y-1 custom-scrollbar">
        <div
          v-for="section in sidebarConfig.sections"
          :key="section.label"
          class="py-4 border-t border-secondary transition-all duration-300"
          :class="isDesktopSidebarCollapsed ? 'px-2 flex flex-col items-center' : 'px-4 pr-6'"
        >
          <span
            class="font-bold text-text/40 uppercase tracking-wider block mb-2 transition-all duration-300"
            :class="isDesktopSidebarCollapsed ? 'text-[10px] text-center w-full truncate' : 'text-xs'"
            :title="isDesktopSidebarCollapsed ? section.label : ''"
          >
            {{ isDesktopSidebarCollapsed ? '...' : section.label }}
          </span>

          <div class="space-y-1 w-full">
            <router-link
              v-for="item in section.items"
              :key="item.to"
              :to="item.to"
              class="nav-item overflow-hidden"
              active-class="active"
              @click="isSidebarOpen = false"
              :class="isDesktopSidebarCollapsed ? 'px-0 justify-center' : 'px-3 gap-3'"
              :title="item.label"
            >
              <font-awesome-icon :icon="`fa-solid ${item.icon}`" class="w-5 shrink-0" />
              <span
                class="transition-opacity duration-200 whitespace-nowrap"
                :class="isDesktopSidebarCollapsed ? 'opacity-0 w-0 hidden' : 'opacity-100'"
              >
                {{ item.label }}
              </span>
            </router-link>
          </div>
        </div>
      </nav>
    </aside>

    <!-- Main Content Wrapper -->
    <div class="flex-1 flex flex-col min-w-0 transition-all duration-300">
      <!-- Mobile Header -->
      <header
        class="md:hidden bg-background border-t border-secondary/20 flex items-center justify-between sticky top-12 z-10 shadow-sm p-4"
      >
        <button
          @click="isSidebarOpen = !isSidebarOpen"
          class="p-2 -ml-2 text-text/70 hover:text-primary rounded-lg hover:bg-secondary/10 transition-colors"
        >
          <font-awesome-icon icon="fa-solid fa-bars" size="lg" />
        </button>
        <span class="font-bold text-text truncate">{{ sidebarConfig.title }}</span>
        <div class="w-8"></div>
        <!-- Spacer for balance -->
      </header>

      <!-- Page Content -->
      <main class="flex-1 lg:px-6 overflow-x-hidden w-full">
        <div class="max-w-7xl">
          <RouterView />
        </div>
      </main>
    </div>
  </div>
</template>

<style lang="postcss" scoped>
.nav-item {
  @apply flex items-center py-2.5 text-sm font-medium rounded-lg text-text/70 hover:bg-secondary/20 hover:text-primary transition-all duration-200;
}

.nav-item.active {
  @apply bg-primary/10 text-primary font-semibold shadow-sm ring-1 ring-primary/20;
}
</style>
