import axios from '../axios'

/**
 * Mengambil daftar semua pengguna dari server.
 * @returns {Promise<Array>}
 */
export async function fetchAllUsers() {
  try {
    const response = await axios.get('/admin/users')
    return response.data.users || []
  } catch (error) {
    console.error('Error fetching all users:', error.response?.data || error.message)
    throw error.response?.data || error
  }
}

/**
 * Mengambil daftar semua peran (roles) dari server.
 * @returns {Promise<Array>} Array berisi objek peran { id, name }.
 */
export async function fetchRoles() {
  try {
    const response = await axios.get('/admin/users/roles')
    return response.data.roles || response.data.data || []
  } catch (error) {
    console.error('Gagal mengambil data peran:', error)
    throw error
  }
}

/**
 * Mengambil daftar semua peran (roles) dari server.
 * @returns {Promise<Array>}
 */
export async function fetchAllRoles() {
  try {
    const response = await axios.get('/admin/roles')
    return response.data.data || []
  } catch (error) {
    console.error('Error fetching roles:', error.response?.data || error.message)
    throw error.response?.data || error
  }
}

/**
 * Mengirim data pengguna baru ke server untuk dibuat.
 * @param {object} userData - Objek berisi { username, password, role_id, nickname }.
 */
export async function createUser(userData) {
  try {
    const response = await axios.post('/admin/users', userData)
    return response.data
  } catch (error) {
    console.error('Gagal membuat pengguna:', error)
    throw error
  }
}

/**
 * Mengirim data pengguna yang diperbarui ke server.
 * @param {number} userId - ID pengguna yang akan diubah.
 * @param {object} userData - Objek berisi { username, nickname, role_id, newPassword? }.
 */
export async function updateUser(userId, userData) {
  try {
    const response = await axios.put(`/admin/users/${userId}`, userData)
    return response.data
  } catch (error) {
    console.error('Gagal mengupdate pengguna:', error)
    throw error
  }
}

/**
 * Menghapus pengguna dari server.
 * @param {number} userId - ID pengguna yang akan dihapus.
 * @returns {Promise<object>}
 */
export async function deleteUser(userId) {
  try {
    const response = await axios.delete(`/admin/users/${userId}`)
    return response.data
  } catch (error) {
    console.error('Gagal menghapus pengguna:', error)
    throw error
  }
}

/**
 * Mengambil ID lokasi yang diizinkan untuk pengguna tertentu.
 * @param {number} userId - ID pengguna.
 * @returns {Promise<Array>} - Array berisi ID lokasi.
 */
export async function fetchUserLocationIds(userId) {
  try {
    const response = await axios.get(`/admin/users/${userId}/locations`)
    return response.data.data || []
  } catch (error) {
    console.error('Error fetching user locations:', error.response?.data || error.message)
    throw error.response?.data || error
  }
}

/**
 * Memperbarui izin lokasi untuk pengguna tertentu.
 * @param {number} userId - ID pengguna.
 * @param {Array<number>} locationIds - Array baru berisi ID lokasi yang diizinkan.
 * @returns {Promise<object>}
 */
export async function updateUserLocations(userId, locationIds) {
  try {
    const response = await axios.put(`/admin/users/${userId}/locations`, { locationIds })
    return response.data
  } catch (error) {
    console.error('Error updating user locations:', error.response?.data || error.message)
    throw error.response?.data || error
  }
}

/**
 * Mengambil daftar semua izin (permissions) yang tersedia.
 * @returns {Promise<Array>}
 */
export async function fetchAllPermissions() {
  try {
    const response = await axios.get('/admin/roles/permissions')
    return response.data.data || []
  } catch (error) {
    console.error('Error fetching permissions:', error.response?.data || error.message)
    throw error.response?.data || error
  }
}

/**
 * Mengambil ID izin yang dimiliki oleh sebuah peran.
 * @param {number} roleId - ID peran.
 * @returns {Promise<Array>}
 */
export async function fetchRolePermissions(roleId) {
  try {
    const response = await axios.get(`/admin/roles/${roleId}/permissions`)
    return response.data.data || []
  } catch (error) {
    console.error('Error fetching role permissions:', error.response?.data || error.message)
    throw error.response?.data || error
  }
}

/**
 * Memperbarui izin untuk sebuah peran.
 * @param {number} roleId - ID peran.
 * @param {Array<number>} permissionIds - Array baru berisi ID izin.
 * @returns {Promise<object>}
 */
export async function updateRolePermissions(roleId, permissionIds) {
  try {
    const response = await axios.put(`/admin/roles/${roleId}/permissions`, { permissionIds })
    return response.data
  } catch (error) {
    console.error('Error updating role permissions:', error.response?.data || error.message)
    throw error.response?.data || error
  }
}
