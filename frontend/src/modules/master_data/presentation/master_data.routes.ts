import type { RouteRecordRaw } from 'vue-router'

export const masterDataRoutes: RouteRecordRaw[] = [
  {
    path: '/master-data',
    component: () => import('@/app/layouts/RouterViewWrapper.vue'),
    meta: { requiresAuth: true },
    children: [
      { path: '', redirect: '/master-data/products' },
      {
        path: 'products',
        name: 'ProductManagement',
        component: () => import('./views/ProductManagement.vue'),
        meta: { requiresPermission: 'product.manage' }
      },
      {
        path: 'packages',
        name: 'PackageManagement',
        component: () => import('./views/PackageManagement.vue'),
        meta: { requiresPermission: 'product.manage' }
      },
      {
        path: 'categories',
        name: 'CategoryManagement',
        component: () => import('./views/CategoryManagement.vue'),
        meta: { requiresPermission: 'manage-categories' }
      },
      {
        path: 'locations',
        name: 'LocationManagement',
        component: () => import('./views/LocationManagement.vue'),
        meta: { requiresPermission: 'location.manage' }
      },
      {
        path: 'sales-channels',
        name: 'SalesChannelManagement',
        component: () => import('./views/SalesChannelManagement.vue'),
        meta: { requiresPermission: 'sales_channel.manage' }
      },
      {
        path: 'media',
        name: 'MediaManagement',
        component: () => import('./views/MediaManagement.vue'),
        meta: { requiresPermission: 'product.image.view' }
      }
    ]
  }
]
