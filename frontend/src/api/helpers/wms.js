import axios from '../axios' // Impor instance Axios terpusat kita

export async function fetchAllProducts() {
  try {
    const response = await axios.get('json/wms/stok.json')

    if (Array.isArray(response.data)) {
      return response.data
    } else {
      console.warn('Data stok yang diterima bukan array:', response.data)
      return []
    }
  } catch (error) {
    console.error('Gagal mengambil produk WMS:', error)
    throw error
  }
}
