// frontend\src\router\index.js
import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '../stores/auth'

// NOTE: Layouts & Views sekarang menggunakan Dynamic Imports (Lazy Loading)
// untuk performa dan code splitting yang lebih baik.

const routes = [
  // --- AUTH ROUTES ---
  {
    path: '/login',
    name: 'Login',
    component: () => import('../views/auth/Login.vue'),
    meta: { guestOnly: true },
  },

  // --- ROOT REDIRECT ---
  { path: '/', redirect: { name: 'WMS' } },

  // --- GENERAL APP ROUTES ---
  {
    path: '/absensi',
    name: 'Absensi',
    component: () => import('../views/hr/AttendanceView.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/stats',
    name: 'Stats',
    component: () => import('../views/user/StatsView.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/account',
    name: 'Account',
    component: () => import('../views/ProfileView.vue'),
    meta: { requiresAuth: true },
  },

  // --- WMS ROUTES ---
  {
    path: '/wms',
    name: 'WMS',
    component: () => import('../views/wms/Dashboard.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/wms/actions',
    component: () => import('../layouts/WMSActionsLayout.vue'),
    meta: { requiresAuth: true },
    children: [
      {
        path: 'return',
        name: 'WMSReturnView',
        component: () => import('../views/wms/Return.vue'),
        meta: { requiresPermission: 'manage-stock-adjustment' },
      },
      {
        path: 'batch-movement',
        name: 'WMSBatchMovement',
        component: () => import('../views/wms/BatchMovement.vue'),
        meta: { requiresPermission: 'perform-batch-movement' },
      },
      {
        path: 'picking-list',
        name: 'WMSPickingList',
        component: () => import('../views/wms/PickingList.vue'),
        meta: { requiresPermission: 'upload-picking-list' },
      },
      {
        path: 'batch-log',
        name: 'WMSBatchLog',
        component: () => import('../views/wms/BatchLogs.vue'),
        meta: { requiresPermission: 'view-batch-log' },
      },
      {
        path: 'batch-adjustment',
        name: 'WMSBatchAdjustment',
        component: () => import('../views/wms/BatchAdjustment.vue'),
        meta: { requiresPermission: 'manage-stock-adjustment' },
      },
    ],
  },
  // WMS Independent Pages
  {
    path: '/return/manual',
    name: 'ManualReturn',
    component: () => import('../views/wms/ManualReturnView.vue'),
    meta: {
      requiresAuth: true,
      title: 'Input Retur Manual',
      permission: 'manage-stock-adjustment',
    },
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
        meta: { requiresPermission: 'manage-users' },
      },
      {
        path: 'roles',
        name: 'RoleManagement',
        component: () => import('../views/admin/RoleManagement.vue'),
        meta: { requiresPermission: 'manage-roles' },
      },
      {
        path: 'products',
        name: 'ProductManagement',
        component: () => import('../views/admin/ProductManagement.vue'),
        meta: { requiresPermission: 'manage-products' },
      },
      {
        path: 'packages',
        name: 'PackageManagement',
        component: () => import('../views/admin/PackageManagement.vue'),
        meta: { requiresPermission: 'manage-products' },
      },
      {
        path: 'locations',
        name: 'LocationManagement',
        component: () => import('../views/admin/LocationManagement.vue'),
        meta: { requiresPermission: 'manage-locations' },
      },
      {
        path: 'reports',
        name: 'Reports',
        component: () => import('../views/admin/ReportsView.vue'),
        meta: { requiresPermission: 'view-reports' },
      },
      {
        path: 'logs',
        name: 'Logs',
        component: () => import('../views/admin/LogsView.vue'),
        meta: { requiresPermission: 'view-system-logs' },
      },
    ],
  },

  // --- FALLBACK ---
  {
    path: '/:pathMatch(.*)*',
    name: 'NotFound',
    component: () => import('../components/ui/NotFound.vue'),
  },
]

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
})

// --- NAVIGATION GUARD ---
router.beforeEach(async (to, from, next) => {
  const auth = useAuthStore()

  // Session Restoration Logic (Critical)
  // Pastikan user diload sebelum mengecek permission
  if (auth.token && !auth.user) {
    try {
      await auth.fetchUser()
    } catch (error) {
      console.error('Session restore failed:', error)
      // Opsional: Clear token jika fetch gagal agar user login ulang
      // auth.logout()
      return next({ name: 'Login' })
    }
  }

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
      // Jika tidak punya akses, redirect ke dashboard atau 403 (jika ada)
      // Di sini kita lempar ke WMS Dashboard sebagai default safe zone
      return next({ name: 'WMS' })
    }
  }

  // Proceed
  next()
})

export default router
