import { http } from '@/core/infrastructure/http.client'
import type { CreateRolePayload, UpdateRolePayload } from '../domain/role.entity'

export const roleApi = {
  /**
   * Mengambil daftar semua peran
   */
  fetchAllRoles(): Promise<any> {
    return http.get('/admin/roles')
  },
  
  /**
   * Membuat peran baru
   */
  createRole(payload: CreateRolePayload): Promise<any> {
    return http.post('/admin/roles', payload)
  },

  /**
   * Memperbarui peran
   */
  updateRole(id: number, payload: UpdateRolePayload): Promise<any> {
    return http.put(`/admin/roles/${id}`, payload)
  },

  /**
   * Menghapus peran
   */
  deleteRole(id: number): Promise<any> {
    return http.delete(`/admin/roles/${id}`)
  },

  /**
   * Mengambil daftar semua izin (permissions)
   */
  fetchAllPermissions(): Promise<any> {
    return http.get('/admin/roles/permissions')
  },

  /**
   * Mengambil ID izin yang dimiliki oleh peran tertentu
   */
  fetchRolePermissions(roleId: number): Promise<any> {
    return http.get(`/admin/roles/${roleId}/permissions`)
  },

  /**
   * Memperbarui izin untuk peran tertentu
   */
  updateRolePermissions(roleId: number, permissionIds: number[]): Promise<any> {
    return http.put(`/admin/roles/${roleId}/permissions`, { permissionIds })
  }
}
