import { mount } from '@vue/test-utils'
import { describe, it, expect } from 'vitest'
import FilterBar from '@/components/ui/FilterBar.vue'

// Custom stub for BaseFilterPanel to render slots
const BaseFilterPanelStub = {
  template: `
    <div>
      <div class="mock-search"><slot name="search" /></div>
      <div class="mock-tabs"><slot name="tabs" /></div>
      <div class="mock-header"><slot name="header" /></div>
      <div class="mock-actions"><slot name="actions" /></div>
      <div class="mock-filters"><slot name="filters" /></div>
    </div>
  `
}

describe('FilterBar.vue', () => {
  const mountOptions = {
    global: {
      stubs: {
        BaseFilterPanel: BaseFilterPanelStub,
        DateRangeFilter: true,
        BaseSelect: true,
        TriStateSelect: true,
        FontAwesomeIcon: true
      }
    },
    props: {
      title: 'Test Filter',
      filters: [],
      modelValue: {}
    }
  }

  it('merender slot forwarding dengan benar', () => {
    const wrapper = mount(FilterBar, {
      ...mountOptions,
      slots: {
        search: '<span class="test-search">Search Slot</span>',
        tabs: '<span class="test-tabs">Tabs Slot</span>',
        header: '<span class="test-header">Header Slot</span>',
        actions: '<span class="test-actions">Actions Slot</span>'
      }
    })

    expect(wrapper.find('.mock-search .test-search').exists()).toBe(true)
    expect(wrapper.find('.mock-tabs .test-tabs').exists()).toBe(true)
    expect(wrapper.find('.mock-header .test-header').exists()).toBe(true)
    expect(wrapper.find('.mock-actions .test-actions').exists()).toBe(true)
  })

  it('merender daftar filter sesuai props', () => {
    const wrapper = mount(FilterBar, {
      ...mountOptions,
      props: {
        ...mountOptions.props,
        filters: [
          { type: 'daterange', keyStart: 'startDate', keyEnd: 'endDate', label: 'Tanggal' },
          { type: 'select', key: 'status', label: 'Status', options: [] }
        ]
      }
    })

    // Check if DateRangeFilter and BaseSelect stubs are rendered
    expect(wrapper.find('date-range-filter-stub').exists()).toBe(true)
    expect(wrapper.find('base-select-stub').exists()).toBe(true)
    expect(wrapper.text()).toContain('Tanggal')
    expect(wrapper.text()).toContain('Status')
  })

  it('menerbitkan (emit) event update:modelValue dan change saat local value berubah', async () => {
    const wrapper = mount(FilterBar, {
      ...mountOptions,
      props: {
        ...mountOptions.props,
        modelValue: { status: 'all' },
        filters: [
          { type: 'select', key: 'status', label: 'Status', options: [] }
        ]
      }
    })

    // Trigger update on BaseSelect stub
    const selectStub = wrapper.findComponent({ name: 'BaseSelect' })
    await selectStub.vm.$emit('update:modelValue', 'active')

    // Harus emit dua-duanya
    expect(wrapper.emitted('update:modelValue')).toBeTruthy()
    expect(wrapper.emitted('change')).toBeTruthy()
    expect(wrapper.emitted('update:modelValue')[0][0]).toEqual({ status: 'active' })
    expect(wrapper.emitted('change')[0][0]).toEqual({ status: 'active' })
  })

  it('tersinkronisasi jika props modelValue berubah dari luar', async () => {
    const wrapper = mount(FilterBar, {
      ...mountOptions,
      props: {
        ...mountOptions.props,
        modelValue: { status: 'all' },
        filters: [
          { type: 'select', key: 'status', label: 'Status', options: [] }
        ]
      }
    })

    await wrapper.setProps({ modelValue: { status: 'inactive' } })
    
    // Validasi localValues dengan cara nge-emit sesuatu dari luar 
    // Atau bisa dicek melalui state v-model yang dipass ke child
    const selectStub = wrapper.findComponent({ name: 'BaseSelect' })
    expect(selectStub.props('modelValue')).toBe('inactive')
  })
})
