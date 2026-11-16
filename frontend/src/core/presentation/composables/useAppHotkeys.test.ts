import { describe, it, expect, beforeEach, vi } from 'vitest'
import { isLanguageToggleShortcut, useLanguageHotkey } from './useAppHotkeys'

const listeners: Array<(e: KeyboardEvent) => void | Promise<void>> = []
const cycleLocaleMock = vi.fn()
const toastMock = vi.fn()

vi.mock('@vueuse/core', () => ({
  useMagicKeys: vi.fn(() => ({})),
  useEventListener: vi.fn((_event: string, cb: (e: KeyboardEvent) => void) => {
    listeners.push(cb)
  })
}))

vi.mock('./useI18n', () => ({
  useI18n: () => ({
    cycleLocale: cycleLocaleMock,
    t: (key: string, params?: Record<string, string>) =>
      params?.name ? `${key}:${params.name}` : key
  })
}))

vi.mock('./useToast', () => ({
  useToast: () => ({
    toast: toastMock
  })
}))

function createKeyboardEvent(overrides: Partial<KeyboardEvent> = {}): KeyboardEvent {
  return {
    key: 'l',
    code: 'KeyL',
    altKey: false,
    shiftKey: false,
    ctrlKey: false,
    metaKey: false,
    repeat: false,
    isComposing: false,
    preventDefault: vi.fn(),
    ...overrides
  } as unknown as KeyboardEvent
}

describe('isLanguageToggleShortcut', () => {
  it('accepts Alt + L and macOS Option + L (KeyL)', () => {
    expect(isLanguageToggleShortcut(createKeyboardEvent({ altKey: true }))).toBe(true)
    expect(
      isLanguageToggleShortcut(createKeyboardEvent({ altKey: true, key: '¬', code: 'KeyL' }))
    ).toBe(true)
  })

  it('rejects Alt + Shift + L (Logout), AltGr, Ctrl + L, Meta, repeat, and IME composition', () => {
    expect(isLanguageToggleShortcut(createKeyboardEvent({ altKey: true, shiftKey: true }))).toBe(false)
    expect(isLanguageToggleShortcut(createKeyboardEvent({ altKey: true, ctrlKey: true }))).toBe(false)
    expect(isLanguageToggleShortcut(createKeyboardEvent({ altKey: true, metaKey: true }))).toBe(false)
    expect(isLanguageToggleShortcut(createKeyboardEvent({ ctrlKey: true }))).toBe(false)
    expect(isLanguageToggleShortcut(createKeyboardEvent({ altKey: true, key: 't', code: 'KeyT' }))).toBe(false)
    expect(isLanguageToggleShortcut(createKeyboardEvent({ altKey: true, repeat: true }))).toBe(false)
    expect(isLanguageToggleShortcut(createKeyboardEvent({ altKey: true, isComposing: true }))).toBe(false)
  })
})

describe('useLanguageHotkey', () => {
  beforeEach(() => {
    listeners.length = 0
    vi.clearAllMocks()
  })

  it('cycles language and displays confirmation toast on Alt + L', async () => {
    cycleLocaleMock.mockResolvedValueOnce({ code: 'en-US', name: 'English' })
    useLanguageHotkey()

    expect(listeners).toHaveLength(1)
    const event = createKeyboardEvent({ altKey: true })
    await listeners[0](event)

    expect(event.preventDefault).toHaveBeenCalledOnce()
    expect(cycleLocaleMock).toHaveBeenCalledOnce()
    expect(toastMock).toHaveBeenCalledWith('core.locale.switched_toast:English', 'info', 2000)
  })

  it('ignores non-matching shortcuts such as Alt + Shift + L', async () => {
    useLanguageHotkey()

    const logoutEvent = createKeyboardEvent({ altKey: true, shiftKey: true })
    await listeners[0](logoutEvent)

    expect(logoutEvent.preventDefault).not.toHaveBeenCalled()
    expect(cycleLocaleMock).not.toHaveBeenCalled()
    expect(toastMock).not.toHaveBeenCalled()
  })
})
