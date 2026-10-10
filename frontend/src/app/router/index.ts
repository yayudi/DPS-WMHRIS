import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router'
import { useAuthStore } from '@/modules/auth/application/auth.store'
import NProgress from 'nprogress'
import 'nprogress/nprogress.css'

import { authRoutes } from '@/modules/auth/presentation/auth.routes'
import { hrRoutes } from '@/modules/hr/presentation/hr.routes'
import { masterDataRoutes } from '@/modules/master_data/presentation/master_data.routes'
import { wmsRoutes } from '@/modules/wms/presentation/wms.routes'
import { analyticsRoutes } from '@/modules/analytics/presentation/analytics.routes'
import { settingsRoutes } from '@/modules/settings/presentation/settings.routes'

NProgress.configure({ showSpinner: false })

const routes: RouteRecordRaw[] = [
  // --- ROOT REDIRECT ---
  { path: '/', redirect: { name: 'WMS' } },

  // --- DOMAIN MODULE ROUTES ---
  ...authRoutes,
  ...hrRoutes,
  ...masterDataRoutes,
  ...wmsRoutes,
  ...analyticsRoutes,
  ...settingsRoutes,

  // --- FALLBACK ---
  {
    path: '/:pathMatch(.*)*',
    name: 'NotFound',
    component: () => import('@/core/presentation/components/ui/NotFound.vue')
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
    const requiredPermission = to.meta.requiresPermission as string

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
