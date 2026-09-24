<script setup>
import { ref, computed, watch } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const route = useRoute()
const auth = useAuthStore()

const props = defineProps({
  isCollapsed: Boolean
})
const emit = defineEmits(['toggle'])

// Determine which accordion should be open based on current URL
const activeAccordion = ref('')

const updateActiveAccordion = () => {
  const path = route.path
  if (path.startsWith('/hr')) activeAccordion.value = 'hr'
  else if (path.startsWith('/master-data')) activeAccordion.value = 'master-data'
  else if (path.startsWith('/analytics')) activeAccordion.value = 'analytics'
  else if (path.startsWith('/settings')) activeAccordion.value = 'settings'
  else if (path.startsWith('/wms')) activeAccordion.value = 'wms'
  else activeAccordion.value = ''
}

// Auto-open the correct accordion on mount and route change
watch(() => route.path, updateActiveAccordion, { immediate: true })

const toggleAccordion = id => {
  if (activeAccordion.value === id) {
    activeAccordion.value = ''
  } else {
    activeAccordion.value = id
    // If sidebar was collapsed, expand it when clicking an accordion
    if (props.isCollapsed) {
      emit('toggle')
    }
  }
}

// The master configuration of all navigation items
const menuConfig = computed(() => {
  const menus = []

  // WMS
  menus.push({
    id: 'wms',
    label: 'WMS',
    icon: 'fa-warehouse',
    route: '/wms',
    items: [
      { to: '/wms', label: 'Dashboard', icon: 'fa-chart-line' },
      { to: '/wms/fulfilment', label: 'Daftar Pesanan', icon: 'fa-boxes-packing' },
      { to: '/wms/batch-movement', label: 'Pindah Lokasi', icon: 'fa-truck-ramp-box' },
      { to: '/wms/spreadsheet', label: 'Proses Excel', icon: 'fa-table-cells' },
      { to: '/wms/return', label: 'Retur Barang', icon: 'fa-rotate-left' },
      { to: '/wms/batch-log', label: 'Log Pergerakan', icon: 'fa-clock-rotate-left' },
      { to: '/wms/batch-adjustment', label: 'Penyesuaian Stok', icon: 'fa-clipboard-list' },
      { to: '/wms/stock-requests', label: 'Permintaan Stok', icon: 'fa-file-import' },
      { to: '/wms/investigation-stock', label: 'Investigasi Stok', icon: 'fa-search' }
    ]
  })

  // HR
  menus.push({
    id: 'hr',
    label: 'Sumber Daya Manusia',
    icon: 'fa-users-gear',
    items: [
      { to: '/hr/attendance', label: 'Absensi', icon: 'fa-user-clock' },
      { to: '/hr/shifts', label: 'Master Shift', icon: 'fa-clock' },
      { to: '/hr/schedules', label: 'Kalender Shift', icon: 'fa-calendar-alt' }
    ]
  })

  // Master Data
  if (auth.hasPermission('product.manage') || auth.hasPermission('location.manage')) {
    menus.push({
      id: 'master-data',
      label: 'Inventaris & Master',
      icon: 'fa-database',
      items: [
        { to: '/master-data/products', label: 'Produk', icon: 'fa-tags' },
        { to: '/master-data/packages', label: 'Paket', icon: 'fa-boxes-stacked' },
        { to: '/master-data/categories', label: 'Kategori', icon: 'fa-layer-group' },
        { to: '/master-data/media', label: 'Media Produk', icon: 'fa-images' },
        { to: '/master-data/locations', label: 'Lokasi Gudang', icon: 'fa-map-marker-alt' },
        { to: '/master-data/sales-channels', label: 'Saluran Penjualan', icon: 'fa-store' }
      ]
    })
  }

  // Analytics
  if (auth.hasPermission('report.view')) {
    menus.push({
      id: 'analytics',
      label: 'Laporan & Statistik',
      icon: 'fa-chart-pie',
      items: [
        { to: '/analytics/dashboard', label: 'Dashboard', icon: 'fa-chart-line' },
        { to: '/analytics/inventory-value', label: 'Nilai Inventaris', icon: 'fa-coins' },
        { to: '/analytics/stock-movement', label: 'Pergerakan Stok', icon: 'fa-arrow-right-arrow-left' },
        { to: '/analytics/stock-timeline', label: 'Timeline Stok', icon: 'fa-timeline' },
        { to: '/analytics/time-performance', label: 'Performa Waktu', icon: 'fa-stopwatch' },
        { to: '/analytics/package-analysis', label: 'Analisa Produk Paket', icon: 'fa-box-open' },
        { to: '/analytics/channel-performance', label: 'Penjualan Toko', icon: 'fa-shop' },
        { to: '/analytics/export-stock', label: 'Ekspor Stok', icon: 'fa-file-export' },
        { to: '/analytics/stock-distribution', label: 'Sebaran Stok', icon: 'fa-map-location-dot' },
        { to: '/analytics/location-capacity', label: 'Statistik Kapasitas', icon: 'fa-chart-simple' },
        { to: '/analytics/reports', label: 'Laporan Khusus', icon: 'fa-file-invoice' }
      ]
    })
  }

  // Settings
  if (auth.hasPermission('user.manage')) {
    menus.push({
      id: 'settings',
      label: 'Pengaturan Sistem',
      icon: 'fa-cog',
      items: [
        { to: '/settings/users', label: 'Pengguna', icon: 'fa-users' },
        { to: '/settings/roles', label: 'Peran & Izin', icon: 'fa-user-shield' },
        { to: '/settings/logs', label: 'Log Aktivitas', icon: 'fa-history' }
      ]
    })
  }

  return menus
})
</script>

<template>
  <aside
    class="flex flex-col bg-background text-text border-r border-secondary/20 transition-all duration-300 shadow-xl overflow-hidden shrink-0"
    :class="props.isCollapsed ? 'w-20' : 'w-64'"
  >
    <!-- Logo Area -->
    <button
      @click="$emit('toggle')"
      class="h-[60px] flex items-center shrink-0 border-b border-secondary/20 transition-all hover:bg-secondary/10"
      :class="props.isCollapsed ? 'justify-center px-0' : 'px-6'"
      title="Toggle Sidebar"
    >
      <img
        src="/public/android-chrome-512x512.png"
        alt="WMS Logo"
        class="h-8 object-contain transition-all duration-300"
        :class="props.isCollapsed ? 'w-8' : 'w-10'"
      />
      <span
        v-if="!props.isCollapsed"
        class="font-bold text-xl tracking-wide ml-3 text-primary hover:text-primary/80 transition-colors"
        >Kelja</span
      >
    </button>

    <!-- Navigation Area -->
    <nav class="flex-1 overflow-y-auto custom-scrollbar py-4 flex flex-col gap-1">
      <div v-for="menu in menuConfig" :key="menu.id" class="px-3">
        <!-- Accordion Header -->
        <button
          @click="toggleAccordion(menu.id)"
          class="flex items-center w-full justify-between p-3 rounded-xl transition-all duration-200 border gap-2"
          :class="[
            activeAccordion === menu.id
              ? 'border-primary text-primary bg-primary/5'
              : 'border-transparent hover:bg-secondary/10 hover:text-primary',
            props.isCollapsed ? 'justify-center' : ''
          ]"
          :title="props.isCollapsed ? menu.label : ''"
        >
          <div class="flex items-center gap-2">
            <font-awesome-icon
              :icon="`fa-solid ${menu.icon}`"
              class="w-5"
              :class="activeAccordion === menu.id ? 'text-primary' : 'text-text/60'"
            />
            <span v-if="!props.isCollapsed" class="font-bold text-sm tracking-wide">{{ menu.label }}</span>
          </div>
          <font-awesome-icon
            v-if="!props.isCollapsed"
            icon="fa-solid fa-chevron-down"
            class="text-[10px] transition-transform duration-300 opacity-50"
            :class="activeAccordion === menu.id ? 'rotate-180 opacity-100' : ''"
          />
        </button>

        <!-- Accordion Body (Submenus) -->
        <div
          v-if="activeAccordion === menu.id && !props.isCollapsed"
          class="mt-1 mb-2 ml-5 border-l border-secondary/30 flex flex-col overflow-hidden transition-all duration-300"
        >
          <router-link
            v-for="item in menu.items"
            :key="item.to"
            :to="item.to"
            class="sub-nav-item flex items-center gap-3"
            active-class="active"
          >
            <font-awesome-icon v-if="item.icon" :icon="`fa-solid ${item.icon}`" class="w-4 text-center opacity-70" />
            <span>{{ item.label }}</span>
          </router-link>
        </div>
      </div>
    </nav>

    <!-- Bottom Action -->
    <button
      @click="emit('toggle')"
      class="flex items-center justify-center bg-primary/5 w-full h-20 border-t border-secondary/20 text-primary hover:bg-primary/80 hover:text-background transition-colors"
    >
      <font-awesome-icon :icon="props.isCollapsed ? 'fa-solid fa-angle-right' : 'fa-solid fa-angle-left'" />
    </button>
  </aside>
</template>

<style lang="postcss" scoped>
.sub-nav-item {
  @apply py-2.5 px-3 text-[13px] rounded-lg text-text/60 hover:text-primary hover:bg-secondary/10 transition-colors;
}

.sub-nav-item.active {
  @apply text-primary font-semibold;
}
</style>
