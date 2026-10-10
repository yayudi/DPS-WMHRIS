import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '@/modules/auth/application/auth.store'
import NProgress from 'nprogress'
import 'nprogress/nprogress.css'

NProgress.configure({ showSpinner: false })

const routes = [
  // --- AUTH ROUTES ---
  {
    path: '/login',
    name: 'Login',
    component: () => import('../modules/auth/presentation/views/LoginView.vue'),
    meta: { guestOnly: true }
  },

  // --- ROOT REDIRECT ---
  { path: '/', redirect: { name: 'WMS' } },

  // --- GENERAL APP ROUTES ---
  {
    path: '/account',
    name: 'Account',
    component: () => import('../modules/auth/presentation/views/ProfileView.vue'),
    meta: { requiresAuth: true }
  },
  {
    path: '/guide',
    name: 'Guide',
    component: () => import('../modules/settings/presentation/views/GuideView.vue'),
    meta: { requiresAuth: true }
  },

  // --- NOTIFICATION ROUTES ---
  {
    path: '/notifications',
    name: 'NotificationCenter',
    component: () => import('../modules/settings/presentation/views/notifications/NotificationCenter.vue'),
    meta: { requiresAuth: true }
  },
  {
    path: '/notifications/preferences',
    name: 'NotificationPreferences',
    component: () => import('../modules/settings/presentation/views/notifications/NotificationPreferences.vue'),
    meta: { requiresAuth: true }
  },

  // --- HR DOMAIN ---
  {
    path: '/hr',
    component: () => import('../layouts/RouterViewWrapper.vue'),
    meta: { requiresAuth: true },
    children: [
      { path: '', redirect: '/hr/attendance' },
      {
        path: 'attendance',
        name: 'Attendance',
        component: () => import('../modules/hr/presentation/views/AttendanceView.vue')
      },
      {
        path: 'shifts',
        name: 'ShiftManagement',
        component: () => import('../modules/hr/presentation/views/ShiftManagement.vue'),
        meta: { requiresPermission: 'user.manage' }
      },
      {
        path: 'schedules',
        name: 'ShiftSchedule',
        component: () => import('../modules/hr/presentation/views/ShiftSchedule.vue'),
        meta: { requiresPermission: 'user.manage' }
      }
    ]
  },

  // --- MASTER DATA DOMAIN ---
  {
    path: '/master-data',
    component: () => import('../layouts/RouterViewWrapper.vue'),
    meta: { requiresAuth: true },
    children: [
      { path: '', redirect: '/master-data/products' },
      {
        path: 'products',
        name: 'ProductManagement',
        component: () => import('../modules/master_data/presentation/views/ProductManagement.vue'),
        meta: { requiresPermission: 'product.manage' }
      },
      {
        path: 'packages',
        name: 'PackageManagement',
        component: () => import('../modules/master_data/presentation/views/PackageManagement.vue'),
        meta: { requiresPermission: 'product.manage' }
      },
      {
        path: 'categories',
        name: 'CategoryManagement',
        component: () => import('../modules/master_data/presentation/views/CategoryManagement.vue'),
        meta: { requiresPermission: 'manage-categories' }
      },
      {
        path: 'locations',
        name: 'LocationManagement',
        component: () => import('../modules/master_data/presentation/views/LocationManagement.vue'),
        meta: { requiresPermission: 'location.manage' }
      },
      {
        path: 'sales-channels',
        name: 'SalesChannelManagement',
        component: () => import('../modules/master_data/presentation/views/SalesChannelManagement.vue'),
        meta: { requiresPermission: 'sales_channel.manage' }
      },
      {
        path: 'media',
        name: 'MediaManagement',
        component: () => import('../modules/master_data/presentation/views/MediaManagement.vue'),
        meta: { requiresPermission: 'product.image.view' }
      }
    ]
  },

  // --- WMS DOMAIN ---
  {
    path: '/wms/scanner-test',
    name: 'WMSScannerTest',
    component: () => import('../modules/wms/presentation/views/ScannerTestView.vue'),
    meta: { requiresAuth: true }
  },
  {
    path: '/wms',
    component: () => import('../layouts/RouterViewWrapper.vue'),
    meta: { requiresAuth: true },
    children: [
      {
        path: '',
        name: 'WMS',
        component: () => import('../modules/wms/presentation/views/WmsDashboard.vue')
      },
      {
        path: 'return',
        name: 'WMSReturnView',
        component: () => import('../modules/wms/presentation/views/WmsReturn.vue'),
        meta: { requiresPermission: 'stock_adjustment.manage' }
      },
      {
        path: 'batch-movement',
        name: 'WMSBatchMovement',
        component: () => import('../modules/wms/presentation/views/BatchMovement.vue'),
        meta: { requiresPermission: 'stock_batch.move' }
      },
      {
        path: 'spreadsheet',
        name: 'WMSSpreadsheet',
        component: () => import('../modules/wms/presentation/views/SpreadsheetTransaction.vue'),
        meta: { requiresPermission: 'stock_batch.move' }
      },
      {
        path: 'batch-log',
        name: 'WMSBatchLog',
        component: () => import('../modules/wms/presentation/views/BatchLogs.vue'),
        meta: { requiresPermission: 'stock_batch_log.view' }
      },
      {
        path: 'batch-adjustment',
        name: 'WMSBatchAdjustment',
        component: () => import('../modules/wms/presentation/views/BatchAdjustment.vue'),
        meta: { requiresPermission: 'stock_adjustment.manage' }
      },
      {
        path: 'stock-requests',
        name: 'StockRequests',
        component: () => import('../modules/wms/presentation/views/StockRequests.vue'),
        meta: { title: 'Permintaan Stok' }
      },
      {
        path: 'investigation-stock',
        name: 'InvestigationStock',
        component: () => import('../modules/wms/presentation/views/InvestigationStock.vue'),
        meta: { requiresPermission: 'system_log.view', title: 'Investigasi Stok' }
      }
    ]
  },
  {
    path: '/return/manual',
    name: 'ManualReturn',
    component: () => import('../modules/wms/presentation/views/ManualReturnView.vue'),
    meta: {
      requiresAuth: true,
      title: 'Input Retur Manual',
      permission: 'stock_adjustment.manage'
    }
  },

  // --- ANALYTICS DOMAIN ---
  {
    path: '/analytics',
    component: () => import('../layouts/RouterViewWrapper.vue'),
    meta: { requiresAuth: true, requiresPermission: 'report.view' },
    children: [
      { path: '', redirect: '/analytics/dashboard' },
      {
        path: 'dashboard',
        name: 'CombinedAnalyticsDashboard',
        component: () => import('../modules/analytics/presentation/views/DashboardView.vue')
      },
      {
        path: 'stock-movement',
        name: 'StockMovement',
        component: () => import('../components/stats/StockMovementStats.vue')
      },
      {
        path: 'stock-timeline',
        name: 'StockTimeline',
        component: () => import('../components/stats/StockTimelineFull.vue')
      },
      {
        path: 'inventory-value',
        name: 'InventoryValue',
        component: () => import('../components/stats/InventoryValueStats.vue'),
        meta: { requiresPermission: 'statistic.finance.view' }
      },
      {
        path: 'time-performance',
        name: 'TimePerformance',
        component: () => import('../components/stats/TimePerformanceStats.vue')
      },
      {
        path: 'channel-performance',
        name: 'ChannelPerformance',
        component: () => import('../components/stats/ShopPerformanceStats.vue'),
        meta: { requiresPermission: 'statistic.finance.view' }
      },
      {
        path: 'package-analysis',
        name: 'PackageAnalysis',
        component: () => import('../components/stats/PackageAnalysisTable.vue')
      },
      {
        path: 'export-stock',
        name: 'ExportStock',
        component: () => import('../modules/analytics/presentation/views/ExportStockView.vue')
      },
      {
        path: 'location-capacity',
        name: 'LocationCapacity',
        component: () => import('../modules/analytics/presentation/views/LocationCapacityStats.vue')
      },
      {
        path: 'stock-distribution',
        name: 'StockDistributionAnalytics',
        component: () => import('../modules/analytics/presentation/views/StockDistributionAnalytics.vue')
      },
      {
        path: 'reports',
        name: 'Reports',
        component: () => import('../modules/analytics/presentation/views/ReportsView.vue')
      }
    ]
  },

  // --- SETTINGS / ADMIN DOMAIN ---
  {
    path: '/settings',
    component: () => import('../layouts/RouterViewWrapper.vue'),
    meta: { requiresAuth: true },
    children: [
      { path: '', redirect: '/settings/users' },
      {
        path: 'users',
        name: 'UserManagement',
        component: () => import('../modules/settings/presentation/views/UserManagement.vue'),
        meta: { requiresPermission: 'user.manage' }
      },
      {
        path: 'roles',
        name: 'RoleManagement',
        component: () => import('../modules/settings/presentation/views/RoleManagement.vue'),
        meta: { requiresPermission: 'role.manage' }
      },
      {
        path: 'logs',
        name: 'Logs',
        component: () => import('../modules/settings/presentation/views/LogsView.vue'),
        meta: { requiresPermission: 'system_log.view' }
      }
    ]
  },

  // --- FALLBACK ---
  {
    path: '/:pathMatch(.*)*',
    name: 'NotFound',
    component: () => import('../components/ui/NotFound.vue')
  }
]

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes
})

// --- NAVIGATION GUARD ---
router.beforeEach(async (to, from, next) => {
  NProgress.start()
  const auth = useAuthStore()

  const isLoggedIn = auth.isAuthenticated

  // Guest Only Logic (Login page)
  if (to.name === 'Login' && isLoggedIn) {
    return next({ name: 'WMS' })
  }

  // Auth Requirement Logic
  if (to.meta.requiresAuth && !isLoggedIn) {
    return next({ name: 'Login', query: { redirect: to.fullPath } })
  }

  // Permission / RBAC Logic
  if (to.meta.requiresPermission) {
    const requiredPermission = to.meta.requiresPermission

    // Cek permission menggunakan method store
    if (!auth.hasPermission(requiredPermission)) {
      return next({ name: 'WMS' })
    }
  }

  // Proceed
  next()
})

router.afterEach(() => {
  NProgress.done()
})

export default router
