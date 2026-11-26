import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import ProductFormModal from '@/modules/wms/presentation/components/shared/ProductFormModal.vue'
import { productApi } from '@/modules/master_data/infrastructure/product.api'

vi.mock('@/modules/master_data/infrastructure/product.api', () => ({
  productApi: {
    getProducts: vi.fn(),
    fetchProductById: vi.fn(),
    searchProducts: vi.fn(),
    createProduct: vi.fn(),
    updateProduct: vi.fn()
  }
}))

vi.mock('@/modules/master_data/application/masterData.store', () => ({
  useMasterDataStore: () => ({
    getCategories: vi.fn().mockResolvedValue([])
  })
}))

describe('ProductFormModal.vue', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.useFakeTimers()
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('memuat detail produk mode edit/duplicate dari hasil fetchProductById tanpa error undefined components', async () => {
    vi.mocked(productApi.fetchProductById).mockResolvedValue({
      id: 10,
      sku: 'PKG-10',
      name: 'Paket Uji',
      category_id: 2,
      price: 50000,
      weight: 200,
      is_package: true,
      components: [{ id: 1, sku: 'CMP-1', name: 'Komponen 1', quantity: 2 }],
      images: [{ media_id: 77 }]
    })
    vi.mocked(productApi.getProducts).mockResolvedValue({ data: [] })

    const wrapper = mount(ProductFormModal, {
      props: {
        show: false,
        mode: 'edit',
        productData: { id: 10 }
      },
      global: {
        stubs: {
          BaseModal: { template: '<div><slot name="title" /><slot /><slot name="footer" /></div>' },
          BaseSelect: true,
          SegmentedControl: true,
          ProductHistoryList: true,
          FontAwesomeIcon: true
        }
      }
    })

    await wrapper.setProps({ show: true })
    await flushPromises()

    expect(productApi.fetchProductById).toHaveBeenCalledWith(10)
    const inputs = wrapper.findAll('input[type="text"]')
    expect((inputs[0].element as HTMLInputElement).value).toBe('PKG-10')
    expect((inputs[1].element as HTMLInputElement).value).toBe('Paket Uji')
    expect(wrapper.text()).toContain('CMP-1')
  })

  it('tidak melempar TypeError saat checkDuplicate berjalan dengan productData bernilai null', async () => {
    vi.mocked(productApi.getProducts).mockResolvedValue({
      data: [
        { id: 1, sku: 'SKU-1', name: 'Produk Satu' },
        { id: 2, sku: 'SKU-2', name: 'Produk Dua' }
      ]
    })

    const wrapper = mount(ProductFormModal, {
      props: {
        show: true,
        mode: 'edit',
        productData: null
      },
      global: {
        stubs: {
          BaseModal: { template: '<div><slot name="title" /><slot /><slot name="footer" /></div>' },
          BaseSelect: true,
          SegmentedControl: true,
          ProductHistoryList: true,
          FontAwesomeIcon: true
        }
      }
    })

    await flushPromises()

    const inputs = wrapper.findAll('input[type="text"]')
    await inputs[1].setValue('Produk Satu')
    await vi.advanceTimersByTimeAsync(600)
    await flushPromises()

    expect(wrapper.text()).toContain('Nama produk ini sudah ada!')
  })

  it('mengirim component_product_id dan quantity saat mengubah produk tunggal menjadi paket', async () => {
    vi.mocked(productApi.fetchProductById).mockResolvedValue({
      id: 6740,
      sku: 'PP0006740',
      name: 'Produk Uji Tunggal',
      category_id: 2,
      price: 25000,
      weight: 100,
      length: 10,
      width: 5,
      height: 2,
      is_package: false,
      components: []
    })
    vi.mocked(productApi.getProducts).mockResolvedValue({ data: [] })
    vi.mocked(productApi.searchProducts).mockResolvedValue([
      { id: 101, sku: 'PP0006741', name: 'Komponen Uji 1' }
    ])
    vi.mocked(productApi.updateProduct).mockResolvedValue({})

    const wrapper = mount(ProductFormModal, {
      props: {
        show: false,
        mode: 'edit',
        productData: { id: 6740 }
      },
      global: {
        stubs: {
          BaseModal: { template: '<div><slot name="title" /><slot /><slot name="footer" /></div>' },
          BaseSelect: true,
          SegmentedControl: {
            props: ['modelValue', 'options'],
            emits: ['update:modelValue'],
            template: '<button data-test="toggle-package" @click="$emit(\'update:modelValue\', true)">Paket</button>'
          },
          ProductHistoryList: true,
          FontAwesomeIcon: true
        }
      }
    })

    await wrapper.setProps({ show: true })
    await flushPromises()

    await wrapper.find('[data-test="toggle-package"]').trigger('click')
    await flushPromises()

    const searchInput = wrapper.findAll('input[type="text"]').at(-1)!
    await searchInput.setValue('PP0006741')
    await vi.advanceTimersByTimeAsync(350)
    await flushPromises()

    await wrapper.find('.cursor-pointer').trigger('click')
    await flushPromises()

    const saveBtn = wrapper.findAll('button').at(-1)!
    await saveBtn.trigger('click')
    await flushPromises()

    expect(productApi.updateProduct).toHaveBeenCalledWith(
      6740,
      expect.objectContaining({
        sku: 'PP0006740',
        is_package: true,
        components: [{ component_product_id: 101, quantity: 1 }]
      })
    )
  })
})
