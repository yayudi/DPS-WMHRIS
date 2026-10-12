import type { RouteRecordRaw } from 'vue-router'

export const authRoutes: RouteRecordRaw[] = [
  {
    path: '/login',
    name: 'Login',
    component: () => import('./views/LoginView.vue'),
    meta: { guestOnly: true }
  },
  {
    path: '/account',
    name: 'Account',
    component: () => import('./views/ProfileView.vue'),
    meta: { requiresAuth: true }
  }
]
