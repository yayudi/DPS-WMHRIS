import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createRouter, createMemoryHistory } from 'vue-router'
import { defineComponent, ref } from 'vue'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import GlobalSidebar from '@/app/layouts/components/GlobalSidebar.vue'

vi.mock('@/modules/wms/application/useReplenishment', () => ({
  useReplenishment: () => ({
    onHoldCount: ref(0),
    loadOnHoldFulfillments: vi.fn().mockResolvedValue(undefined)
  })
}))

const DummyView = defineComponent({ template: '<div />' })
const DummyWrapper = defineComponent({ template: '<router-view />' })

function createTestRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      {
        path: '/wms',
        component: DummyWrapper,
        children: [
          { path: '', name: 'WMS', component: DummyView },
          { path: 'batch-adjustment', name: 'WMSBatchAdjustment', component: DummyView },
          { path: 'replenishment', name: 'WMSReplenishmentQueue', component: DummyView }
        ]
      }
    ]
  })
}

describe('GlobalSidebar.vue', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
  })

  it('hanya menandai submenu /wms aktif secara exact dan tidak membuat Dashboard aktif di child route WMS', async () => {
    const router = createTestRouter()
    await router.push('/wms/batch-adjustment')
    await router.isReady()

    const wrapper = mount(GlobalSidebar, {
      props: { isCollapsed: false },
      global: {
        plugins: [router],
        stubs: {
          FontAwesomeIcon: true
        }
      }
    })

    await flushPromises()

    const dashboardLink = wrapper.find('a[href="/wms"]')
    const adjustmentLink = wrapper.find('a[href="/wms/batch-adjustment"]')

    expect(dashboardLink.exists()).toBe(true)
    expect(adjustmentLink.exists()).toBe(true)
    expect(dashboardLink.classes()).not.toContain('active')
    expect(adjustmentLink.classes()).toContain('active')

    await router.push('/wms')
    await flushPromises()

    expect(dashboardLink.classes()).toContain('active')
    expect(adjustmentLink.classes()).not.toContain('active')
  })
})
