import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { defineComponent } from 'vue'
import { createTestingPinia } from '@pinia/testing'
import { useFirebaseSync } from '@/composables/useFirebaseSync'
import { useFirebaseListener } from '@/composables/useFirebaseListener'

vi.mock('@/composables/useFirebaseListener.js', () => ({
  useFirebaseListener: vi.fn()
}))

describe('useFirebaseSync composable', () => {
  let mockStartListening
  let mockStopListening

  beforeEach(() => {
    vi.clearAllMocks()
    mockStartListening = vi.fn()
    mockStopListening = vi.fn()

    useFirebaseListener.mockReturnValue({
      startListening: mockStartListening,
      stopListening: mockStopListening
    })
  })

  const mountHelper = (setupFn, initialAuthState = { user: { id: 1 } }) => {
    const TestComponent = defineComponent({
      template: '<div></div>',
      setup() {
        setupFn()
        return {}
      }
    })

    return mount(TestComponent, {
      global: {
        plugins: [createTestingPinia({
          createSpy: vi.fn,
          initialState: {
            auth: initialAuthState
          }
        })]
      }
    })
  }

  it('sets up listener on mount and cleans up on unmount', () => {
    const mockCallback = vi.fn()
    
    const wrapper = mountHelper(() => {
      useFirebaseSync('TEST_PERM', 'TEST_ACTION', mockCallback)
    })

    expect(useFirebaseListener).toHaveBeenCalledWith(
      1,
      ['TEST_PERM'],
      expect.any(Function)
    )
    expect(mockStartListening).toHaveBeenCalled()

    wrapper.unmount()
    expect(mockStopListening).toHaveBeenCalled()
  })

  it('handles array of permissions and actions, firing callback appropriately', () => {
    const mockCallback = vi.fn()
    let fireEvent = null

    useFirebaseListener.mockImplementation((userId, perms, cb) => {
      fireEvent = cb
      return { startListening: mockStartListening, stopListening: mockStopListening }
    })

    mountHelper(() => {
      useFirebaseSync(['PERM1', 'PERM2'], ['ACTION_A', 'ACTION_B'], mockCallback)
    })

    expect(useFirebaseListener).toHaveBeenCalledWith(1, ['PERM1', 'PERM2'], expect.any(Function))

    // Valid action
    fireEvent({ action: 'ACTION_A', data: 123 })
    expect(mockCallback).toHaveBeenCalledWith({ action: 'ACTION_A', data: 123 })

    // Another valid action
    fireEvent({ action: 'ACTION_B', data: 456 })
    expect(mockCallback).toHaveBeenCalledWith({ action: 'ACTION_B', data: 456 })

    // Invalid action (should be ignored)
    fireEvent({ action: 'ACTION_C', data: 789 })
    expect(mockCallback).toHaveBeenCalledTimes(2) // Still 2
  })

  it('triggers callback for all actions if actionNames is null', () => {
    const mockCallback = vi.fn()
    let fireEvent = null

    useFirebaseListener.mockImplementation((userId, perms, cb) => {
      fireEvent = cb
      return { startListening: mockStartListening, stopListening: mockStopListening }
    })

    mountHelper(() => {
      useFirebaseSync('PERM', null, mockCallback)
    })

    fireEvent({ action: 'ANY_RANDOM_ACTION', payload: 'test' })
    expect(mockCallback).toHaveBeenCalledWith({ action: 'ANY_RANDOM_ACTION', payload: 'test' })
  })

  it('uses "guest" fallback if user id is unavailable', () => {
    mountHelper(() => {
      useFirebaseSync('PERM', 'ACTION', vi.fn())
    }, { user: null })

    expect(useFirebaseListener).toHaveBeenCalledWith(
      'guest',
      ['PERM'],
      expect.any(Function)
    )
  })
})
