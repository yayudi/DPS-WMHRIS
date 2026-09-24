import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useFulfilmentStore = defineStore('fulfilment', () => {
  const selectedInvoice = ref(null)

  function setSelectedInvoice(inv) {
    selectedInvoice.value = inv
  }

  function clearSelectedInvoice() {
    selectedInvoice.value = null
  }

  return {
    selectedInvoice,
    setSelectedInvoice,
    clearSelectedInvoice
  }
})
