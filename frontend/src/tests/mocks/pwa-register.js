export const useRegisterSW = () => ({
  needRefresh: { value: false },
  offlineReady: { value: false },
  updateServiceWorker: () => Promise.resolve()
})
