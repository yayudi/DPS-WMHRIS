// frontend\src\api\helpers\roles.js
import axios from '../axios'

/**
 * Mengambil semua peran (roles).
 * @returns {Promise<Array>}
 */
export async function fetchAllRoles() {
  try {
    const response = await axios.get('/admin/roles')
    return response.data.data || []
  } catch (error) {
    console.error('Error saat mengambil semua peran:', error.response?.data || error.message)
    throw error.response?.data || error
  }
}

/**
 * Mengambil semua izin (permissions).
 * Diharapkan mengembalikan data dengan properti 'group'.
 * @returns {Promise<Array>}
 */
export async function fetchAllPermissions() {
  try {
    const response = await axios.get('/admin/roles/permissions')
    // Asumsi backend mengembalikan: { success: true, data: [...] }
    // Asumsi data: { id, name, description, group }
    return response.data.data || []
  } catch (error) {
    console.error('Error saat mengambil semua izin:', error.response?.data || error.message)
    throw error.response?.data || error
  }
}

/**
 * Mengambil ID izin (permission IDs) untuk peran spesifik.
 * @param {number} roleId
 * @returns {Promise<Array<number>>}
 */
export async function fetchRolePermissions(roleId) {
  try {
    const response = await axios.get(`/admin/roles/${roleId}/permissions`)
    // Asumsi backend mengembalikan: { success: true, data: [1, 5, 12] }
    return response.data.data || []
  } catch (error) {
    console.error('Error saat mengambil izin peran:', error.response?.data || error.message)
    throw error.response?.data || error
  }
}

/**
 * Memperbarui izin (permissions) untuk peran spesifik.
 * @param {number} roleId
 * @param {Array<number>} permissionIds
 * @returns {Promise<object>}
 */
export async function updateRolePermissions(roleId, permissionIds) {
  try {
    const response = await axios.put(`/admin/roles/${roleId}/permissions`, {
      permissionIds: permissionIds,
    })
    return response.data
  } catch (error) {
    console.error('Error saat memperbarui izin peran:', error.response?.data || error.message)
    throw error.response?.data || error
  }
}

// --- FUNGSI BARU UNTUK CRUD ROLE ---

/**
 * Membuat peran (role) baru.
 * @param {object} roleData - { name, description }
 * @returns {Promise<object>}
 */
export async function createRole(roleData) {
  try {
    const response = await axios.post('/admin/roles', roleData)
    return response.data
  } catch (error) {
    console.error('Error saat membuat peran:', error.response?.data || error.message)
    throw error.response?.data || error
  }
}

/**
 * Memperbarui data peran (role).
 * @param {number} roleId
 * @param {object} roleData - { name, description }
 * @returns {Promise<object>}
 */
export async function updateRole(roleId, roleData) {
  try {
    const response = await axios.put(`/admin/roles/${roleId}`, roleData)
    return response.data
  } catch (error) {
    console.error('Error saat memperbarui peran:', error.response?.data || error.message)
    throw error.response?.data || error
  }
}

/**
 * Menghapus peran (role).
 * @param {number} roleId
 * @returns {Promise<object>}
 */
export async function deleteRole(roleId) {
  try {
    const response = await axios.delete(`/admin/roles/${roleId}`)
    return response.data
  } catch (error) {
    console.error('Error saat menghapus peran:', error.response?.data || error.message)
    throw error.response?.data || error
  }
}
