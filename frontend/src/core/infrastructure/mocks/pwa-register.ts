import { ref } from 'vue'

export function useRegisterSW() {
  const needRefresh = ref(false)
  const updateServiceWorker = async () => {}
  return {
    needRefresh,
    updateServiceWorker
  }
}
