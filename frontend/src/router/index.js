// frontend\src\router\index.js
import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '../stores/auth'
import AdminLayout from '../layouts/AdminLayout.vue'
import WMSActionsLayout from '../layouts/WMSActionsLayout.vue'
import HomeView from '../views/Home.vue'
import LoginView from '../views/Login.vue'
import AbsensiView from '../views/Absensi.vue'
import WMSView from '../views/WMS.vue'
import WMSBatchMovementView from '../views/WMSBatchMovement.vue'
// import WMSProductTransferView from '../views/WMSProductTransferView.vue'
import WMSBatchLogView from '../views/WMSBatchLogView.vue'
import WMSPickingListView from '../views/WMSPickingListView.vue'
import StatsView from '../views/Stats.vue'
import NotFoundView from '../components/NotFound.vue'
import AccountView from '../views/Account.vue'
import UserManagementView from '../views/admin/UserManagement.vue'
import RoleManagementView from '../views/admin/RoleManagement.vue'
import ProductManagementView from '../views/admin/ProductManagement.vue'
import LocationManagementView from '../views/admin/LocationManagement.vue'
import ReportsView from '../views/admin/ReportsView.vue'
import LogsView from '../views/admin/LogsView.vue'

const routes = [
  { path: '/login', name: 'Login', component: LoginView },
  { path: '/', name: 'Home', component: HomeView, meta: { requiresAuth: true } },
  { path: '/absensi', name: 'Absensi', component: AbsensiView, meta: { requiresAuth: true } },
  { path: '/wms', name: 'WMS', component: WMSView, meta: { requiresAuth: true } },
  {
    path: '/wms/actions',
    component: WMSActionsLayout,
    meta: { requiresAuth: true },
    children: [
      {
        path: 'batch-movement',
        name: 'WMSBatchMovement',
        component: WMSBatchMovementView,
        meta: { requiresPermission: 'perform-batch-movement' },
      },
      // {
      //   path: 'product-transfer',
      //   name: 'WMSProductTransfer',
      //   component: WMSProductTransferView,
      //   meta: { requiresPermission: 'perform-batch-movement' },
      // },
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
    ],
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
      // --- 2. Tambahkan Rute Baru di Sini ---
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
  console.log(
    `%c[Guard] Navigating from ${from.fullPath} to ${to.fullPath}`,
    'color: blue; font-weight: bold;',
  )
  const auth = useAuthStore()
  console.log(
    `[Guard] State: token=${!!auth.token}, user=${!!auth.user}, restoring=${auth.isSessionRestoring}`,
  )

  if (auth.token && !auth.user && !auth.isSessionRestoring) {
    console.log('[Guard] Action: Attempting to restore session...')
    try {
      auth.isSessionRestoring = true
      await auth.fetchUser()
      console.log('[Guard] Success: Session restored.')
    } catch (error) {
      console.error('[Guard] Failure: Could not restore session.', error)
    } finally {
      auth.isSessionRestoring = false
      console.log('[Guard] Info: Session restoration process finished.')
    }
  }

  if (auth.isSessionRestoring) {
    console.log('[Guard] Decision: Pausing navigation, session restoration in progress.')
    return
  }

  const isLoggedIn = auth.isAuthenticated
  console.log(`[Guard] Final Check: isLoggedIn = ${isLoggedIn}`)

  if (to.name === 'Login' && isLoggedIn) {
    console.log('[Guard] Decision: Redirecting from Login to Home (already logged in).')
    return next({ name: 'Home' })
  }

  if (to.meta.requiresAuth && !isLoggedIn) {
    console.log('[Guard] Decision: Auth required, redirecting to Login.')
    return next({ name: 'Login', query: { redirect: to.fullPath } })
  }

  if (to.meta.requiresPermission) {
    const hasPermission = auth.user?.permissions?.includes(to.meta.requiresPermission)
    if (!hasPermission) {
      console.warn(
        `[Guard] Decision: Permission '${to.meta.requiresPermission}' denied, redirecting to Home.`,
      )
      return next({ name: 'Home' })
    }
  }

  console.log('%c[Guard] Decision: Proceeding to next().', 'color: green')
  next()
})

export default router
