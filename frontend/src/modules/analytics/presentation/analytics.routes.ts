import type { RouteRecordRaw } from 'vue-router'

export const analyticsRoutes: RouteRecordRaw[] = [
  {
    path: '/analytics',
    component: () => import('@/app/layouts/RouterViewWrapper.vue'),
    meta: { requiresAuth: true, requiresPermission: 'report.view' },
    children: [
      { path: '', redirect: '/analytics/dashboard' },
      {
        path: 'dashboard',
        name: 'CombinedAnalyticsDashboard',
        component: () => import('./views/DashboardView.vue')
      },
      {
        path: 'stock-movement',
        name: 'StockMovement',
        component: () => import('./components/StockMovementStats.vue')
      },
      {
        path: 'stock-timeline',
        name: 'StockTimeline',
        component: () => import('./components/StockTimelineFull.vue')
      },
      {
        path: 'inventory-value',
        name: 'InventoryValue',
        component: () => import('./components/InventoryValueStats.vue'),
        meta: { requiresPermission: 'statistic.finance.view' }
      },
      {
        path: 'time-performance',
        name: 'TimePerformance',
        component: () => import('./components/TimePerformanceStats.vue')
      },
      {
        path: 'channel-performance',
        name: 'ChannelPerformance',
        component: () => import('./components/ShopPerformanceStats.vue'),
        meta: { requiresPermission: 'statistic.finance.view' }
      },
      {
        path: 'package-analysis',
        name: 'PackageAnalysis',
        component: () => import('./components/PackageAnalysisTable.vue')
      },
      {
        path: 'export-stock',
        name: 'ExportStock',
        component: () => import('./views/ExportStockView.vue')
      },
      {
        path: 'location-capacity',
        name: 'LocationCapacity',
        component: () => import('./views/LocationCapacityStats.vue')
      },
      {
        path: 'stock-distribution',
        name: 'StockDistributionAnalytics',
        component: () => import('./views/StockDistributionAnalytics.vue')
      },
      {
        path: 'reports',
        name: 'Reports',
        component: () => import('./views/ReportsView.vue')
      }
    ]
  }
]
