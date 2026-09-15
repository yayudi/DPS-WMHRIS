// frontend\src\router\index.js
import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '../stores/auth'
import NProgress from 'nprogress'
import 'nprogress/nprogress.css'

NProgress.configure({ showSpinner: false })

const routes = [
  // --- AUTH ROUTES ---
  {
    path: '/login',
    name: 'Login',
    component: () => import('../views/auth/LoginView.vue'),
    meta: { guestOnly: true }
  },

  // --- ROOT REDIRECT ---
  { path: '/', redirect: { name: 'WMS' } },

  // --- GENERAL APP ROUTES ---
  {
    path: '/absensi',
    name: 'Absensi',
    component: () => import('../views/hr/AttendanceView.vue'),
    meta: { requiresAuth: true }
  },
  {
    path: '/stats',
    name: 'Stats',
    component: () => import('../views/stats/StatsView.vue'),
    meta: { requiresAuth: true, requiresPermission: 'statistic.stock.view' }
  },
  {
    path: '/stats/dashboard',
    name: 'CombinedAnalyticsDashboard',
    component: () => import('../views/stats/CombinedAnalyticsDashboard.vue'),
    meta: { requiresAuth: true, requiresPermission: 'statistic.stock.view' }
  },
  {
    path: '/stats/locations',
    name: 'StockDistributionAnalytics',
    component: () => import('../views/stats/StockDistributionAnalytics.vue'),
    meta: { requiresAuth: true, requiresPermission: 'statistic.stock.view' }
  },

  {
    path: '/account',
    name: 'Account',
    component: () => import('../views/ProfileView.vue'),
    meta: { requiresAuth: true }
  },
  {
    path: '/guide',
    name: 'Guide',
    component: () => import('../views/GuideView.vue'),
    meta: { requiresAuth: true }
  },

  // --- NOTIFICATION ROUTES ---
  {
    path: '/notifications',
    name: 'NotificationCenter',
    component: () => import('../views/notifications/NotificationCenter.vue'),
    meta: { requiresAuth: true }
  },
  {
    path: '/notifications/preferences',
    name: 'NotificationPreferences',
    component: () => import('../views/notifications/NotificationPreferences.vue'),
    meta: { requiresAuth: true }
  },

  // --- WMS ROUTES ---
  {
    path: '/wms/scanner-test',
    name: 'WMSScannerTest',
    component: () => import('../views/wms/ScannerTestView.vue'),
    meta: { requiresAuth: true }
  },
  {
    path: '/wms',
    name: 'WMS',
    component: () => import('../views/wms/WmsDashboard.vue'),
    meta: { requiresAuth: true }
  },
  {
    path: '/media',
    name: 'MediaManagement',
    component: () => import('../views/media/MediaManagement.vue'),
    meta: { requiresAuth: true, requiresPermission: 'product.image.view' }
  },
  {
    path: '/wms/actions',
    component: () => import('../layouts/WMSActionsLayout.vue'),
    meta: { requiresAuth: true },
    children: [
      {
        path: 'return',
        name: 'WMSReturnView',
        component: () => import('../views/wms/WmsReturn.vue'),
        meta: { requiresPermission: 'stock_adjustment.manage' }
      },
      {
        path: 'batch-movement',
        name: 'WMSBatchMovement',
        component: () => import('../views/wms/BatchMovement.vue'),
        meta: { requiresPermission: 'stock_batch.move' }
      },
      {
        path: 'spreadsheet',
        name: 'WMSSpreadsheet',
        component: () => import('../views/wms/SpreadsheetTransaction.vue'),
        meta: { requiresPermission: 'stock_batch.move' }
      },
      {
        path: 'picking-list',
        name: 'WMSPickingList',
        component: () => import('../views/wms/PickingList.vue'),
        meta: { requiresPermission: 'picking_list.upload' }
      },
      {
        path: 'batch-log',
        name: 'WMSBatchLog',
        component: () => import('../views/wms/BatchLogs.vue'),
        meta: { requiresPermission: 'stock_batch_log.view' }
      },
      {
        path: 'batch-adjustment',
        name: 'WMSBatchAdjustment',
        component: () => import('../views/wms/BatchAdjustment.vue'),
        meta: { requiresPermission: 'stock_adjustment.manage' }
      },
      {
        path: 'stock-requests',
        name: 'StockRequests',
        component: () => import('../views/wms/StockRequests.vue'),
        meta: { title: 'Permintaan Stok' }
      },
      {
        path: 'investigation-stock',
        name: 'InvestigationStock',
        component: () => import('../views/InvestigationStock.vue'),
        meta: { requiresPermission: 'system_log.view', title: 'Investigasi Stok' }
      }
    ]
  },
  {
    path: '/return/manual',
    name: 'ManualReturn',
    component: () => import('../views/wms/ManualReturnView.vue'),
    meta: {
      requiresAuth: true,
      title: 'Input Retur Manual',
      permission: 'stock_adjustment.manage'
    }
  },

  // --- ADMIN ROUTES ---
  {
    path: '/admin',
    component: () => import('../layouts/AdminLayout.vue'),
    meta: { requiresAuth: true },
    children: [
      {
        path: 'users',
        name: 'UserManagement',
        component: () => import('../views/admin/UserManagement.vue'),
        meta: { requiresPermission: 'user.manage' }
      },
      {
        path: 'roles',
        name: 'RoleManagement',
        component: () => import('../views/admin/RoleManagement.vue'),
        meta: { requiresPermission: 'role.manage' }
      },
      {
        path: 'products',
        name: 'ProductManagement',
        component: () => import('../views/admin/ProductManagement.vue'),
        meta: { requiresPermission: 'product.manage' }
      },
      {
        path: 'packages',
        name: 'PackageManagement',
        component: () => import('../views/admin/PackageManagement.vue'),
        meta: { requiresPermission: 'product.manage' }
      },
      {
        path: 'locations',
        name: 'LocationManagement',
        component: () => import('../views/admin/LocationManagement.vue'),
        meta: { requiresPermission: 'location.manage' }
      },
      {
        path: 'categories',
        name: 'CategoryManagement',
        component: () => import('../views/admin/CategoryManagement.vue'),
        meta: { requiresPermission: 'manage-categories' }
      },
      {
        path: 'sales-channels',
        name: 'SalesChannelManagement',
        component: () => import('../views/admin/SalesChannelManagement.vue'),
        // Untuk sekarang gunakan permission ini. Anda dapat menambahkan permission khusus nantinya.
        meta: { requiresPermission: 'manage-categories' }
      },
      {
        path: 'reports',
        name: 'Reports',
        component: () => import('../views/admin/ReportsView.vue'),
        meta: { requiresPermission: 'report.view' }
      },
      {
        path: 'logs',
        name: 'Logs',
        component: () => import('../views/admin/LogsView.vue'),
        meta: { requiresPermission: 'system_log.view' }
      },
      {
        path: 'shifts',
        name: 'ShiftManagement',
        component: () => import('../views/admin/ShiftManagement.vue'),
        meta: { requiresPermission: 'user.manage' }
      },
      {
        path: 'schedules',
        name: 'ShiftSchedule',
        component: () => import('../views/admin/ShiftSchedule.vue'),
        meta: { requiresPermission: 'user.manage' }
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
