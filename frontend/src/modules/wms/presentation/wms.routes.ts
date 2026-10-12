import type { RouteRecordRaw } from 'vue-router'

export const wmsRoutes: RouteRecordRaw[] = [
  {
    path: '/wms/scanner-test',
    name: 'WMSScannerTest',
    component: () => import('./views/ScannerTestView.vue'),
    meta: { requiresAuth: true }
  },
  {
    path: '/wms',
    component: () => import('@/app/layouts/RouterViewWrapper.vue'),
    meta: { requiresAuth: true },
    children: [
      {
        path: '',
        name: 'WMS',
        component: () => import('./views/WmsDashboard.vue')
      },
      {
        path: 'return',
        name: 'WMSReturnView',
        component: () => import('./views/WmsReturn.vue'),
        meta: { requiresPermission: 'stock_adjustment.manage' }
      },
      {
        path: 'batch-movement',
        name: 'WMSBatchMovement',
        component: () => import('./views/BatchMovement.vue'),
        meta: { requiresPermission: 'stock_batch.move' }
      },
      {
        path: 'spreadsheet',
        name: 'WMSSpreadsheet',
        component: () => import('./views/SpreadsheetTransaction.vue'),
        meta: { requiresPermission: 'stock_batch.move' }
      },
      {
        path: 'batch-log',
        name: 'WMSBatchLog',
        component: () => import('./views/BatchLogs.vue'),
        meta: { requiresPermission: 'stock_batch_log.view' }
      },
      {
        path: 'batch-adjustment',
        name: 'WMSBatchAdjustment',
        component: () => import('./views/BatchAdjustment.vue'),
        meta: { requiresPermission: 'stock_adjustment.manage' }
      },
      {
        path: 'stock-requests',
        name: 'StockRequests',
        component: () => import('./views/StockRequests.vue'),
        meta: { title: 'Permintaan Stok' }
      },
      {
        path: 'investigation-stock',
        name: 'InvestigationStock',
        component: () => import('./views/InvestigationStock.vue'),
        meta: { requiresPermission: 'system_log.view', title: 'Investigasi Stok' }
      }
    ]
  },
  {
    path: '/return/manual',
    name: 'ManualReturn',
    component: () => import('./views/ManualReturnView.vue'),
    meta: {
      requiresAuth: true,
      title: 'Input Retur Manual',
      permission: 'stock_adjustment.manage'
    }
  }
]
