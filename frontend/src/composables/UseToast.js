// UseToast
import { ref } from "vue"

const toastRef = ref(null)

export function registerToast(toast) {
  toastRef.value = toast
}

export function useToast() {
  const show = (msg, type = "info", duration = 3000) => {
    if (toastRef.value) {
      toastRef.value.showMessage(msg, type, duration)
    } else {
      console.warn("⚠️ Toast belum diregister")
    }
  }
  return { show }
}
