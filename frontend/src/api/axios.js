import axios from 'axios'

const instance = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL, // Ini akan menjadi 'http://localhost:3000/api'
})

/**
 * Interceptor (penjaga) untuk menambahkan token otentikasi
 * secara otomatis ke setiap request yang dikirim.
 */
instance.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token')
    if (token) {
      // Jika token ada, tambahkan ke header Authorization
      config.headers['Authorization'] = `Bearer ${token}`
    }
    return config
  },
  (error) => {
    // Lakukan sesuatu dengan error request
    return Promise.reject(error)
  },
)

// ✅ PERBAIKAN: Pastikan Anda memiliki 'export default' ini.
// Inilah yang menyebabkan error 'doesn't provide an export named: 'default''.
export default instance
