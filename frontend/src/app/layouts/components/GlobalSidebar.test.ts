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

  it('menerapkan class hover kontras dan group-hover pada ikon menu nonaktif saat isCollapsed true', async () => {
    const router = createTestRouter()
    await router.push('/wms')
    await router.isReady()

    const wrapper = mount(GlobalSidebar, {
      props: { isCollapsed: true },
      global: {
        plugins: [router],
        stubs: {
          FontAwesomeIcon: true
        }
      }
    })

    await flushPromises()

    const navButtons = wrapper.findAll('nav button')
    expect(navButtons.length).toBeGreaterThanOrEqual(2)

    const inactiveButton = navButtons[1]
    expect(inactiveButton.classes()).toContain('group')
    expect(inactiveButton.classes()).toContain('hover:bg-primary/10')
    expect(inactiveButton.classes()).toContain('hover:text-primary')

    const inactiveIcon = inactiveButton.find('font-awesome-icon-stub')
    expect(inactiveIcon.exists()).toBe(true)
    expect(inactiveIcon.classes()).toContain('group-hover:text-primary')
  })
})
