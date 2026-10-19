import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useClipboard } from '@/composables/useClipboard.js'

const mockToast = vi.fn()
vi.mock('@/composables/useToast.js', () => ({
  useToast: () => ({ toast: mockToast })
}))

describe('useClipboard composable', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    delete window.isSecureContext
    delete navigator.clipboard
  })

  it('does nothing when text is empty', () => {
    const { copyToClipboard } = useClipboard()
    copyToClipboard('')
    expect(mockToast).not.toHaveBeenCalled()
  })

  it('uses navigator.clipboard.writeText when in secure context', async () => {
    window.isSecureContext = true
    const writeTextMock = vi.fn().mockResolvedValue(undefined)
    Object.assign(navigator, {
      clipboard: {
        writeText: writeTextMock
      }
    })

    const { copyToClipboard } = useClipboard()
    copyToClipboard('Test text', 'SKU')

    await vi.waitFor(() => {
      expect(writeTextMock).toHaveBeenCalledWith('Test text')
      expect(mockToast).toHaveBeenCalledWith('SKU berhasil disalin ke clipboard!', 'success')
    })
  })

  it('handles custom phrase without double formatting', async () => {
    window.isSecureContext = true
    const writeTextMock = vi.fn().mockResolvedValue(undefined)
    Object.assign(navigator, {
      clipboard: {
        writeText: writeTextMock
      }
    })

    const { copyToClipboard } = useClipboard()
    copyToClipboard('INV-1234', 'Invoice INV-1234 disalin!')

    await vi.waitFor(() => {
      expect(writeTextMock).toHaveBeenCalledWith('INV-1234')
      expect(mockToast).toHaveBeenCalledWith('Invoice INV-1234 disalin!', 'success')
    })
  })
})
