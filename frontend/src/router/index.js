import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '../stores/auth'
import AdminLayout from '../layouts/AdminLayout.vue'
import WMSActionsLayout from '../layouts/WMSActionsLayout.vue'
import LoginView from '../views/Login.vue'
import AbsensiView from '../views/Absensi.vue'
import WMSView from '../views/WMS.vue'
import WMSReturnView from '../views/WMSReturnView.vue'
import WMSBatchMovementView from '../views/WMSBatchMovement.vue'
import WMSBatchAdjustmentView from '../views/WMSBatchAdjustment.vue'
import WMSBatchLogView from '../views/WMSBatchLogView.vue'
import WMSPickingListView from '../views/WMSPickingListView.vue'
import StatsView from '../views/Stats.vue'
import NotFoundView from '../components/NotFound.vue'
import AccountView from '../views/Account.vue'
import UserManagementView from '../views/admin/UserManagement.vue'
import RoleManagementView from '../views/admin/RoleManagement.vue'
import ProductManagementView from '../views/admin/ProductManagement.vue'
import LocationManagementView from '../views/admin/LocationManagement.vue'
import ManualReturn from '../views/ManualReturn.vue'
import ReportsView from '../views/admin/ReportsView.vue'
import LogsView from '../views/admin/LogsView.vue'

const routes = [
  { path: '/login', name: 'Login', component: LoginView },
  { path: '/', redirect: { name: 'WMS' } },
  { path: '/absensi', name: 'Absensi', component: AbsensiView, meta: { requiresAuth: true } },
  { path: '/wms', name: 'WMS', component: WMSView, meta: { requiresAuth: true } },
  {
    path: '/wms/actions',
    component: WMSActionsLayout,
    meta: { requiresAuth: true },
    children: [
      {
        path: 'return',
        name: 'WMSReturnView',
        component: WMSReturnView,
        meta: { requiresAuth: true, permission: 'manage-stock-adjustment' },
      },
      {
        path: 'batch-movement',
        name: 'WMSBatchMovement',
        component: WMSBatchMovementView,
        meta: { requiresPermission: 'perform-batch-movement' },
      },
      {
        path: 'picking-list',
        name: 'WMSPickingList',
        component: WMSPickingListView,
        meta: { requiresPermission: 'upload-picking-list' },
      },
      {
        path: 'batch-log',
        name: 'WMSBatchLog',
        component: WMSBatchLogView,
        meta: { requiresPermission: 'view-batch-log' },
      },
      {
        path: 'batch-adjustment',
        name: 'WMSBatchAdjustment',
        component: WMSBatchAdjustmentView,
        meta: { requiresPermission: 'manage-stock-adjustment' },
      },
    ],
  },
  // [NEW ROUTE] Halaman Input Retur Manual (Full Page)
  {
    path: '/return/manual',
    name: 'ManualReturn',
    component: ManualReturn,
    meta: {
      requiresAuth: true,
      title: 'Input Retur Manual',
      permission: 'manage-stock-adjustment', // Opsional: Sesuaikan dengan permission yang relevan
    },
  },
  { path: '/stats', name: 'Stats', component: StatsView, meta: { requiresAuth: true } },
  { path: '/account', name: 'Account', component: AccountView, meta: { requiresAuth: true } },
  {
    path: '/admin',
    component: AdminLayout,
    meta: { requiresAuth: true },
    children: [
      {
        path: 'users',
        name: 'UserManagement',
        component: UserManagementView,
        meta: { requiresPermission: 'manage-users' },
      },
      {
        path: 'roles',
        name: 'RoleManagement',
        component: RoleManagementView,
        meta: { requiresPermission: 'manage-roles' },
      },
      {
        path: 'products',
        name: 'ProductManagement',
        component: ProductManagementView,
        meta: { requiresPermission: 'manage-products' },
      },
      {
        path: 'locations',
        name: 'LocationManagement',
        component: LocationManagementView,
        meta: { requiresPermission: 'manage-locations' },
      },
      {
        path: 'reports',
        name: 'Reports',
        component: ReportsView,
        meta: { requiresPermission: 'view-reports' },
      },
      {
        path: 'logs',
        name: 'Logs',
        component: LogsView,
        meta: { requiresPermission: 'view-system-logs' },
      },
    ],
  },
  { path: '/:pathMatch(.*)*', name: 'NotFound', component: NotFoundView },
]

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
})

// Navigation Guard yang Disederhanakan dan Benar
router.beforeEach(async (to, from, next) => {
  const auth = useAuthStore()

  if (auth.token && !auth.user && !auth.isSessionRestoring) {
    try {
      auth.isSessionRestoring = true
      await auth.fetchUser()
    } catch (error) {
    } finally {
      auth.isSessionRestoring = false
    }
  }

  if (auth.isSessionRestoring) {
    return
  }

  const isLoggedIn = auth.isAuthenticated

  if (to.name === 'Login' && isLoggedIn) {
    return next({ name: 'WMS' })
  }

  if (to.meta.requiresAuth && !isLoggedIn) {
    return next({ name: 'Login', query: { redirect: to.fullPath } })
  }

  if (to.meta.requiresPermission) {
    // --- BLOK INVESTIGASI RCAB ---
    const requiredPermission = to.meta.requiresPermission
    const userPermissions = auth.user?.permissions || []
    const hasPermission = auth.hasPermission(requiredPermission)
    // --- AKHIR BLOK INVESTIGASI ---

    if (!hasPermission) {
      return next({ name: 'WMS' })
    }
  }

  next()
})

export default router
