import type { RouteRecordRaw } from 'vue-router'

export const hrRoutes: RouteRecordRaw[] = [
  {
    path: '/hr',
    component: () => import('@/app/layouts/RouterViewWrapper.vue'),
    meta: { requiresAuth: true },
    children: [
      { path: '', redirect: '/hr/attendance' },
      {
        path: 'attendance',
        name: 'Attendance',
        component: () => import('./views/AttendanceView.vue')
      },
      {
        path: 'shifts',
        name: 'ShiftManagement',
        component: () => import('./views/ShiftManagement.vue'),
        meta: { requiresPermission: 'user.manage' }
      },
      {
        path: 'schedules',
        name: 'ShiftSchedule',
        component: () => import('./views/ShiftSchedule.vue'),
        meta: { requiresPermission: 'user.manage' }
      }
    ]
  }
]
