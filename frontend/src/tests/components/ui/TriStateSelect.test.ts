import { mount } from '@vue/test-utils'
import { describe, it, expect } from 'vitest'
import TriStateSelect from '@/components/ui/TriStateSelect.vue'

// FontAwesomeIcon stub
const FontAwesomeIconStub = {
  name: 'FontAwesomeIcon',
  template: '<i class="fa-icon-stub"></i>'
}

describe('TriStateSelect.vue', () => {
  const mountOptions = {
    global: {
      stubs: {
        FontAwesomeIcon: FontAwesomeIconStub,
        Teleport: true
      }
    },
    props: {
      options: [
        { id: 1, label: 'Kategori A' },
        { id: 2, label: 'Kategori B' }
      ],
      trackBy: 'id',
      label: 'label',
      modelValue: { include: [], exclude: [] },
      placeholder: 'Pilih Kategori'
    }
  }

  it('merender placeholder dengan benar saat tidak ada yang dipilih', () => {
    const wrapper = mount(TriStateSelect, mountOptions)
    expect(wrapper.text()).toContain('Pilih Kategori')
  })

  it('menampilkan opsi saat diklik', async () => {
    const wrapper = mount(TriStateSelect, mountOptions)
    
    // Toggle dropdown
    const trigger = wrapper.find('div.cursor-pointer')
    await trigger.trigger('click')

    expect(wrapper.text()).toContain('Kategori A')
    expect(wrapper.text()).toContain('Kategori B')
  })

  it('mengubah status siklus dengan benar (Include / Exclude terpisah)', async () => {
    const wrapper = mount(TriStateSelect, mountOptions)
    
    // Buka dropdown
    await wrapper.find('div.cursor-pointer').trigger('click')

    // Dapatkan opsi pertama
    const options = wrapper.findAll('.select-option')
    const firstOption = options[0] // Kategori A
    const includeBtn = firstOption.findAll('button')[0]
    const excludeBtn = firstOption.findAll('button')[1]
    
    // 1. Klik Include -> Adds to include
    await includeBtn.trigger('click')
    let emitted = wrapper.emitted('update:modelValue')
    expect(emitted[0][0].include).toContain(1)
    expect(emitted[0][0].exclude).not.toContain(1)

    // Update props simulasi parent v-model
    await wrapper.setProps({ modelValue: { include: [1], exclude: [] } })

    // 2. Klik Include lagi -> Removes from include (Netral)
    await includeBtn.trigger('click')
    expect(emitted[1][0].include).not.toContain(1)

    // Update props
    await wrapper.setProps({ modelValue: { include: [], exclude: [] } })

    // 3. Klik Exclude -> Adds to exclude
    await excludeBtn.trigger('click')
    expect(emitted[2][0].exclude).toContain(1)
  })

  it('memfilter opsi dengan fitur pencarian', async () => {
    const wrapper = mount(TriStateSelect, {
      ...mountOptions,
      props: {
        ...mountOptions.props,
        searchable: true
      }
    })

    // Buka dropdown
    await wrapper.find('div.cursor-pointer').trigger('click')

    const input = wrapper.find('input[type="text"]')
    expect(input.exists()).toBe(true)

    // Ketik "Kategori B"
    await input.setValue('Kategori B')

    // Kategori A harus hilang
    expect(wrapper.text()).not.toContain('Kategori A')
    expect(wrapper.text()).toContain('Kategori B')
  })
})
