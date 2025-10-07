// router\index.js
import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '../stores/auth'
import AdminLayout from '../layouts/AdminLayout.vue'
import HomeView from '../views/Home.vue'
import LoginView from '../views/Login.vue'
import AbsensiView from '../views/Absensi.vue'
import WMSView from '../views/WMS.vue'
import StatsView from '../views/Stats.vue'
import NotFoundView from '../components/NotFound.vue'
import AccountView from '../views/Account.vue'
import UserManagementView from '../views/admin/UserManagement.vue'

const routes = [
  {
    path: '/login',
    name: 'Login',
    component: LoginView,
  },
  {
    path: '/',
    name: 'Home',
    component: HomeView,
    meta: { requiresAuth: true },
  },
  {
    path: '/absensi',
    name: 'Absensi',
    component: AbsensiView,
    meta: { requiresAuth: true },
  },
  {
    path: '/wms',
    name: 'WMS',
    component: WMSView,
    meta: { requiresAuth: true },
  },
  {
    path: '/stats',
    name: 'Stats',
    component: StatsView,
    meta: { requiresAuth: true },
  },
  {
    path: '/account',
    name: 'Account',
    component: AccountView,
    meta: { requiresAuth: true },
  },
  // --- GRUP RUTE ADMIN ---
  {
    path: '/admin',
    component: AdminLayout,
    meta: { requiresAuth: true, requiresAdmin: true },
    children: [
      {
        path: 'users', // Akan menjadi /admin/users
        name: 'UserManagement',
        component: UserManagementView,
      },
      // { path: 'roles', component: RoleManagementView },
      // { path: 'settings', component: SettingsView }
    ],
  },
  {
    path: '/:pathMatch(.*)*',
    name: 'NotFound',
    component: NotFoundView,
  },
]

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
})

// Navigation Guard yang Disederhanakan dan Benar
router.beforeEach(async (to, from, next) => {
  const auth = useAuthStore()

  // Langkah 0: Jika data user belum ada TAPI token ada,
  // TUNGGU sampai proses fetchUser selesai.
  // Ini adalah kunci untuk menyelesaikan race condition.
  if (to.meta.requiresAuth && !auth.user && auth.token) {
    await auth.fetchUser()
  }

  // Sekarang, setelah data user (jika ada) sudah pasti dimuat,
  // kita bisa melanjutkan logika guard seperti biasa.
  const isLoggedIn = auth.isAuthenticated
  const isUserAdmin = auth.isAdmin

  // Prioritas 1: Rute butuh admin, tapi user bukan admin
  if (to.meta.requiresAdmin && !isUserAdmin) {
    next({ name: 'Home' })
  }
  // Prioritas 2: Rute butuh login, tapi user belum login
  else if (to.meta.requiresAuth && !isLoggedIn) {
    next({ name: 'Login' })
  }
  // Prioritas 3: User sudah login tapi mencoba akses halaman login
  else if (to.name === 'Login' && isLoggedIn) {
    next({ name: 'Home' })
  }
  // Jika semua aman, lanjutkan
  else {
    next()
  }
})

export default router
