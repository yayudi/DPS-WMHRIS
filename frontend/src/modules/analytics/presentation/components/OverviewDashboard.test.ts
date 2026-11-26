import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createRouter, createMemoryHistory } from 'vue-router'
import { defineComponent, ref } from 'vue'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import OverviewDashboard from '@/modules/analytics/presentation/components/OverviewDashboard.vue'
import { useAuthStore } from '@/modules/auth/application/auth.store'
import type { KpiSummary } from '@/modules/analytics/domain/analytics.entity'

vi.mock('@/modules/wms/application/useReplenishment', () => ({
  useReplenishment: () => ({
    onHoldCount: ref(7),
    loadOnHoldFulfillments: vi.fn().mockResolvedValue(undefined)
  })
}))

const DummyView = defineComponent({ template: '<div />' })

function createTestRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/analytics/dashboard', component: DummyView },
      { path: '/analytics/stock-movement', component: DummyView },
      { path: '/analytics/stock-timeline', component: DummyView },
      { path: '/analytics/stock-distribution', component: DummyView },
      { path: '/analytics/location-capacity', component: DummyView },
      { path: '/analytics/inventory-value', component: DummyView },
      { path: '/wms/batch-log', component: DummyView },
      { path: '/wms/replenishment', component: DummyView },
      { path: '/wms/stock-requests', component: DummyView }
    ]
  })
}

const sampleKpiData: KpiSummary = {
  listsCompletedToday: 10,
  itemsPickedToday: 150,
  usersActiveToday: 5,
  totalInventoryValue: 25000000,
  pulse: {
    outboundToday: 150,
    outboundYesterday: 100,
    inboundToday: 300,
    inboundYesterday: 200,
    transferToday: 40,
    listsCompletedToday: 10,
    listsCompletedYesterday: 8,
    usersActiveToday: 5,
    pendingStockRequests: 4,
    totalActiveSkus: 120,
    totalInventoryValue: 25000000
  },
  stockHealth: {
    criticalCount: 3,
    warningCount: 5,
    safeCount: 90,
    deadOverstockCount: 12,
    emptyCount: 9,
    negativeCount: 1
  },
  watchlist: {
    criticalSkus: [
      {
        product_id: 1,
        sku: 'SKU-CRIT-01',
        name: 'Produk Kritis Satu',
        current_stock: 10,
        sold_30d: 150,
        avg_daily_sales: 5,
        days_of_inventory: 2
      }
    ],
    duplicateLocations: [
      {
        product_id: 2,
        sku: 'SKU-DUP-02',
        name: 'Produk Tercecer',
        purpose: 'DISPLAY',
        location_count: 3,
        locations: 'A1-01, A1-02, B2-01'
      }
    ],
    topLoadedLocations: [
      {
        location_id: 9,
        code: 'A19-R1-T1',
        building: 'A19',
        purpose: 'WAREHOUSE',
        total_products: 14,
        total_quantity: 950,
        total_weight_kg: 320.5
      }
    ]
  },
  movementTrend: [
    { date: '2026-11-23', total_inbound: 200, total_outbound: 100, total_transfer: 20 },
    { date: '2026-11-24', total_inbound: 300, total_outbound: 150, total_transfer: 40 }
  ],
  buildingDistribution: [
    { building: 'A19', total_locations: 20, total_skus: 80, total_quantity: 4500 }
  ]
}

describe('OverviewDashboard.vue', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('merender pulse operasional, kesehatan stok, 3 watchlist, dan menyembunyikan valuasi tanpa statistic.finance.view', async () => {
    const auth = useAuthStore()
    auth.setUser({ id: 2, username: 'staff', role_id: 2, permissions: ['report.view'] })

    const router = createTestRouter()
    await router.push('/analytics/dashboard')
    await router.isReady()

    const wrapper = mount(OverviewDashboard, {
      props: { kpiData: sampleKpiData },
      global: {
        plugins: [router],
        stubs: {
          FontAwesomeIcon: true,
          VueApexCharts: true
        }
      }
    })

    await flushPromises()

    const text = wrapper.text()
    expect(text).toContain('150')
    expect(text).toContain('+50%')
    expect(text).toContain('SKU-CRIT-01')
    expect(text).toContain('SKU-DUP-02')
    expect(text).toContain('A19-R1-T1')
    expect(text).not.toContain('Detail Valuasi')
  })

  it('menampilkan kartu valuasi inventaris untuk pemegang statistic.finance.view dan emit refresh saat tombol diklik', async () => {
    const auth = useAuthStore()
    auth.setUser({ id: 3, username: 'finance', role_id: 2, permissions: ['report.view', 'statistic.finance.view'] })

    const router = createTestRouter()
    await router.push('/analytics/dashboard')
    await router.isReady()

    const wrapper = mount(OverviewDashboard, {
      props: { kpiData: sampleKpiData },
      global: {
        plugins: [router],
        stubs: {
          FontAwesomeIcon: true,
          VueApexCharts: true
        }
      }
    })

    await flushPromises()

    expect(wrapper.text()).toContain('Detail Valuasi')

    const refreshBtn = wrapper.find('button')
    expect(refreshBtn.exists()).toBe(true)
    await refreshBtn.trigger('click')
    expect(wrapper.emitted('refresh')).toHaveLength(1)
  })
})
