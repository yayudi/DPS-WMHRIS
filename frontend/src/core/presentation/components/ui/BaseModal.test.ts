import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { describe, it, expect, beforeEach } from 'vitest'
import BaseModal from '@/core/presentation/components/ui/BaseModal.vue'

describe('BaseModal.vue', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('menggunakan z-[7000] sebagai zIndexClass default agar dropdown z-[9999] tampil di atas modal', () => {
    const wrapper = mount(BaseModal, {
      props: { show: true, title: 'Uji Modal' }
    })

    const backdrop = wrapper.find('.fixed.inset-0')
    expect(backdrop.exists()).toBe(true)
    expect(backdrop.classes()).toContain('z-[7000]')
  })

  it('mendukung override prop zIndexClass untuk kebutuhan modal bertumpuk', () => {
    const wrapper = mount(BaseModal, {
      props: { show: true, title: 'Modal Nested', zIndexClass: 'z-[8000]' }
    })

    const backdrop = wrapper.find('.fixed.inset-0')
    expect(backdrop.classes()).toContain('z-[8000]')
    expect(backdrop.classes()).not.toContain('z-[7000]')
  })
})
