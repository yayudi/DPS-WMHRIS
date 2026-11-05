import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import JobHistoryTable, { type JobItem } from './JobHistoryTable.vue'

vi.mock('@/core/presentation/composables/useDownload', () => ({
  useDownload: () => ({
    openDownloadUrl: vi.fn()
  })
}))

describe('JobHistoryTable.vue', () => {
  const sampleJobs: JobItem[] = [
    {
      id: 1,
      status: 'COMPLETED',
      created_at: '2026-10-30T10:00:00Z',
      original_filename: 'products_export.xlsx',
      type: 'PRODUCT_MASTER',
      download_url: 'https://cdn.example.com/products_export.xlsx'
    },
    {
      id: 2,
      status: 'PROCESSING',
      created_at: '2026-10-30T10:05:00Z',
      file_path: 'uploads/1788406595673-stock.xlsx',
      type: 'STOCK_REPORT'
    },
    {
      id: 3,
      status: 'FAILED',
      created_at: '2026-10-30T10:10:00Z',
      error_message: 'Invalid column header',
      original_filename: 'broken.xlsx'
    }
  ]

  it('renders empty state when jobs array is empty', () => {
    const wrapper = mount(JobHistoryTable, {
      props: { jobs: [], emptyText: 'Tidak ada riwayat.' },
      global: { stubs: { 'font-awesome-icon': true } }
    })
    expect(wrapper.text()).toContain('Tidak ada riwayat.')
  })

  it('renders jobs in list layout by default with appropriate status badges', () => {
    const wrapper = mount(JobHistoryTable, {
      props: { jobs: sampleJobs, layout: 'list' },
      global: { stubs: { 'font-awesome-icon': true } }
    })

    expect(wrapper.text()).toContain('products_export.xlsx')
    expect(wrapper.text()).toContain('Selesai')
    expect(wrapper.text()).toContain('Memproses')
    expect(wrapper.text()).toContain('Gagal')
    expect(wrapper.text()).toContain('Invalid column header')
  })

  it('renders jobs in table layout correctly', () => {
    const wrapper = mount(JobHistoryTable, {
      props: { jobs: sampleJobs, layout: 'table' },
      global: { stubs: { 'font-awesome-icon': true } }
    })

    expect(wrapper.find('table').exists()).toBe(true)
    expect(wrapper.findAll('tbody tr').length).toBe(3)
  })

  it('emits download event when download button is clicked', async () => {
    const wrapper = mount(JobHistoryTable, {
      props: { jobs: sampleJobs, layout: 'list' },
      global: { stubs: { 'font-awesome-icon': true } }
    })

    const downloadBtn = wrapper.find('button')
    expect(downloadBtn.exists()).toBe(true)
    await downloadBtn.trigger('click')

    expect(wrapper.emitted('download')).toBeTruthy()
    expect(wrapper.emitted('download')![0][0]).toEqual(sampleJobs[0])
  })
})

