import { mount } from '@vue/test-utils'
import { describe, it, expect, vi } from 'vitest'
import { createTestingPinia } from '@pinia/testing'
import BatchEditModal from '@/components/products/BatchEditModal.vue'
import PackageBatchEditModal from '@/components/products/PackageBatchEditModal.vue'

const BaseModalStub = {
  name: 'BaseModal',
  props: ['show', 'title', 'maxWidth'],
  template: '<div v-if="show"><slot /></div>'
}

const commonStubs = {
  BaseModal: BaseModalStub,
  BaseTabs: true,
  TriStateSelect: true,
  ImportJobHistory: true,
  'font-awesome-icon': true
}

describe('BatchEditModal & PackageBatchEditModal export job rendering', () => {
  it('renders PRODUCT_MASTER jobs safely when filters is an Object or JSON string', () => {
    const wrapper = mount(BatchEditModal, {
      props: { isOpen: true, isExporting: false, isImporting: false },
      global: {
        plugins: [
          createTestingPinia({
            createSpy: vi.fn,
            initialState: {
              download: {
                jobs: [
                  {
                    id: 1,
                    type: 'PRODUCT_MASTER',
                    status: 'COMPLETED',
                    created_at: '2026-11-17T00:00:00Z',
                    filters: { exportType: 'PRODUCT_MASTER', format: 'csv' },
                    download_url: 'https://example.com/1.csv'
                  },
                  {
                    id: 2,
                    type: 'PRODUCT_MASTER',
                    status: 'COMPLETED',
                    created_at: '2026-11-17T00:01:00Z',
                    filters: '{"exportType":"PRODUCT_MASTER","format":"xlsx"}',
                    download_url: 'https://example.com/2.xlsx'
                  }
                ]
              }
            }
          })
        ],
        stubs: commonStubs
      }
    })

    expect(wrapper.text()).toContain('Data Master Produk (CSV)')
    expect(wrapper.text()).toContain('Data Master Produk (XLSX)')
  })

  it('renders EXPORT_PACKAGES jobs safely when filters is an Object or JSON string', () => {
    const wrapper = mount(PackageBatchEditModal, {
      props: { isOpen: true, isExporting: false, isImporting: false },
      global: {
        plugins: [
          createTestingPinia({
            createSpy: vi.fn,
            initialState: {
              download: {
                jobs: [
                  {
                    id: 10,
                    type: 'EXPORT_PACKAGES',
                    status: 'COMPLETED',
                    created_at: '2026-11-17T00:00:00Z',
                    filters: { exportType: 'EXPORT_PACKAGES', format: 'csv' },
                    download_url: 'https://example.com/pkg.csv'
                  },
                  {
                    id: 11,
                    type: 'EXPORT_PACKAGES',
                    status: 'PENDING',
                    created_at: '2026-11-17T00:01:00Z',
                    filters: null
                  }
                ]
              }
            }
          })
        ],
        stubs: commonStubs
      }
    })

    expect(wrapper.text()).toContain('Data Master Paket (CSV)')
    expect(wrapper.text()).toContain('Data Master Paket (XLSX)')
  })
})
