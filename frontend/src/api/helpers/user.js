import api from '@/api/axios.js'

/**
 * Mengambil lokasi yang diizinkan untuk pengguna saat ini.
 * Berdasarkan rangkuman proyek, endpoint ini adalah /api/user/my-locations
 * @returns {Promise<Array<{id: number, code: string}>>}
 */
export const fetchMyLocations = async () => {
  try {
    const response = await api.get('/user/my-locations') // Path relatif

    // FIX: Pastikan kita selalu mengembalikan array
    if (Array.isArray(response.data)) {
      return response.data
    }
    // Cek jika dibungkus dalam properti 'data'
    if (response.data && Array.isArray(response.data.data)) {
      return response.data.data
    }
    // Fallback jika format tidak dikenal
    console.error('Unexpected response format for my locations:', response.data)
    return [] // Kembalikan array kosong untuk mencegah crash
  } catch (error) {
    console.error('Error fetching my locations:', error)
    throw new Error(error.response?.data?.message || 'Gagal mengambil lokasi saya')
  }
}
