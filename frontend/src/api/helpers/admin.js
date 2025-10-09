import api from '../axios' // Instance axios terpusat

/**
 * Mengambil daftar semua peran (roles) dari server.
 * @returns {Promise<Array>} Array berisi objek peran { id, name }.
 */
export async function fetchRoles() {
  try {
    const response = await api.get('/admin/users/roles')
    return response.data.data
  } catch (error) {
    console.error('Gagal mengambil data peran:', error)
    throw error
  }
}

/**
 * Mengirim data pengguna baru ke server untuk dibuat.
 * @param {object} userData - Objek berisi { username, password, role_id }.
 * @returns {Promise<object>} Respons dari server.
 */
export async function createUser(userData) {
  try {
    const response = await api.post('/admin/users', userData)
    return response.data
  } catch (error) {
    console.error('Gagal membuat pengguna:', error)
    throw error
  }
}
