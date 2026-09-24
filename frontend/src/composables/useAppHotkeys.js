// frontend\src\composables\useAppHotkeys.js
import { ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useMagicKeys } from '@vueuse/core'
import { useTheme } from './useTheme'
import { useAuthStore } from '../stores/auth'
import Swal from 'sweetalert2'

export const isCheatSheetOpen = ref(false)

export function useAppHotkeys(emitLogout) {
  const router = useRouter()
  const auth = useAuthStore()
  const { themes, currentTheme, applyTheme } = useTheme()
  const { Escape, Alt_1, Alt_2, Alt_3, Alt_4, Alt_5, Alt_H, Alt_T, Alt_Q, Alt_Shift_L, Enter } = useMagicKeys()

  // Navigation
  watch(Alt_H, pressed => {
    if (pressed) router.push('/guide')
  })

  // Cycle Theme
  watch(Alt_T, pressed => {
    if (pressed) {
      const currentIndex = themes.indexOf(currentTheme.value)
      const nextIndex = (currentIndex + 1) % themes.length
      applyTheme(themes[nextIndex])
    }
  })

  watch(Escape, pressed => {
    if (pressed) {
      isCheatSheetOpen.value = false
    }
  })

  // Navigation
  watch(Alt_1, pressed => {
    if (pressed) router.push('/wms')
  })
  watch(Alt_2, pressed => {
    if (pressed && auth.hasPermission('product.image.view')) router.push('/media')
  })
  watch(Alt_3, pressed => {
    if (pressed) router.push('/absensi')
  })
  watch(Alt_4, pressed => {
    if (pressed && auth.hasPermission('report.view')) router.push('/stats')
  })
  watch(Alt_5, pressed => {
    if (pressed && auth.hasPermission('user.manage')) router.push('/admin/users')
  })

  // Toggle Cheat Sheet
  watch(Alt_Q, pressed => {
    if (pressed) {
      isCheatSheetOpen.value = !isCheatSheetOpen.value
    }
  })

  // Logout
  watch(Alt_Shift_L, pressed => {
    if (pressed) {
      emitLogout && emitLogout()
    }
  })

  // SweetAlert2 Global Hotkeys (swalConfirm / swalAlert)
  watch(Enter, pressed => {
    if (pressed) {
      if (['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName)) return
      if (Swal.isVisible()) Swal.clickConfirm()
    }
  })

  return {
    isCheatSheetOpen
  }
}
