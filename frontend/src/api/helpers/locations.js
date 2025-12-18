// frontend\src\api\helpers\locations.js
import axios from '../axios'

/**
 * Mengambil semua lokasi dari server.
 * @returns {Promise<Array>}
 */
export async function fetchAllLocations() {
  try {
    const response = await axios.get('/locations')
    return response.data.data || []
  } catch (error) {
    console.error('Error saat mengambil data lokasi:', error.response?.data || error.message)
    throw error.response?.data || error
  }
}

/**
 * Membuat lokasi baru.
 * @param {object} locationData - Data lokasi baru { code, building, floor, name }.
 * @returns {Promise<object>}
 */
export async function createLocation(locationData) {
  try {
    const response = await axios.post('/locations', locationData)
    return response.data
  } catch (error) {
    console.error('Error saat membuat lokasi:', error.response?.data || error.message)
    throw error.response?.data || error
  }
}

/**
 * Mengedit lokasi yang sudah ada.
 * @param {number} id - ID lokasi.
 * @param {object} locationData - Data lokasi yang diperbarui.
 * @returns {Promise<object>}
 */
export async function updateLocation(id, locationData) {
  try {
    const response = await axios.put(`/locations/${id}`, locationData)
    return response.data
  } catch (error) {
    console.error('Error saat mengedit lokasi:', error.response?.data || error.message)
    throw error.response?.data || error
  }
}

/**
 * Menghapus sebuah lokasi.
 * @param {number} id - ID lokasi.
 * @returns {Promise<object>}
 */
export async function deleteLocation(id) {
  try {
    const response = await axios.delete(`/locations/${id}`)
    return response.data
  } catch (error) {
    console.error('Error saat menghapus lokasi:', error.response?.data || error.message)
    throw error.response?.data || error
  }
}
