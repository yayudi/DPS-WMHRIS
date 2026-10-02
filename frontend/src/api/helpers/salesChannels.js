import axios from '../axios'

/**
 * Fetch all sales channels
 * @returns {Promise<Array>}
 */
export async function fetchAllSalesChannels() {
  try {
    const response = await axios.get('/sales-channels')
    return response.data.data || []
  } catch (error) {
    console.error('Error saat mengambil data sales channels:', error.response?.data || error.message)
    throw error.response?.data || error
  }
}
