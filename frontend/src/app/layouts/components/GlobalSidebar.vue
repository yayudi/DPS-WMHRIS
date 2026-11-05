<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { useAuthStore } from '@/modules/auth/application/auth.store'
import { onClickOutside } from '@vueuse/core'
import { useMobile } from '@/core/presentation/composables/useMobile'
import { useReplenishment } from '@/modules/wms/application/useReplenishment'
import { useI18n } from '@/core/presentation/composables/useI18n'

const route = useRoute()
const auth = useAuthStore()
const { isMobile } = useMobile()
const { onHoldCount, loadOnHoldFulfillments } = useReplenishment()
const { t } = useI18n()

onMounted(() => {
  loadOnHoldFulfillments()
})

const sidebarRef = ref(null)

const props = defineProps({
  isCollapsed: Boolean
})
const emit = defineEmits(['toggle'])

onClickOutside(sidebarRef, () => {
  if (!props.isCollapsed && isMobile.value) {
    emit('toggle')
  }
})

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

watch(() => route.path, updateActiveAccordion, { immediate: true })

const toggleAccordion = id => {
  if (props.isCollapsed) {
    activeAccordion.value = id
    emit('toggle')
    return
  }

  if (activeAccordion.value === id) {
    activeAccordion.value = ''
  } else {
    activeAccordion.value = id
  }
}

// The master configuration of all navigation items
const menuConfig = computed(() => {
  const menus = []

  // WMS
  menus.push({
    id: 'wms',
    label: t('nav.wms'),
    icon: 'fa-warehouse',
    route: '/wms',
    badge: onHoldCount.value,
    items: [
      { to: '/wms', label: t('nav.dashboard'), icon: 'fa-chart-line' },
      { to: '/wms/replenishment', label: t('nav.replenishment'), icon: 'fa-boxes-packing', badge: onHoldCount.value },
      { to: '/wms/batch-movement', label: t('nav.batch_movement'), icon: 'fa-truck-ramp-box' },
      { to: '/wms/spreadsheet', label: t('nav.spreadsheet'), icon: 'fa-table-cells' },
      { to: '/wms/return', label: t('nav.return'), icon: 'fa-rotate-left' },
      { to: '/wms/batch-log', label: t('nav.batch_log'), icon: 'fa-clock-rotate-left' },
      { to: '/wms/batch-adjustment', label: t('nav.batch_adjustment'), icon: 'fa-clipboard-list' },
      { to: '/wms/stock-requests', label: t('nav.stock_requests'), icon: 'fa-file-import' },
      { to: '/wms/investigation-stock', label: t('nav.investigation'), icon: 'fa-search' }
    ]
  })

  // HR
  menus.push({
    id: 'hr',
    label: t('nav.hr'),
    icon: 'fa-users-gear',
    items: [
      { to: '/hr/attendance', label: t('nav.attendance'), icon: 'fa-user-clock' },
      { to: '/hr/shifts', label: t('nav.shifts'), icon: 'fa-clock' },
      { to: '/hr/schedules', label: t('nav.schedules'), icon: 'fa-calendar-alt' }
    ]
  })

  // Master Data
  if (auth.hasPermission('product.manage') || auth.hasPermission('location.manage')) {
    menus.push({
      id: 'master-data',
      label: t('nav.master_data'),
      icon: 'fa-database',
      items: [
        { to: '/master-data/products', label: t('nav.products'), icon: 'fa-tags' },
        { to: '/master-data/packages', label: t('nav.packages'), icon: 'fa-boxes-stacked' },
        { to: '/master-data/categories', label: t('nav.categories'), icon: 'fa-layer-group' },
        { to: '/master-data/media', label: t('nav.media'), icon: 'fa-images' },
        { to: '/master-data/locations', label: t('nav.locations'), icon: 'fa-map-marker-alt' },
        { to: '/master-data/sales-channels', label: t('nav.sales_channels'), icon: 'fa-store' }
      ]
    })
  }

  // Analytics
  if (auth.hasPermission('report.view')) {
    menus.push({
      id: 'analytics',
      label: t('nav.analytics'),
      icon: 'fa-chart-pie',
      items: [
        { to: '/analytics/dashboard', label: t('nav.dashboard'), icon: 'fa-chart-line' },
        { to: '/analytics/inventory-value', label: t('nav.inventory_value'), icon: 'fa-coins' },
        { to: '/analytics/stock-movement', label: t('nav.stock_movement'), icon: 'fa-arrow-right-arrow-left' },
        { to: '/analytics/stock-timeline', label: t('nav.stock_timeline'), icon: 'fa-timeline' },
        { to: '/analytics/time-performance', label: t('nav.time_performance'), icon: 'fa-stopwatch' },
        { to: '/analytics/package-analysis', label: t('nav.package_analysis'), icon: 'fa-box-open' },
        { to: '/analytics/channel-performance', label: t('nav.channel_performance'), icon: 'fa-shop' },
        { to: '/analytics/stock-distribution', label: t('nav.stock_distribution'), icon: 'fa-map-location-dot' },
        { to: '/analytics/location-capacity', label: t('nav.location_capacity'), icon: 'fa-chart-simple' },
        { to: '/analytics/export-stock', label: t('nav.export_stock'), icon: 'fa-file-export' },
        { to: '/analytics/reports', label: t('nav.reports'), icon: 'fa-file-invoice' }
      ]
    })
  }

  // Settings
  if (auth.hasPermission('user.manage') || auth.hasPermission('system.localization.manage')) {
    const settingItems = []
    if (auth.hasPermission('user.manage')) {
      settingItems.push(
        { to: '/settings/users', label: t('nav.users'), icon: 'fa-users' },
        { to: '/settings/roles', label: t('nav.roles'), icon: 'fa-user-shield' },
        { to: '/settings/logs', label: t('nav.logs'), icon: 'fa-history' }
      )
    }
    if (auth.hasPermission('system.localization.manage')) {
      settingItems.push(
        { to: '/settings/localization', label: t('nav.localization') || 'Bahasa & Lokalisasi', icon: 'fa-language' }
      )
    }

    menus.push({
      id: 'settings',
      label: t('nav.settings'),
      icon: 'fa-cog',
      items: settingItems
    })
  }

  return menus
})
</script>

<template>
  <aside
    ref="sidebarRef"
    class="flex flex-col bg-background text-text border-r border-secondary/20 transition-all duration-300 shadow-xl overflow-hidden shrink-0"
  >
    <!-- Logo Area -->
    <button
      @click="$emit('toggle')"
      class="h-[60px] flex items-center shrink-0 border-b border-secondary/20 transition-all hover:bg-secondary/10"
      :class="props.isCollapsed ? 'justify-center px-0' : 'px-6'"
      title="Toggle Sidebar"
    >
      <img
        src="/android-chrome-512x512.png"
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
      <div v-for="menu in menuConfig" :key="menu.id" class="px-1 md:px-3">
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
            <span
              v-if="menu.badge && menu.badge > 0 && !props.isCollapsed"
              class="px-1.5 py-0.5 text-[10px] font-bold rounded-full bg-warning text-white"
            >
              {{ menu.badge }}
            </span>
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
            class="sub-nav-item flex items-center justify-between gap-2"
            active-class="active"
          >
            <div class="flex items-center gap-3">
              <font-awesome-icon v-if="item.icon" :icon="`fa-solid ${item.icon}`" class="w-4 text-center opacity-70" />
              <span>{{ item.label }}</span>
            </div>
            <span
              v-if="item.badge && item.badge > 0"
              class="px-1.5 py-0.5 text-[10px] font-bold rounded-full bg-warning/20 border border-warning/40 text-warning"
            >
              {{ item.badge }}
            </span>
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
