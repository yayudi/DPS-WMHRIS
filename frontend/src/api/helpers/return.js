// frontend/src/api/helpers/return.js
import api from '@/api/axios.js'

export const getPendingReturns = async () => {
  const response = await api.get('/returns/pending')
  return response.data.data
}

export const getReturnHistory = async (params = {}) => {
  const response = await api.get('/returns/history', { params })
  return response.data.data
}

export const approveReturn = async (payload) => {
  // payload: { itemId, qtyAccepted, condition, locationId, notes }
  const response = await api.post('/returns/approve', payload)
  return response.data
}

export const createManualReturn = async (payload) => {
  // payload: { productId, quantity, condition, locationId, reference, notes }
  const response = await api.post('/returns/manual-entry', payload)
  return response.data
}
