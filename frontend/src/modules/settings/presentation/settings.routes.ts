import type { RouteRecordRaw } from 'vue-router'

export const settingsRoutes: RouteRecordRaw[] = [
  // --- GENERAL APP / SETTINGS ROUTES ---
  {
    path: '/guide',
    name: 'Guide',
    component: () => import('./views/GuideView.vue'),
    meta: { requiresAuth: true }
  },

  // --- NOTIFICATION ROUTES ---
  {
    path: '/notifications',
    name: 'NotificationCenter',
    component: () => import('./views/notifications/NotificationCenter.vue'),
    meta: { requiresAuth: true }
  },
  {
    path: '/notifications/preferences',
    name: 'NotificationPreferences',
    component: () => import('./views/notifications/NotificationPreferences.vue'),
    meta: { requiresAuth: true }
  },

  // --- SETTINGS / ADMIN DOMAIN ---
  {
    path: '/settings',
    component: () => import('@/app/layouts/RouterViewWrapper.vue'),
    meta: { requiresAuth: true },
    children: [
      { path: '', redirect: '/settings/users' },
      {
        path: 'users',
        name: 'UserManagement',
        component: () => import('./views/UserManagement.vue'),
        meta: { requiresPermission: 'user.manage' }
      },
      {
        path: 'roles',
        name: 'RoleManagement',
        component: () => import('./views/RoleManagement.vue'),
        meta: { requiresPermission: 'role.manage' }
      },
      {
        path: 'logs',
        name: 'Logs',
        component: () => import('./views/LogsView.vue'),
        meta: { requiresPermission: 'system_log.view' }
      }
    ]
  }
]
